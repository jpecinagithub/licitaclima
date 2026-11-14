import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { subscriptions } from '@licitaclima/db';
import { createTestDb, type TestDb } from '@licitaclima/db/src/test-utils.js';
import {
  applyStripeEvent,
  createCheckoutSession,
  hasAccess,
  mapStripeSubscriptionStatus,
  stripeStatus,
} from './stripe.js';
import { ensurePlan } from './stripe.js';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.cleanup();
});

const savedEnv = { ...process.env };
afterEach(() => {
  process.env = { ...savedEnv };
});

describe('adaptador Stripe', () => {
  it('sin claves → pending; clave live → live_blocked; test completa → configured', () => {
    expect(stripeStatus({})).toBe('pending');
    expect(stripeStatus({ STRIPE_SECRET_KEY: 'sk_live_xxx' })).toBe('live_blocked');
    expect(stripeStatus({ STRIPE_SECRET_KEY: 'sk_test_xxx' })).toBe('pending');
    expect(
      stripeStatus({
        STRIPE_SECRET_KEY: 'sk_test_xxx',
        STRIPE_WEBHOOK_SECRET: 'whsec_xxx',
        STRIPE_PRICE_ID: 'price_xxx',
      }),
    ).toBe('configured');
  });

  it('createCheckoutSession sin configurar lanza stripe_not_configured (sin inventar claves)', async () => {
    await expect(createCheckoutSession({ organizationId: 'x', email: 'a@example.es', successUrl: 'https://example.es/ok', cancelUrl: 'https://example.es/no' }, {})).rejects.toMatchObject({
      code: 'stripe_not_configured',
    });
  });

  it('mapStripeSubscriptionStatus: estados del prompt §10', () => {
    expect(mapStripeSubscriptionStatus({ status: 'active' })).toBe('active');
    expect(mapStripeSubscriptionStatus({ status: 'trialing' })).toBe('active');
    expect(mapStripeSubscriptionStatus({ status: 'active', cancel_at_period_end: true })).toBe('canceled_at_period_end');
    expect(mapStripeSubscriptionStatus({ status: 'past_due' })).toBe('past_due');
    expect(mapStripeSubscriptionStatus({ status: 'canceled' })).toBe('ended');
    expect(mapStripeSubscriptionStatus({ status: 'incomplete_expired' })).toBe('ended');
  });

  it('hasAccess: activa sí, past_due en gracia sí, ended/free no', () => {
    const now = new Date('2026-11-14T12:00:00Z');
    expect(hasAccess({ status: 'active', currentPeriodEnd: null }, now)).toBe(true);
    expect(hasAccess({ status: 'canceled_at_period_end', currentPeriodEnd: new Date('2026-11-01T00:00:00Z') }, now)).toBe(true);
    expect(hasAccess({ status: 'past_due', currentPeriodEnd: new Date('2026-11-12T00:00:00Z') }, now)).toBe(true);
    expect(hasAccess({ status: 'past_due', currentPeriodEnd: new Date('2026-11-10T00:00:00Z') }, now)).toBe(false);
    expect(hasAccess({ status: 'ended', currentPeriodEnd: new Date('2026-12-01T00:00:00Z') }, now)).toBe(false);
    expect(hasAccess({ status: 'free', currentPeriodEnd: null }, now)).toBe(false);
  });

  it('applyStripeEvent: checkout crea la suscripción; duplicado y stale no se reprocesan', async () => {
    const { organizations } = await import('@licitaclima/db');
    const [org] = await t.db.insert(organizations).values({ name: 'Stripe Test SL', slug: 'stripe-test' }).returning();
    const plan = await ensurePlan(t.db);
    expect(plan).toBeDefined();
    const checkout = {
      id: 'evt_int_1',
      type: 'checkout.session.completed',
      created: 1794000000,
      data: { object: { customer: 'cus_int_1', subscription: 'sub_int_1', metadata: { organizationId: org.id } } },
    };
    expect(await applyStripeEvent(t.db, checkout as never)).toEqual({ applied: true, reason: 'subscription_created' });
    const [sub] = await t.db.select().from(subscriptions).where(eq(subscriptions.organizationId, org.id)).limit(1);
    expect(sub.status).toBe('active');
    expect(sub.stripeSubscriptionId).toBe('sub_int_1');
    expect(await applyStripeEvent(t.db, checkout as never)).toEqual({ applied: false, reason: 'duplicate' });
    // Evento antiguo tras uno nuevo: stale.
    const newer = {
      id: 'evt_int_2',
      type: 'customer.subscription.updated',
      created: 1794000500,
      data: { object: { id: 'sub_int_1', status: 'active', cancel_at_period_end: true, current_period_start: 1794000000, current_period_end: 1797000000 } },
    };
    expect(await applyStripeEvent(t.db, newer as never)).toEqual({ applied: true, reason: 'subscription_updated' });
    const older = { ...newer, id: 'evt_int_3', created: 1794000100, data: { object: { ...(newer.data.object as Record<string, unknown>), cancel_at_period_end: false } } };
    expect(await applyStripeEvent(t.db, older as never)).toEqual({ applied: false, reason: 'stale_event' });
    const [after] = await t.db.select().from(subscriptions).where(eq(subscriptions.id, sub.id)).limit(1);
    expect(after.status).toBe('canceled_at_period_end');
  });
});
