import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { jobs, stripeEvents, subscriptions } from '@licitaclima/db';
import { applyStripeEvent } from '@licitaclima/integrations';
import { buildServer } from '../server.js';
import { createTestDb, type TestDb } from '../lib/test-db.js';
import { loginAs, makeActiveSubscription } from './test-helpers.js';

// Claves de test FALSAS (solo para firmar webhooks en el test; no son reales).
process.env.STRIPE_SECRET_KEY = 'sk_test_falso_solo_test_0000000000000000';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_falso_solo_test_0000000000000000';
process.env.STRIPE_PRICE_ID = 'price_test_falso_0000000000000000';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function signEvent(payload: Record<string, unknown>): { body: string; signature: string } {
  const body = JSON.stringify(payload);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: process.env.STRIPE_WEBHOOK_SECRET!,
  });
  return { body, signature };
}

function stripeEvent(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'evt_test_1',
    object: 'event',
    api_version: '2025-01-01',
    created: 1794000000,
    type: 'checkout.session.completed',
    data: { object: {} },
    ...overrides,
  };
}

let t: TestDb;
let app: ReturnType<typeof buildServer>;
beforeAll(async () => {
  t = await createTestDb();
  app = buildServer({ db: t.db });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await t.cleanup();
});

describe('facturación Stripe (solo test)', () => {
  it('GET /billing/subscription: free, plan 49 €, cuota 10/100', async () => {
    const { cookie } = await loginAs(app, t.db, 'billing-free@example.es');
    const res = await app.inject({ method: 'GET', url: '/api/v1/billing/subscription', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.subscription.status).toBe('free');
    expect(body.plan.priceEurExclTax).toBe(49);
    expect(body.quota.analyses.limit).toBe(10);
    expect(body.quota.chat.limit).toBe(100);
    expect(body.stripe.status).toBe('configured'); // claves falsas de test en este fichero
  });

  it('webhook checkout.session.completed: persiste, encola y el worker aplica → active', async () => {
    const { cookie, organizationId } = await loginAs(app, t.db, 'billing-pago@example.es');
    const event = stripeEvent({
      id: 'evt_checkout_1',
      created: 1794000100,
      data: {
        object: {
          id: 'cs_test_1',
          customer: 'cus_test_pago',
          subscription: 'sub_test_pago',
          metadata: { organizationId },
        },
      },
    });
    const { body, signature } = signEvent(event);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/stripe',
      headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ received: true });
    const [stored] = await t.db.select().from(stripeEvents).where(eq(stripeEvents.eventId, 'evt_checkout_1')).limit(1);
    expect(stored).toBeDefined();
    expect(stored.processedAt).toBeNull();
    const [job] = await t.db.select().from(jobs).where(eq(jobs.type, 'stripe_event')).limit(1);
    expect(job).toBeDefined();
    // El worker aplica el evento encolado.
    const applied = await applyStripeEvent(t.db, stored.payload as never);
    expect(applied).toEqual({ applied: true, reason: 'subscription_created' });
    const [sub] = await t.db.select().from(subscriptions).where(eq(subscriptions.organizationId, organizationId)).limit(1);
    expect(sub.status).toBe('active');
    expect(sub.stripeSubscriptionId).toBe('sub_test_pago');
    // Duplicado: el mismo evento no se reprocesa.
    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/stripe',
      headers: { 'stripe-signature': signature, 'content-type': 'application/json' },
      payload: body,
    });
    expect(dup.json()).toEqual({ received: true, duplicate: true });
    expect((await applyStripeEvent(t.db, stored.payload as never)).reason).toBe('duplicate');
    void cookie;
  });

  it('webhook con firma no válida → 400 invalid_signature', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/stripe',
      headers: { 'stripe-signature': 't=1,v1=mala', 'content-type': 'application/json' },
      payload: JSON.stringify(stripeEvent({ id: 'evt_malo' })),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('invalid_signature');
  });

  it('invoice.payment_failed → past_due; invoice.paid → active', async () => {
    const { organizationId } = await loginAs(app, t.db, 'billing-fallo@example.es');
    const sub = await makeActiveSubscription(t.db, organizationId);
    const failed = await applyStripeEvent(t.db, stripeEvent({
      id: 'evt_fail_1',
      type: 'invoice.payment_failed',
      created: 1794000200,
      data: { object: { id: 'in_1', customer: sub.stripeCustomerId, subscription: sub.stripeSubscriptionId } },
    }) as never);
    expect(failed.applied).toBe(true);
    let [row] = await t.db.select().from(subscriptions).where(eq(subscriptions.id, sub.id)).limit(1);
    expect(row.status).toBe('past_due');
    const paid = await applyStripeEvent(t.db, stripeEvent({
      id: 'evt_paid_1',
      type: 'invoice.paid',
      created: 1794000300,
      data: { object: { id: 'in_2', customer: sub.stripeCustomerId, subscription: sub.stripeSubscriptionId } },
    }) as never);
    expect(paid.applied).toBe(true);
    [row] = await t.db.select().from(subscriptions).where(eq(subscriptions.id, sub.id)).limit(1);
    expect(row.status).toBe('active');
  });

  it('eventos fuera de orden: el antiguo no sobrescribe al nuevo; deleted → ended', async () => {
    const { organizationId } = await loginAs(app, t.db, 'billing-orden@example.es');
    const sub = await makeActiveSubscription(t.db, organizationId);
    const newer = await applyStripeEvent(t.db, stripeEvent({
      id: 'evt_upd_new',
      type: 'customer.subscription.updated',
      created: 1794000500,
      data: {
        object: {
          id: sub.stripeSubscriptionId,
          status: 'active',
          cancel_at_period_end: true,
          current_period_start: 1794000000,
          current_period_end: 1797000000,
        },
      },
    }) as never);
    expect(newer).toEqual({ applied: true, reason: 'subscription_updated' });
    let [row] = await t.db.select().from(subscriptions).where(eq(subscriptions.id, sub.id)).limit(1);
    expect(row.status).toBe('canceled_at_period_end');
    const stale = await applyStripeEvent(t.db, stripeEvent({
      id: 'evt_upd_old',
      type: 'customer.subscription.updated',
      created: 1794000400,
      data: {
        object: {
          id: sub.stripeSubscriptionId,
          status: 'active',
          cancel_at_period_end: false,
          current_period_start: 1794000000,
          current_period_end: 1797000000,
        },
      },
    }) as never);
    expect(stale).toEqual({ applied: false, reason: 'stale_event' });
    [row] = await t.db.select().from(subscriptions).where(eq(subscriptions.id, sub.id)).limit(1);
    expect(row.status).toBe('canceled_at_period_end');
    const deleted = await applyStripeEvent(t.db, stripeEvent({
      id: 'evt_del_1',
      type: 'customer.subscription.deleted',
      created: 1794000600,
      data: { object: { id: sub.stripeSubscriptionId, status: 'canceled' } },
    }) as never);
    expect(deleted.applied).toBe(true);
    [row] = await t.db.select().from(subscriptions).where(eq(subscriptions.id, sub.id)).limit(1);
    expect(row.status).toBe('ended');
  });

  it('cancelar mantiene acceso hasta final pagado (canceled_at_period_end)', async () => {
    const { organizationId } = await loginAs(app, t.db, 'billing-cancel@example.es');
    const sub = await makeActiveSubscription(t.db, organizationId);
    const updated = await applyStripeEvent(t.db, stripeEvent({
      id: 'evt_cancel_1',
      type: 'customer.subscription.updated',
      created: 1794000700,
      data: {
        object: {
          id: sub.stripeSubscriptionId,
          status: 'active',
          cancel_at_period_end: true,
          current_period_start: 1794000000,
          current_period_end: 1797000000,
        },
      },
    }) as never);
    expect(updated.applied).toBe(true);
    const [row] = await t.db.select().from(subscriptions).where(eq(subscriptions.id, sub.id)).limit(1);
    expect(row.status).toBe('canceled_at_period_end');
    expect(row.cancelAtPeriodEnd).toBe(true);
  });
});
