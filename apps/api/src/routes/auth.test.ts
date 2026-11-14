import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server.js';
import { createTestDb, type TestDb } from '../lib/test-db.js';
import { requestMagicLink } from '../lib/auth.js';

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

function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const setCookie = res.headers['set-cookie'];
  const first = Array.isArray(setCookie) ? setCookie[0] : (setCookie as string | undefined);
  return first?.split(';')[0] ?? '';
}

async function loginAs(email: string): Promise<string> {
  const { token } = await requestMagicLink(t.db, { email });
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/consume-link', payload: { token } });
  expect(res.statusCode).toBe(200);
  return cookieFrom(res);
}

describe('HTTP /auth y /me', () => {
  it('POST /auth/request-link responde igual para correo conocido y desconocido', async () => {
    const known = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/request-link',
      payload: { email: 'existe@example.es' },
    });
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/request-link',
      payload: { email: 'nadie@example.es' },
    });
    expect(known.statusCode).toBe(200);
    expect(unknown.statusCode).toBe(200);
    expect(known.json()).toEqual(unknown.json());
    // El mensaje genérico no revela el correo enviado ni si existe.
    expect(known.json().message).not.toContain('existe@example.es');
    expect(known.json().message).not.toContain('nadie@example.es');
  });

  it('POST /auth/request-link valida el correo', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/request-link',
      payload: { email: 'no-es-un-correo' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation_error');
  });

  it('GET /auth/verify-link no consume y POST /auth/consume-link abre sesión con cookie HttpOnly', async () => {
    const { token } = await requestMagicLink(t.db, { email: 'http@example.es' });
    const verify1 = await app.inject({ method: 'GET', url: `/api/v1/auth/verify-link?token=${token}` });
    expect(verify1.json()).toMatchObject({ valid: true });
    const verify2 = await app.inject({ method: 'GET', url: `/api/v1/auth/verify-link?token=${token}` });
    expect(verify2.json()).toMatchObject({ valid: true });
    const consume = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/consume-link',
      payload: { token },
    });
    expect(consume.statusCode).toBe(200);
    const setCookie = consume.headers['set-cookie'];
    expect(String(setCookie)).toContain('lc_session=');
    expect(String(setCookie)).toContain('HttpOnly');
    expect(String(setCookie)).toContain('SameSite=Lax');
    // Reutilizar el mismo token por HTTP falla con 410.
    const reuse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/consume-link',
      payload: { token },
    });
    expect(reuse.statusCode).toBe(410);
    expect(reuse.json().error.code).toBe('invalid_link');
  });

  it('GET /me exige sesión y la devuelve con sesión válida', async () => {
    const anon = await app.inject({ method: 'GET', url: '/api/v1/me' });
    expect(anon.statusCode).toBe(401);
    expect(anon.json().error.code).toBe('unauthorized');
    const cookie = await loginAs('me@example.es');
    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe('me@example.es');
    expect(me.json().organization.id).toBeDefined();
  });

  it('POST /auth/logout revoca la sesión', async () => {
    const cookie = await loginAs('logout@example.es');
    const out = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie } });
    expect(out.statusCode).toBe(200);
    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });

  it('mutación con Origin no permitido se rechaza (CSRF)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/request-link',
      headers: { origin: 'https://malicioso.example' },
      payload: { email: 'x@example.es' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('forbidden');
  });

  it('GET /api/v1/openapi.json sirve el documento generado', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });
    expect(res.statusCode).toBe(200);
    expect(res.json().openapi).toBe('3.1.0');
    expect(Object.keys(res.json().paths)).toContain('/auth/consume-link');
  });
});
