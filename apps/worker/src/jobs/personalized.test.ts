// Test del job personalized-analyze (block/api-lectura) contra el PostgreSQL
// REAL de la VM (DATABASE_URL) y el esquema Drizzle de Fase B. Se salta si
// no hay DATABASE_URL. Datos TEST-PERS-* / org-pg-test-pers, limpiados al final.
// La extracción se pre-siembra (sin descargas de red); el fallo sin documentos
// no necesita red (el expediente no enlaza ningún pliego).
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createDb, createPool, companyProfiles, matches, organizations, personalizedAnalyses, usageLedger, type Db } from '@licitaclima/db';
import { PostgresWorkerStore } from '../pg-store.js';
import { MemoryDocumentStorage } from './documents.js';
import { runPersonalizedAnalyze } from './personalized.js';

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? '';
const HASH = 'd'.repeat(64);
const ORG_SLUG = 'org-pg-test-pers';

const EXTRACTION = {
  version: 'determinista-v1',
  metodo: 'determinista-v1 (sin LLM)',
  tenderId: 't-pers-1',
  expediente: 'TEST-PERS-001',
  objeto: 'Mantenimiento e instalación de climatización en colegio',
  organismo: 'Ayuntamiento Test',
  estado: 'PUB',
  importes: { valorEstimado: '100000', presupuestoBaseSinIva: '90000', presupuestoBaseConIva: '108900' },
  duracion: '12 meses',
  localizacion: 'Madrid',
  plazo: { fecha: '2026-12-03', hora: '14:00:00', plazoSoloFecha: false },
  requisitos: [
    {
      id: 'solvencia-tecnica',
      categoria: 'solvencia_tecnica',
      descripcion: 'Solvencia técnica o profesional exigida',
      obligatorio: true,
      evidencia: { documentId: 'd-1', documentHash: HASH, page: 2, fragment: 'solvencia técnica: experiencia en climatización' },
      motivoAusencia: null,
    },
    {
      id: 'garantia',
      categoria: 'garantia',
      descripcion: 'Garantía provisional o definitiva',
      obligatorio: true,
      evidencia: null,
      motivoAusencia: 'no consta en los pliegos descargados',
    },
  ],
  conflictos: [],
  instruccionesDetectadas: [],
  extraidoEn: new Date().toISOString(),
};

