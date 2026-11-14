import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server.js';
import { createTestDb, type TestDb } from '../lib/test-db.js';
import { loginAs } from './test-helpers.js';

// Este fichero NO fija claves Stripe: comprueba el comportamiento PENDIENTE
// (sin configuración) del checkout, el portal y el webhook.
delete process.env.STRIPE_SECRET_KEY;
delete process.env.STRIPE_WEBHOOK_SECRET;
delete process.env.STRIPE_PRICE_ID;

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

describe('Stripe sin configurar (PENDIENTE)', () => {
  it('checkout → 503 stripe_not_configured; el acceso NO se activa por redirect', async () => {
    const { cookie } = await loginAs(app, t.db, 'sin-stripe@example.es');
    const res = await app.inject({ method: 'POST', url: '/api/v1/billing/checkout', headers: { cookie }, payload: {} });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('stripe_not_configured');
  });

  it('portal → 503 stripe_not_configured', async () => {
    const { cookie } = await loginAs(app, t.db, 'sin-stripe-portal@example.es');
    const res = await app.inject({ method: 'POST', url: '/api/v1/billing/portal', headers: { cookie }, payload: {} });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('stripe_not_configured');
  });

  it('webhook sin configurar → 503 stripe_not_configured', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/stripe',
      headers: { 'stripe-signature': 't=1,v1=x', 'content-type': 'application/json' },
      payload: JSON.stringify({ id: 'evt_x', type: 'invoice.paid' }),
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('stripe_not_configured');
  });

  it('/health/ready marca stripe y email como pending', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' });
    expect(res.statusCode).toBe(200);
    expect(res.json().stripe).toBe('pending');
    expect(res.json().email).toBe('pending');
  });
});
