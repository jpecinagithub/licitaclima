import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  companyProfiles,
  favorites,
  personalizedAnalyses,
  sources,
  tenders,
} from '@licitaclima/db';
import { assertSameOrg, type SessionContext } from './tenant.js';
import { consumeMagicLink } from './auth.js';
import { requestMagicLink } from './auth.js';
import { createTestDb, type TestDb } from './test-db.js';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.cleanup();
});

/** Crea un usuario cliente con su organización y devuelve su contexto de sesión. */
async function loginAs(email: string): Promise<{ ctx: SessionContext; organizationId: string }> {
  const { token } = await requestMagicLink(t.db, { email });
  const { user, organization } = await consumeMagicLink(t.db, { token });
  const ctx: SessionContext = {
    session: {
      id: 'x',
      userId: user.id,
      organizationId: organization.id,
      tokenHash: 'x',
      expiresAt: new Date(Date.now() + 3600_000),
      lastUsedAt: new Date(),
      revokedAt: null,
      mfaVerifiedAt: null,
      userAgent: null,
      ipHash: null,
      createdAt: new Date(),
    },
    user,
    organizationId: organization.id,
    membershipRole: 'owner',
    isAdmin: false,
  };
  return { ctx, organizationId: organization.id };
}

describe('aislamiento multi-tenant', () => {
  it('la org B no lee ni modifica perfil, favoritos ni análisis de la org A, ni con el UUID', async () => {
    const a = await loginAs('empresa-a@example.es');
    const b = await loginAs('empresa-b@example.es');

    // Datos privados de A.
    const [profileA] = await t.db
      .insert(companyProfiles)
      .values({ organizationId: a.organizationId, actividad: 'Climatización', provincias: ['La Rioja'] })
      .returning();
    const [source] = await t.db
      .insert(sources)
      .values({ key: 'feed643', name: 'Feed 643', url: 'https://example.es/643.atom' })
      .returning();
    const [tender] = await t.db
      .insert(tenders)
      .values({
        sourceId: source.id,
        sourceKey: 'feed643',
        externalId: 'EXP-A',
        expediente: 'EXP-A',
        organo: 'Ayuntamiento',
        objeto: 'Climatización',
        estado: 'PUB',
        urlOficial: 'https://example.es/exp-a',
      })
      .returning();
    const [favA] = await t.db
      .insert(favorites)
      .values({ organizationId: a.organizationId, tenderId: tender.id, state: 'estudiar' })
      .returning();
    const [analysisA] = await t.db
      .insert(personalizedAnalyses)
      .values({ organizationId: a.organizationId, tenderId: tender.id, status: 'done' })
      .returning();

    // Lecturas con el filtro de tenant de B: vacías aunque el UUID exista.
    const profilesForB = await t.db
      .select()
      .from(companyProfiles)
      .where(eq(companyProfiles.organizationId, b.organizationId));
    expect(profilesForB).toHaveLength(0);
    const favsForB = await t.db
      .select()
      .from(favorites)
      .where(eq(favorites.organizationId, b.organizationId));
    expect(favsForB).toHaveLength(0);
    const analysesForB = await t.db
      .select()
      .from(personalizedAnalyses)
      .where(eq(personalizedAnalyses.organizationId, b.organizationId));
    expect(analysesForB).toHaveLength(0);

    // Acceso directo por UUID con la guarda: prohibido.
    expect(() => assertSameOrg(profileA.organizationId, b.ctx)).toThrow();
    expect(() => assertSameOrg(favA.organizationId, b.ctx)).toThrow();
    expect(() => assertSameOrg(analysisA.organizationId, b.ctx)).toThrow();
    // Y permitido para el propietario.
    expect(() => assertSameOrg(profileA.organizationId, a.ctx)).not.toThrow();

    // B no puede modificar el favorito de A: un UPDATE filtrado por su org no toca filas.
    const updated = await t.db
      .update(favorites)
      .set({ state: 'descartada' })
      .where(eq(favorites.organizationId, b.organizationId))
      .returning();
    expect(updated).toHaveLength(0);
    const [favAfter] = await t.db.select().from(favorites).where(eq(favorites.id, favA.id)).limit(1);
    expect(favAfter.state).toBe('estudiar');

    // Los datos públicos (licitaciones) SÍ son visibles para ambas.
    const tendersForB = await t.db.select().from(tenders).where(eq(tenders.id, tender.id));
    expect(tendersForB).toHaveLength(1);
  });
});
