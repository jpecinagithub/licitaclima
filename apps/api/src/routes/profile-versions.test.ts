// Tests de la API de lectura: historial de versiones del perfil.
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../server.js';
import { createTestDb, type TestDb } from '../lib/test-db.js';
import { loginAs } from './test-helpers.js';

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

describe('GET /company-profile/versions', () => {
  it('sin perfil → lista vacía; cada PATCH añade una versión', async () => {
    const { cookie } = await loginAs(app, t.db, 'pv-a@example.es');
    const empty = await app.inject({ method: 'GET', url: '/api/v1/company-profile/versions', headers: { cookie } });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual([]);
    const patch1 = await app.inject({
      method: 'PATCH',
      url: '/api/v1/company-profile',
      headers: { cookie },
      payload: { actividad: 'Mantenimiento de climatización', provincias: ['Madrid'] },
    });
    expect(patch1.statusCode).toBe(200);
    const patch2 = await app.inject({
      method: 'PATCH',
      url: '/api/v1/company-profile',
      headers: { cookie },
      payload: { actividad: 'Mantenimiento de climatización', provincias: ['Madrid', 'Toledo'] },
    });
    expect(patch2.statusCode).toBe(200);
    const res = await app.inject({ method: 'GET', url: '/api/v1/company-profile/versions', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const versions = res.json() as { version: number; data: { provincias: string[] } }[];
    expect(versions.length).toBe(2);
    expect(versions[0]?.version).toBe(2);
    expect(versions[0]?.data.provincias).toEqual(['Madrid', 'Toledo']);
    expect(versions[1]?.version).toBe(1);
  });

  it('sin sesión → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/company-profile/versions' });
    expect(res.statusCode).toBe(401);
  });
});
