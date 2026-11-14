// Tests de la API de lectura: oportunidades, análisis personalizado,
// favoritos y estado personal (PostgreSQL real, BD por fichero).
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { favorites, jobs, lots, personalizedAnalyses, usageLedger, documents } from '@licitaclima/db';
import { buildServer } from '../server.js';
import { createTestDb, type TestDb } from '../lib/test-db.js';
import { loginAs, makeActiveSubscription } from './test-helpers.js';
import { seedSource, seedTender } from './reading-seed.js';

process.env.SESSION_SECRET ??= 'test-session-secret-solo-test-000000000000';

let t: TestDb;
let app: ReturnType<typeof buildServer>;
let loginA: { cookie: string; organizationId: string; userId: string };
let loginB: { cookie: string; organizationId: string; userId: string };
let sourceId: string;
let nucleoMadrid: string;
let limitrofeToledo: string;
let marginal: string;
let nucleoAdj: string;
let nucleoBarcelona: string;

beforeAll(async () => {
  t = await createTestDb();
  app = buildServer({ db: t.db });
  await app.ready();
  sourceId = await seedSource(t.db);
  nucleoMadrid = (
    await seedTender(t.db, sourceId, {
      expediente: 'OP-001',
      provincia: 'Madrid',
      objeto: 'Instalación de climatización en colegio',
      valorEstimado: '100000',
    })
  ).id;
  limitrofeToledo = (
    await seedTender(t.db, sourceId, {
      expediente: 'OP-002',
      provincia: 'Toledo',
      claseNicho: 'limitrofe',
      objeto: 'Mantenimiento de aire acondicionado',
      valorEstimado: '50000',
    })
  ).id;
  marginal = (
    await seedTender(t.db, sourceId, {
      expediente: 'OP-003',
      provincia: 'Madrid',
      claseNicho: 'marginal',
      objeto: 'Suministro de material de climatización',
    })
  ).id;
  nucleoAdj = (
    await seedTender(t.db, sourceId, {
      expediente: 'OP-004',
      provincia: 'Madrid',
      estado: 'ADJ',
      objeto: 'Climatización adjudicada',
    })
  ).id;
  nucleoBarcelona = (
    await seedTender(t.db, sourceId, {
      expediente: 'OP-005',
      provincia: 'Barcelona',
      objeto: 'Mantenimiento de climatización en hospital',
      valorEstimado: '200000',
    })
  ).id;
  loginA = await loginAs(app, t.db, 'opp-a@example.es');
  loginB = await loginAs(app, t.db, 'opp-b@example.es');
  await t.db.insert(lots).values([
    { tenderId: nucleoMadrid, numero: '1', objeto: 'Lote 1', valorEstimado: '60000', presupuestoBase: '54000' },
    { tenderId: nucleoMadrid, numero: '2', objeto: 'Lote 2', valorEstimado: '40000', presupuestoBase: '36000' },
  ]);
});

afterAll(async () => {
  await app.close();
  await t.cleanup();
});

describe('GET /opportunities', () => {
  it('sin sesión → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/opportunities' });
    expect(res.statusCode).toBe(401);
  });

  it('lista solo núcleo + limítrofe PUB por defecto (marginales y ADJ fuera)', async () => {
    const cookie = loginA.cookie;
    const res = await app.inject({ method: 'GET', url: '/api/v1/opportunities', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: { expediente: string }[]; total: number };
    expect(body.total).toBe(3);
    expect(body.items.map((i) => i.expediente).sort()).toEqual(['OP-001', 'OP-002', 'OP-005']);
  });

  it('filtros: provincia, estado, clase, texto y paginación', async () => {
    const cookie = loginB.cookie;
    const byProv = await app.inject({
      method: 'GET',
      url: '/api/v1/opportunities?provincia=Madrid',
      headers: { cookie },
    });
    expect((byProv.json() as { total: number }).total).toBe(1);
    const byEstado = await app.inject({
      method: 'GET',
      url: '/api/v1/opportunities?estado=ADJ',
      headers: { cookie },
    });
    expect((byEstado.json() as { total: number }).total).toBe(1);
    const byClase = await app.inject({
      method: 'GET',
      url: '/api/v1/opportunities?clase=limitrofe',
      headers: { cookie },
    });
    expect((byClase.json() as { items: { expediente: string }[] }).items[0]?.expediente).toBe('OP-002');
    const marginales = await app.inject({
      method: 'GET',
      url: '/api/v1/opportunities?clase=marginal',
      headers: { cookie },
    });
    expect((marginales.json() as { total: number }).total).toBe(0);
    const byTexto = await app.inject({
      method: 'GET',
      url: '/api/v1/opportunities?texto=hospital',
      headers: { cookie },
    });
    expect((byTexto.json() as { items: { expediente: string }[] }).items.map((i) => i.expediente)).toEqual(['OP-005']);
    const paged = await app.inject({
      method: 'GET',
      url: '/api/v1/opportunities?limit=2&page=2',
      headers: { cookie },
    });
    const pagedBody = paged.json() as { items: unknown[]; total: number; page: number; pageSize: number };
    expect(pagedBody.items.length).toBe(1);
    expect(pagedBody.total).toBe(3);
    expect(pagedBody.page).toBe(2);
    expect(pagedBody.pageSize).toBe(2);
    const badEstado = await app.inject({
      method: 'GET',
      url: '/api/v1/opportunities?estado=XX',
      headers: { cookie },
    });
    expect(badEstado.statusCode).toBe(400);
  });

  it('orden por importe descendente', async () => {
    const cookie = loginA.cookie;
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/opportunities?orden=importe_desc',
      headers: { cookie },
    });
    const items = (res.json() as { items: { expediente: string; valorEstimadoEur: number }[] }).items;
    expect(items[0]?.expediente).toBe('OP-005');
    expect(items[0]?.valorEstimadoEur).toBe(200000);
  });
});

