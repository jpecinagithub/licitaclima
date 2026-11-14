import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { organizations, stripeEvents, subscriptions } from '@licitaclima/db';
import { createTestDb, type TestDb } from '@licitaclima/db/src/test-utils.js';
import { processPendingStripeEvents, reconcileBilling } from './billing.js';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.cleanup();
});

describe('worker: facturación', () => {
  it('reconcileBilling sin claves → pending (no hace nada)', async () => {
    const result = await reconcileBilling(t.db, {});
    expect(result.status).toBe('pending');
    expect(result.reason).toBe('stripe_not_configured');
  });

  it('processPendingStripeEvents aplica el evento encolado y no lo repite', async () => {
    const [org] = await t.db.insert(organizations).values({ name: 'Worker Billing SL', slug: 'worker-billing' }).returning();
    const payload = {
      id: 'evt_worker_1',
      type: 'checkout.session.completed',
      created: 1794000000,
      data: { object: { customer: 'cus_w_1', subscription: 'sub_w_1', metadata: { organizationId: org.id } } },
    };
    await t.db.insert(stripeEvents).values({ eventId: payload.id, type: payload.type, payload: payload as never });
    const first = await processPendingStripeEvents(t.db);
    expect(first.processed).toBe(1);
    expect(first.applied).toBe(1);
    expect(first.errors).toEqual([]);
    const [sub] = await t.db.select().from(subscriptions).where(eq(subscriptions.organizationId, org.id)).limit(1);
    expect(sub.status).toBe('active');
    const second = await processPendingStripeEvents(t.db);
    expect(second.processed).toBe(0);
  });
});