describe('runPersonalizedAnalyze', () => {
  let store: PostgresWorkerStore | null = null;
  let admin: Pool | null = null;
  let db: Db | null = null;
  let pool: ReturnType<typeof createPool> | null = null;
  let orgId = '';
  let tenderId = '';
  let tenderSinDocsId = '';
  let analysisId = '';
  let analysisSinDocsId = '';

  async function cleanup(): Promise<void> {
    if (!admin) return;
    await admin.query("DELETE FROM tenders WHERE expediente LIKE 'TEST-PERS-%'");
    await admin.query("DELETE FROM organizations WHERE slug = $1", [ORG_SLUG]);
  }

  beforeAll(async () => {
    if (!DATABASE_URL) return;
    store = new PostgresWorkerStore(DATABASE_URL);
    await store.ensureSchema();
    admin = new Pool({ connectionString: DATABASE_URL });
    pool = createPool(DATABASE_URL);
    db = createDb(pool);
    await cleanup();
    const [org] = await db
      .insert(organizations)
      .values({ name: 'Org Test Personalized', slug: ORG_SLUG, status: 'active' })
      .returning();
    orgId = org.id;
    await db.insert(companyProfiles).values({
      organizationId: orgId,
      actividad: 'mantenimiento e instalación de climatización',
      provincias: ['Madrid'],
      certificacionesDeclaradas: ['RITE'],
      version: 1,
    });
    const tenderInput = {
      source: 'feed643' as const,
      sourceId: 'atom-test-pers-1',
      expediente: 'TEST-PERS-001',
      organo: 'Ayuntamiento Test',
      objeto: 'Mantenimiento e instalación de climatización en colegio',
      estado: 'PUB',
      valorEstimado: '100000',
      presupuestoBaseSinIva: '90000',
      presupuestoBaseConIva: '108900',
      duracion: '12 meses',
      provincia: 'Madrid',
      provinciaPorVerificar: false,
      nuts: 'ES300',
      plazoFecha: '2026-12-03',
      plazoHora: '14:00:00',
      plazoSoloFecha: false,
      cpv: ['45331000'],
      claseNicho: 'nucleo' as const,
      urlOficial: 'https://example.es/licitacion',
      documentUris: [],
      notices: [],
      firstPubAt: '2026-11-10T09:00:00Z',
      feedUpdatedAt: '2026-11-10T09:00:00Z',
    };
    const created = await store.upsertTender(tenderInput);
    tenderId = created.tender.id;
    const createdSinDocs = await store.upsertTender({ ...tenderInput, sourceId: 'atom-test-pers-2', expediente: 'TEST-PERS-002' });
    tenderSinDocsId = createdSinDocs.tender.id;
    await store.saveExtraction(tenderId, 'determinista-v1', { ...EXTRACTION, tenderId }, 'extraido');
    const periodStart = new Date('2026-11-01T00:00:00Z');
    const periodEnd = new Date('2026-12-01T00:00:00Z');
    const [analysis] = await db
      .insert(personalizedAnalyses)
      .values({
        organizationId: orgId,
        tenderId,
        status: 'pending',
        provider: 'determinista-v1 (sin LLM)',
        consumedQuota: true,
        periodStart,
        idempotencyKey: 'test-pers-reserve-1',
      })
      .returning();
    analysisId = analysis.id;
    await db.insert(usageLedger).values({
      organizationId: orgId,
      subscriptionId: null,
      kind: 'personalized_analysis',
      referenceId: tenderId,
      periodStart,
      periodEnd,
      units: 1,
      action: 'reserve',
      idempotencyKey: 'test-pers-reserve-1',
    });
    const [analysisSinDocs] = await db
      .insert(personalizedAnalyses)
      .values({
        organizationId: orgId,
        tenderId: tenderSinDocsId,
        status: 'pending',
        provider: 'determinista-v1 (sin LLM)',
        consumedQuota: true,
        periodStart,
        idempotencyKey: 'test-pers-reserve-2',
      })
      .returning();
    analysisSinDocsId = analysisSinDocs.id;
    await db.insert(usageLedger).values({
      organizationId: orgId,
      subscriptionId: null,
      kind: 'personalized_analysis',
      referenceId: tenderSinDocsId,
      periodStart,
      periodEnd,
      units: 1,
      action: 'reserve',
      idempotencyKey: 'test-pers-reserve-2',
    });
  });

  afterAll(async () => {
    if (!store || !admin) return;
    await cleanup();
    if (tenderId) await admin.query("DELETE FROM jobs WHERE payload ->> 'tenderId' = $1", [tenderId]);
    if (tenderSinDocsId) await admin.query("DELETE FROM jobs WHERE payload ->> 'tenderId' = $1", [tenderSinDocsId]);
    await admin.end();
    await store.close();
    if (pool) await pool.end();
  });

  it('con extracción: done + match por tenant + cuota confirmada', async () => {
    if (!store || !db) return;
    const storage = new MemoryDocumentStorage();
    const result = await runPersonalizedAnalyze(
      store,
      storage,
      { tenderId, organizationId: orgId, personalizedAnalysisId: analysisId },
      db,
    );
    expect(result.status).toBe('done');
    expect(result.recomendacion).toBe('revisar');
    const [row] = await db.select().from(personalizedAnalyses).where(eq(personalizedAnalyses.id, analysisId)).limit(1);
    expect(row?.status).toBe('done');
    expect((row?.data as { recomendacion?: string })?.recomendacion).toBe('revisar');
    const matchRows = await db
      .select()
      .from(matches)
      .where(and(eq(matches.organizationId, orgId), eq(matches.tenderId, tenderId)));
    expect(matchRows.length).toBe(1);
    expect(matchRows[0]?.verdict).toBe('desconocido');
    const ledger = await db.select().from(usageLedger).where(eq(usageLedger.organizationId, orgId));
    expect(ledger.some((l) => l.action === 'confirm' && l.idempotencyKey === 'confirm:test-pers-reserve-1')).toBe(true);
    // Idempotente: segundo intento no duplica la confirmación.
    await runPersonalizedAnalyze(store, storage, { tenderId, organizationId: orgId, personalizedAnalysisId: analysisId }, db);
    const ledger2 = await db.select().from(usageLedger).where(eq(usageLedger.organizationId, orgId));
    expect(ledger2.filter((l) => l.action === 'confirm' && l.idempotencyKey === 'confirm:test-pers-reserve-1').length).toBe(1);
  });

  it('sin documentos: failed + cuota liberada', async () => {
    if (!store || !db) return;
    const storage = new MemoryDocumentStorage();
    await expect(
      runPersonalizedAnalyze(
        store,
        storage,
        { tenderId: tenderSinDocsId, organizationId: orgId, personalizedAnalysisId: analysisSinDocsId },
        db,
      ),
    ).rejects.toThrow(/sin extracción determinista/);
    const [row] = await db
      .select()
      .from(personalizedAnalyses)
      .where(eq(personalizedAnalyses.id, analysisSinDocsId))
      .limit(1);
    expect(row?.status).toBe('failed');
    const ledger = await db.select().from(usageLedger).where(eq(usageLedger.organizationId, orgId));
    expect(ledger.some((l) => l.action === 'release' && l.idempotencyKey === 'release:test-pers-reserve-2')).toBe(true);
  });
});
