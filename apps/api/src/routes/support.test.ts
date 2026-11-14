import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server.js';
import { createTestDb, type TestDb } from '../lib/test-db.js';
import { loginAdminAs, loginAs, makeActiveSubscription } from './test-helpers.js';

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

describe('soporte', () => {
  it('crear ticket, verlo con su conversación y añadir mensajes', async () => {
    const { cookie } = await loginAs(app, t.db, 'soporte-a@example.es');
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/support/tickets',
      headers: { cookie },
      payload: { subject: 'No veo mis análisis', message: 'He pagado y no veo nada.', priority: 'high' },
    });
    expect(created.statusCode).toBe(201);
    const ticket = created.json();
    expect(ticket.status).toBe('open');
    expect(ticket.priority).toBe('high');
    const got = await app.inject({ method: 'GET', url: `/api/v1/support/tickets/${ticket.id}`, headers: { cookie } });
    expect(got.statusCode).toBe(200);
    expect(got.json().messages).toHaveLength(1);
    expect(got.json().messages[0].content).toBe('He pagado y no veo nada.');
    const msg = await app.inject({
      method: 'POST',
      url: `/api/v1/support/tickets/${ticket.id}/messages`,
      headers: { cookie },
      payload: { message: 'Añado un detalle: ocurre en el panel.' },
    });
    expect(msg.statusCode).toBe(201);
    const list = await app.inject({ method: 'GET', url: '/api/v1/support/tickets', headers: { cookie } });
    expect(list.json().tickets).toHaveLength(1);
    // El cliente puede resolver su ticket.
    const closed = await app.inject({
      method: 'PATCH',
      url: `/api/v1/support/tickets/${ticket.id}`,
      headers: { cookie },
      payload: { status: 'resolved' },
    });
    expect(closed.statusCode).toBe(200);
    expect(closed.json().status).toBe('resolved');
  });

  it('otra organización no ve el ticket (404) y el cliente no accede a /admin', async () => {
    const { cookie } = await loginAs(app, t.db, 'soporte-b@example.es');
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/support/tickets',
      headers: { cookie },
      payload: { subject: 'Ticket privado', message: 'Solo mío.' },
    });
    const ticketId = created.json().id as string;
    const { cookie: otherCookie } = await loginAs(app, t.db, 'soporte-c@example.es');
    const got = await app.inject({ method: 'GET', url: `/api/v1/support/tickets/${ticketId}`, headers: { cookie: otherCookie } });
    expect(got.statusCode).toBe(404);
    const admin = await app.inject({ method: 'GET', url: '/api/v1/admin/summary', headers: { cookie } });
    expect(admin.statusCode).toBe(403);
  });

  it('el administrador responde y el ticket pasa a pending (sin prometer compensaciones automáticas)', async () => {
    const { cookie } = await loginAs(app, t.db, 'soporte-d@example.es');
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/support/tickets',
      headers: { cookie },
      payload: { subject: 'Duda de facturación', message: '¿Me devolvéis el mes?' },
    });
    const ticketId = created.json().id as string;
    const { cookie: adminCookie } = await loginAdminAs(app, t.db, 'admin-soporte@example.es');
    const reply = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/support/tickets/${ticketId}/messages`,
      headers: { cookie: adminCookie },
      payload: { message: 'Lo revisamos en sesión autenticada; los reembolsos se gestionan desde facturación, no por chat.' },
    });
    expect(reply.statusCode).toBe(201);
    expect(reply.json().role).toBe('assistant');
    const got = await app.inject({ method: 'GET', url: `/api/v1/support/tickets/${ticketId}`, headers: { cookie } });
    expect(got.json().status).toBe('pending');
    expect(got.json().messages).toHaveLength(2);
  });
});

describe('cuota por HTTP', () => {
  it('GET /usage muestra la cuota; reserve/confirm/release por HTTP', async () => {
    const { cookie, organizationId } = await loginAs(app, t.db, 'uso-a@example.es');
    await makeActiveSubscription(t.db, organizationId);
    const usage = await app.inject({ method: 'GET', url: '/api/v1/usage', headers: { cookie } });
    expect(usage.statusCode).toBe(200);
    expect(usage.json().analyses).toEqual({ limit: 10, used: 0, remaining: 10 });
    const reserve = await app.inject({
      method: 'POST',
      url: '/api/v1/usage/reserve',
      headers: { cookie },
      payload: { kind: 'chat_question', idempotencyKey: 'http-q-1' },
    });
    expect(reserve.statusCode).toBe(200);
    expect(reserve.json().consumed).toBe(true);
    const confirm = await app.inject({
      method: 'POST',
      url: '/api/v1/usage/confirm',
      headers: { cookie },
      payload: { reserveIdempotencyKey: 'http-q-1' },
    });
    expect(confirm.json().confirmed).toBe(true);
    const usage2 = await app.inject({ method: 'GET', url: '/api/v1/usage', headers: { cookie } });
    expect(usage2.json().chat.used).toBe(1);
  });

  it('revisitar un análisis terminado no consume (HTTP)', async () => {
    const { cookie, organizationId } = await loginAs(app, t.db, 'uso-b@example.es');
    await makeActiveSubscription(t.db, organizationId);
    const { personalizedAnalyses, sources, tenders } = await import('@licitaclima/db');
    const [source] = await t.db.insert(sources).values({ key: 'feed643', name: 'Feed 643', url: 'https://example.es/643.atom' }).returning();
    const [tender] = await t.db
      .insert(tenders)
      .values({ sourceId: source.id, sourceKey: 'feed643', externalId: 'EXP-Q2', expediente: 'EXP-Q2', organo: 'Ayuntamiento', objeto: 'Climatización', estado: 'PUB', urlOficial: 'https://example.es/exp-q2' })
      .returning();
    const tenderId = tender.id;
    await t.db.insert(personalizedAnalyses).values({ organizationId, tenderId, status: 'done', consumedQuota: true });
    const reserve = await app.inject({
      method: 'POST',
      url: '/api/v1/usage/reserve',
      headers: { cookie },
      payload: { kind: 'personalized_analysis', referenceId: tenderId, idempotencyKey: 'http-q-revisit' },
    });
    expect(reserve.statusCode).toBe(200);
    expect(reserve.json().consumed).toBe(false);
    expect(reserve.json().reason).toBe('revisit_or_rectification');
    const usage = await app.inject({ method: 'GET', url: '/api/v1/usage', headers: { cookie } });
    expect(usage.json().analyses.used).toBe(0);
  });
});
