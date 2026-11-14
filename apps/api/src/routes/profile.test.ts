import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { companyProfiles, profileVersions } from '@licitaclima/db';
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

const validProfile = {
  actividad: 'Mantenimiento e instalación de climatización',
  provincias: ['La Rioja', 'Navarra'],
  radioKm: 80,
  certificacionesDeclaradas: ['RITE'],
};

describe('HTTP /company-profile', () => {
  it('sin sesión → 401; sin perfil → 404', async () => {
    const anon = await app.inject({ method: 'GET', url: '/api/v1/company-profile' });
    expect(anon.statusCode).toBe(401);
    const cookie = await loginAs('sin-perfil@example.es');
    const res = await app.inject({ method: 'GET', url: '/api/v1/company-profile', headers: { cookie } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
  });

  it('PATCH crea el perfil (v1) y GET lo devuelve', async () => {
    const cookie = await loginAs('perfil-a@example.es');
    const created = await app.inject({
      method: 'PATCH',
      url: '/api/v1/company-profile',
      headers: { cookie },
      payload: validProfile,
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().version).toBe(1);
    expect(created.json().matchesRecalcPending).toBe(true);
    expect(created.json().note).toContain('recálculo');
    const got = await app.inject({ method: 'GET', url: '/api/v1/company-profile', headers: { cookie } });
    expect(got.json().actividad).toBe(validProfile.actividad);
    expect(got.json().provincias).toEqual(['La Rioja', 'Navarra']);
  });

  it('segundo PATCH sube a v2 y guarda la versión anterior en profile_versions', async () => {
    const cookie = await loginAs('perfil-b@example.es');
    const first = await app.inject({ method: 'PATCH', url: '/api/v1/company-profile', headers: { cookie }, payload: validProfile });
    const profileId = first.json().id as string;
    const updated = await app.inject({
      method: 'PATCH',
      url: '/api/v1/company-profile',
      headers: { cookie },
      payload: { ...validProfile, provincias: ['La Rioja', 'Navarra', 'Álava'], radioKm: 120 },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2);
    expect(updated.json().provincias).toEqual(['La Rioja', 'Navarra', 'Álava']);
    const versions = await t.db
      .select()
      .from(profileVersions)
      .where(eq(profileVersions.profileId, profileId))
      .orderBy(profileVersions.version);
    expect(versions).toHaveLength(2);
    expect(versions[0]!.data).toMatchObject({ radioKm: 80 });
    expect(versions[1]!.data).toMatchObject({ radioKm: 120 });
  });

  it('más de 3 provincias → 400 y no se guarda nada', async () => {
    const cookie = await loginAs('perfil-c@example.es');
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/company-profile',
      headers: { cookie },
      payload: { ...validProfile, actividad: 'Empresa cuatro provincias', provincias: ['La Rioja', 'Navarra', 'Álava', 'Burgos'] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation_error');
    const rows = await t.db.select().from(companyProfiles);
    expect(rows.filter((r) => r.actividad === 'Empresa cuatro provincias')).toHaveLength(0);
  });

  it('aislamiento: el perfil de A no es visible ni modificable por B', async () => {
    const cookieA = await loginAs('aisla-a@example.es');
    const cookieB = await loginAs('aisla-b@example.es');
    await app.inject({ method: 'PATCH', url: '/api/v1/company-profile', headers: { cookie: cookieA }, payload: validProfile });
    // B no tiene perfil: 404 (no ve el de A).
    const gotB = await app.inject({ method: 'GET', url: '/api/v1/company-profile', headers: { cookie: cookieB } });
    expect(gotB.statusCode).toBe(404);
    // B crea el suyo; el de A sigue intacto.
    await app.inject({
      method: 'PATCH',
      url: '/api/v1/company-profile',
      headers: { cookie: cookieB },
      payload: { ...validProfile, actividad: 'Otra empresa distinta' },
    });
    const gotA = await app.inject({ method: 'GET', url: '/api/v1/company-profile', headers: { cookie: cookieA } });
    expect(gotA.json().actividad).toBe(validProfile.actividad);
    expect(gotA.json().version).toBe(1);
    const all = await t.db.select().from(companyProfiles);
    expect(all.filter((r) => r.actividad === 'Otra empresa distinta')).toHaveLength(1);
    expect(all.filter((r) => r.actividad === validProfile.actividad && r.version === 1)).toHaveLength(2);
  });
});