describe('GET /opportunities/:id', () => {
  it('ficha con lotes, importes diferenciados y encaje nulo sin análisis', async () => {
    const cookie = loginA.cookie;
    await t.db.insert(documents).values({
      tenderId: nucleoMadrid,
      url: 'https://example.es/pcap.pdf',
      filename: 'pcap',
      mime: 'application/pdf',
      sizeBytes: 1000,
      sha256: 'b'.repeat(64),
      status: 'downloaded',
    });
    const res = await app.inject({ method: 'GET', url: `/api/v1/opportunities/${nucleoMadrid}`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      expediente: string;
      titulo: string;
      fuente: string;
      clase: string;
      valorEstimadoEur: number;
      presupuestoBaseSinIvaEur: number;
      lotes: { numero: string }[];
      documentos: { filename: string }[];
      encaje: unknown;
      favorito: boolean;
      estadoPersonal: unknown;
    };
    expect(body.expediente).toBe('OP-001');
    expect(body.fuente).toBe('643');
    expect(body.clase).toBe('nucleo');
    expect(body.valorEstimadoEur).toBe(100000);
    expect(body.presupuestoBaseSinIvaEur).toBe(90000);
    expect(body.lotes.map((l) => l.numero).sort()).toEqual(['1', '2']);
    // El worker guarda el tipo como filename ('pcap'): la API lo expande.
    expect(body.documentos[0]?.filename).toBe('Pliego de cláusulas administrativas (PCAP)');
    expect(body.encaje).toBeNull();
    expect(body.favorito).toBe(false);
    expect(body.estadoPersonal).toBeNull();
  });

  it('marginal o inexistente → 404', async () => {
    const cookie = loginA.cookie;
    const resMarginal = await app.inject({
      method: 'GET',
      url: `/api/v1/opportunities/${marginal}`,
      headers: { cookie },
    });
    expect(resMarginal.statusCode).toBe(404);
    const resUnknown = await app.inject({
      method: 'GET',
      url: '/api/v1/opportunities/00000000-0000-0000-0000-000000000000',
      headers: { cookie },
    });
    expect(resUnknown.statusCode).toBe(404);
    const resMalformed = await app.inject({
      method: 'GET',
      url: '/api/v1/opportunities/no-es-un-uuid',
      headers: { cookie },
    });
    expect(resMalformed.statusCode).toBe(404);
    void nucleoAdj;
    void nucleoBarcelona;
    void limitrofeToledo;
  });
});

describe('POST /opportunities/:id/analyses', () => {
  it('sin suscripción activa → 409 quota_exceeded (no se crea nada)', async () => {
    const { cookie } = await loginAs(app, t.db, 'opp-f@example.es');
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/opportunities/${nucleoMadrid}/analyses`,
      headers: { cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: { code: string } }).error.code).toBe('quota_exceeded');
  });

  it('con suscripción activa → 202, análisis pendiente + job personalized-analyze', async () => {
    const { cookie, organizationId } = await loginAs(app, t.db, 'opp-g@example.es');
    await makeActiveSubscription(t.db, organizationId);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/opportunities/${nucleoMadrid}/analyses`,
      headers: { cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(202);
    const body = res.json() as { analysisId: string; jobId: string; status: string; consumedQuota: boolean };
    expect(body.status).toBe('pending');
    expect(body.consumedQuota).toBe(true);
    expect(body.jobId).toBeTruthy();
    const [job] = await t.db.select().from(jobs).where(eq(jobs.id, body.jobId)).limit(1);
    expect(job?.type).toBe('personalized-analyze');
    expect((job?.payload as { personalizedAnalysisId: string }).personalizedAnalysisId).toBe(body.analysisId);
    const [analysis] = await t.db
      .select()
      .from(personalizedAnalyses)
      .where(eq(personalizedAnalyses.id, body.analysisId))
      .limit(1);
    expect(analysis?.status).toBe('pending');
    // Segundo POST: mismo análisis en curso, sin duplicar trabajo ni cuota.
    const res2 = await app.inject({
      method: 'POST',
      url: `/api/v1/opportunities/${nucleoMadrid}/analyses`,
      headers: { cookie },
      payload: {},
    });
    expect(res2.statusCode).toBe(202);
    expect((res2.json() as { analysisId: string }).analysisId).toBe(body.analysisId);
    const jobsForAnalysis = await t.db
      .select()
      .from(jobs)
      .where(eq(jobs.type, 'personalized-analyze'));
    expect(jobsForAnalysis.length).toBe(1);
    const used = await t.db.select().from(usageLedger).where(eq(usageLedger.organizationId, organizationId));
    expect(used.filter((u) => u.action === 'reserve').length).toBe(1);
  });

  it('revisitar un análisis terminado NO consume (200, sin reserva nueva)', async () => {
    const { cookie, organizationId } = await loginAs(app, t.db, 'opp-h@example.es');
    await makeActiveSubscription(t.db, organizationId);
    const [done] = await t.db
      .insert(personalizedAnalyses)
      .values({
        organizationId,
        tenderId: limitrofeToledo,
        status: 'done',
        data: { recomendacion: 'revisar', filas: [] },
        provider: 'determinista-v1 (sin LLM)',
        consumedQuota: true,
      })
      .returning();
    const before = await t.db.select().from(usageLedger).where(eq(usageLedger.organizationId, organizationId));
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/opportunities/${limitrofeToledo}/analyses`,
      headers: { cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { analysisId: string; consumedQuota: boolean };
    expect(body.analysisId).toBe(done.id);
    expect(body.consumedQuota).toBe(false);
    const after = await t.db.select().from(usageLedger).where(eq(usageLedger.organizationId, organizationId));
    expect(after.length).toBe(before.length);
  });
});

describe('favoritos y estado personal', () => {
  it('POST/DELETE /favorites + PATCH status, con aislamiento entre organizaciones', async () => {
    const a = loginA;
    const b = loginB;
    const fav = await app.inject({
      method: 'POST',
      url: `/api/v1/favorites/${nucleoMadrid}`,
      headers: { cookie: a.cookie },
      payload: {},
    });
    expect(fav.statusCode).toBe(200);
    expect((fav.json() as { favorito: boolean }).favorito).toBe(true);
    const status = await app.inject({
      method: 'PATCH',
      url: `/api/v1/opportunities/${nucleoMadrid}/status`,
      headers: { cookie: a.cookie },
      payload: { estado: 'estudiar' },
    });
    expect(status.statusCode).toBe(200);
    expect((status.json() as { estado: string }).estado).toBe('estudiar');
    const [favRow] = await t.db
      .select()
      .from(favorites)
      .where(eq(favorites.organizationId, a.organizationId))
      .limit(1);
    expect(favRow?.state).toBe('estudiar');
    // La organización B no ve el favorito ni el estado de A.
    const listB = await app.inject({ method: 'GET', url: '/api/v1/opportunities', headers: { cookie: b.cookie } });
    const itemB = (listB.json() as { items: { id: string; favorito: boolean; estadoPersonal: unknown }[] }).items.find(
      (i) => i.id === nucleoMadrid,
    );
    expect(itemB?.favorito).toBe(false);
    expect(itemB?.estadoPersonal).toBeNull();
    const byEstado = await app.inject({
      method: 'GET',
      url: '/api/v1/opportunities?estadoPersonal=estudiar',
      headers: { cookie: a.cookie },
    });
    expect((byEstado.json() as { total: number }).total).toBe(1);
    const bad = await app.inject({
      method: 'PATCH',
      url: `/api/v1/opportunities/${nucleoMadrid}/status`,
      headers: { cookie: a.cookie },
      payload: { estado: 'inventado' },
    });
    expect(bad.statusCode).toBe(400);
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/favorites/${nucleoMadrid}`,
      headers: { cookie: a.cookie },
    });
    expect(del.statusCode).toBe(204);
    const favAfter = await t.db
      .select()
      .from(favorites)
      .where(eq(favorites.organizationId, a.organizationId));
    expect(favAfter.length).toBe(0);
  });
});
