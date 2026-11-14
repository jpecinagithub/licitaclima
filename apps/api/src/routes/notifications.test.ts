import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { notifications, suppressionEntries } from '@licitaclima/db';
import { buildServer } from '../server.js';
import { createTestDb, type TestDb } from '../lib/test-db.js';
import { loginAs, makeActiveSubscription } from './test-helpers.js';

process.env.SESSION_SECRET ??= 'test-session-secret-solo-test-000000000000';

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

describe('notificaciones, consentimientos y baja', () => {
  it('preferencias: desactivar alertas no cancela la suscripción', async () => {
    const { cookie, organizationId } = await loginAs(app, t.db, 'notif-a@example.es');
    await makeActiveSubscription(t.db, organizationId);
    const prefs = await app.inject({ method: 'GET', url: '/api/v1/notification-preferences', headers: { cookie } });
    expect(prefs.json()).toMatchObject({ serviceAlerts: true, weeklyDigest: true });
    const updated = await app.inject({
      method: 'PATCH',
      url: '/api/v1/notification-preferences',
      headers: { cookie },
      payload: { serviceAlerts: false, weeklyDigest: true },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().serviceAlerts).toBe(false);
    const sub = await app.inject({ method: 'GET', url: '/api/v1/billing/subscription', headers: { cookie } });
    expect(sub.json().subscription.status).toBe('active');
  });

  it('baja de marketing: consentimiento revocado + supresión, sin tocar la cuenta', async () => {
    const { cookie, organizationId } = await loginAs(app, t.db, 'notif-b@example.es');
    await makeActiveSubscription(t.db, organizationId);
    const consent = await app.inject({
      method: 'POST',
      url: '/api/v1/consents',
      headers: { cookie },
      payload: { purpose: 'marketing', granted: false, textVersion: 'marketing-v1' },
    });
    expect(consent.statusCode).toBe(201);
    const [supp] = await t.db
      .select()
      .from(suppressionEntries)
      .where(eq(suppressionEntries.email, 'notif-b@example.es'));
    expect(supp).toBeDefined();
    expect(supp.channel).toBe('marketing');
    const consents = await app.inject({ method: 'GET', url: '/api/v1/consents', headers: { cookie } });
    expect(consents.json().consents.marketing.granted).toBe(false);
    const sub = await app.inject({ method: 'GET', url: '/api/v1/billing/subscription', headers: { cookie } });
    expect(sub.json().subscription.status).toBe('active');
    void organizationId;
  });

  it('baja por enlace firmado: un clic, token válido; token manipulado → 400', async () => {
    const { cookie } = await loginAs(app, t.db, 'notif-c@example.es');
    const link = await app.inject({ method: 'GET', url: '/api/v1/notifications/unsubscribe-link', headers: { cookie } });
    expect(link.statusCode).toBe(200);
    const token = link.json().token as string;
    const out = await app.inject({ method: 'GET', url: `/api/v1/notifications/unsubscribe?token=${encodeURIComponent(token)}` });
    expect(out.statusCode).toBe(200);
    expect(out.json().message).toMatch(/comunicaciones necesarias de tu cuenta/);
    const [supp] = await t.db
      .select()
      .from(suppressionEntries)
      .where(eq(suppressionEntries.email, 'notif-c@example.es'));
    expect(supp?.channel).toBe('marketing');
    const bad = await app.inject({ method: 'GET', url: '/api/v1/notifications/unsubscribe?token=manipulado' });
    expect(bad.statusCode).toBe(400);
  });

  it('notificaciones: lista, no leídas y marcar como leída', async () => {
    const { cookie, organizationId } = await loginAs(app, t.db, 'notif-d@example.es');
    await t.db.insert(notifications).values({
      organizationId,
      type: 'billing',
      title: 'Pago recibido',
      body: 'Tu suscripción está activa.',
    });
    const list = await app.inject({ method: 'GET', url: '/api/v1/notifications', headers: { cookie } });
    expect(list.json().unread).toBe(1);
    const id = list.json().notifications[0].id as string;
    const read = await app.inject({ method: 'PATCH', url: `/api/v1/notifications/${id}/read`, headers: { cookie }, payload: {} });
    expect(read.statusCode).toBe(200);
    const list2 = await app.inject({ method: 'GET', url: '/api/v1/notifications', headers: { cookie } });
    expect(list2.json().unread).toBe(0);
  });

  it('webhook de correo sin proveedor → 503 email_not_configured', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/email',
      payload: { email: 'a@example.es', eventType: 'bounced' },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('email_not_configured');
  });
});
