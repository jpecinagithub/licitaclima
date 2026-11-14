import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditLogs, systemSettings } from '@licitaclima/db';
import { buildServer } from '../server.js';
import { createTestDb, type TestDb } from '../lib/test-db.js';
import { loginAdminAs, loginAs, makeActiveSubscription } from './test-helpers.js';

let t: TestDb;
let app: ReturnType<typeof buildServer>;
let adminCookie: string;
beforeAll(async () => {
  t = await createTestDb();
  app = buildServer({ db: t.db });
  await app.ready();
  ({ cookie: adminCookie } = await loginAdminAs(app, t.db, 'admin-panel@example.es'));
});
afterAll(async () => {
  await app.close();
  await t.cleanup();
});

describe('panel admin', () => {
  it('resumen y finanzas: 2 activos → MRR 98 € sin impuestos; LTV null por muestra insuficiente', async () => {
    const a = await loginAs(app, t.db, 'admin-cli-a@example.es');
    await makeActiveSubscription(t.db, a.organizationId);
    const b = await loginAs(app, t.db, 'admin-cli-b@example.es');
    await makeActiveSubscription(t.db, b.organizationId);
    const summary = await app.inject({ method: 'GET', url: '/api/v1/admin/summary', headers: { cookie: adminCookie } });
    expect(summary.statusCode).toBe(200);
    expect(summary.json().activeCustomers).toBe(2);
    expect(summary.json().mrrEurExclTax).toBe(98);
    const finance = await app.inject({ method: 'GET', url: '/api/v1/admin/finance', headers: { cookie: adminCookie } });
    expect(finance.json().mrrEurExclTax).toBe(98);
    expect(finance.json().refundsEur).toBe(0);
    expect(finance.json().ltvEur).toBeNull();
    expect(finance.json().ltvNote).toMatch(/muestra insuficiente/i);
    expect(finance.json().contributionNote).toMatch(/NO es beneficio neto/);
  });

  it('embudo: visitas N/D (null), leads y pagos con valores reales', async () => {
    const funnel = await app.inject({ method: 'GET', url: '/api/v1/admin/funnel', headers: { cookie: adminCookie } });
    expect(funnel.statusCode).toBe(200);
    expect(funnel.json().funnel.visits).toEqual({ value: null, available: false });
    expect(funnel.json().funnel.leads.available).toBe(true);
  });

  it('clientes: lista con cuota y detalle auditado', async () => {
    const customers = await app.inject({ method: 'GET', url: '/api/v1/admin/customers', headers: { cookie: adminCookie } });
    expect(customers.statusCode).toBe(200);
    expect(customers.json().customers.length).toBeGreaterThanOrEqual(2);
    const first = customers.json().customers[0];
    expect(first.analysesLimit).toBe(10);
    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/customers/${first.organizationId}`,
      headers: { cookie: adminCookie },
    });
    expect(detail.statusCode).toBe(200);
    const [audit] = await t.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'admin.customer.viewed'));
    expect(audit).toBeDefined();
    expect(audit.objectId).toBe(first.organizationId);
  });

  it('pausa de nuevos análisis bloquea reservas sin bloquear acceso', async () => {
    const { cookie, organizationId } = await loginAs(app, t.db, 'admin-pausa@example.es');
    await makeActiveSubscription(t.db, organizationId);
    // La pausa exige reautenticación MFA reciente (el login admin la tiene).
    const paused = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings',
      headers: { cookie: adminCookie },
      payload: { key: 'pause.new_analyses', value: { paused: true } },
    });
    expect(paused.statusCode).toBe(200);
    const reserve = await app.inject({
      method: 'POST',
      url: '/api/v1/usage/reserve',
      headers: { cookie },
      payload: { kind: 'personalized_analysis', idempotencyKey: 'pausa-1' },
    });
    expect(reserve.statusCode).toBe(409);
    expect(reserve.json().error.code).toBe('paused');
    // El acceso (GET /usage, suscripción) sigue funcionando.
    const usage = await app.inject({ method: 'GET', url: '/api/v1/usage', headers: { cookie } });
    expect(usage.statusCode).toBe(200);
    // Quitar la pausa.
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings',
      headers: { cookie: adminCookie },
      payload: { key: 'pause.new_analyses', value: { paused: false } },
    });
    const [row] = await t.db.select().from(systemSettings).where(eq(systemSettings.key, 'pause.new_analyses'));
    expect((row.value as { paused: boolean }).paused).toBe(false);
  });

  it('configuración rechaza claves no permitidas y audita los cambios', async () => {
    const bad = await app.inject({
      method: 'PATCH',
      url: '/api/v1/admin/settings',
      headers: { cookie: adminCookie },
      payload: { key: 'plan.price', value: { value: 1 } },
    });
    expect(bad.statusCode).toBe(400);
    const audits = await app.inject({ method: 'GET', url: '/api/v1/admin/audit', headers: { cookie: adminCookie } });
    expect(audits.statusCode).toBe(200);
    const actions = (audits.json().audit as Array<{ action: string }>).map((a) => a.action);
    expect(actions).toContain('admin.summary.viewed');
    expect(actions).toContain('admin.settings.updated');
  });

  it('salud del panel: stripe/email pending sin configuración', async () => {
    const health = await app.inject({ method: 'GET', url: '/api/v1/admin/health', headers: { cookie: adminCookie } });
    expect(health.statusCode).toBe(200);
    expect(health.json().db).toBe('ok');
    expect(health.json().stripe).toBe('pending');
    expect(health.json().email).toBe('pending');
  });

  it('un cliente no puede ver el panel (403) y un admin sin sesión tampoco (401)', async () => {
    const { cookie } = await loginAs(app, t.db, 'admin-no@example.es');
    const res = await app.inject({ method: 'GET', url: '/api/v1/admin/finance', headers: { cookie } });
    expect(res.statusCode).toBe(403);
    const anon = await app.inject({ method: 'GET', url: '/api/v1/admin/finance' });
    expect(anon.statusCode).toBe(401);
  });
});
