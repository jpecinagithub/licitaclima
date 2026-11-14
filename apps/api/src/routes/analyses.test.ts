// Tests de la API de lectura: análisis, PDF y preguntas deterministas.
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { personalizedAnalyses, usageLedger } from '@licitaclima/db';
import { buildServer } from '../server.js';
import { createTestDb, type TestDb } from '../lib/test-db.js';
import { loginAs, makeActiveSubscription } from './test-helpers.js';
import { seedDocumentWithPages, seedSource, seedTender } from './reading-seed.js';

process.env.SESSION_SECRET ??= 'test-session-secret-solo-test-000000000000';

let t: TestDb;
let app: ReturnType<typeof buildServer>;
let tenderId: string;
let docId: string;
let doneAnalysisId: string;
let pendingAnalysisId: string;
let ownerCookie: string;
let ownerOrg: string;
let otherCookie: string;

const MATRIX = {
  tenderId: 'x',
  extractionVersion: 'determinista-v1',
  filas: [
    {
      requisitoId: 'solvencia-tecnica',
      categoria: 'solvencia_tecnica',
      descripcion: 'Solvencia técnica o profesional exigida',
      obligatorio: true,
      veredicto: 'compatible',
      evidencia: { documentId: '__DOC__', documentHash: 'a'.repeat(64), page: 2, fragment: 'solvencia técnica: experiencia en climatización' },
      datoPerfilUsado: 'certificacionesDeclaradas: ISO 9001',
      nota: null,
    },
    {
      requisitoId: 'garantia',
      categoria: 'garantia',
      descripcion: 'Garantía provisional o definitiva',
      obligatorio: true,
      veredicto: 'desconocido',
      evidencia: null,
      datoPerfilUsado: null,
      nota: 'no consta en los pliegos descargados',
    },
  ],
  bloqueadoPor: [],
  recomendacion: 'revisar',
  resumen: { compatibles: 1, incompatibles: 0, desconocidos: 1, noAplica: 0 },
  advertenciaScore: 'El score es un recuento explicable de encaje, NO una probabilidad de ganar.',
};

beforeAll(async () => {
  t = await createTestDb();
  app = buildServer({ db: t.db });
  await app.ready();
  const sourceId = await seedSource(t.db);
  const tender = await seedTender(t.db, sourceId, {
    expediente: 'AN-001',
    provincia: 'Asturias',
    objeto: 'Mantenimiento e instalación de climatización',
  });
  tenderId = tender.id;
  docId = await seedDocumentWithPages(t.db, tenderId, [
    {
      pageNumber: 2,
      textContent:
        'La solvencia técnica exige acreditar experiencia en climatización: haber ejecutado al menos tres instalaciones de aire acondicionado en los últimos cinco años.',
    },
    {
      pageNumber: 5,
      textContent:
        'La garantía definitiva será del 5 por ciento del precio de adjudicación, sin IVA, y deberá constituirse antes de la formalización del contrato.',
    },
  ]);
  // La matriz guarda el id del documento: sustituir el marcador.
  const matrix = JSON.parse(JSON.stringify(MATRIX).replaceAll('__DOC__', docId)) as typeof MATRIX;
  const owner = await loginAs(app, t.db, 'an-owner@example.es');
  ownerCookie = owner.cookie;
  ownerOrg = owner.organizationId;
  const other = await loginAs(app, t.db, 'an-other@example.es');
  otherCookie = other.cookie;
  const [done] = await t.db
    .insert(personalizedAnalyses)
    .values({
      organizationId: owner.organizationId,
      tenderId,
      status: 'done',
      data: matrix,
      provider: 'determinista-v1 (sin LLM)',
      consumedQuota: true,
    })
    .returning();
  doneAnalysisId = done.id;
  const [pending] = await t.db
    .insert(personalizedAnalyses)
    .values({ organizationId: owner.organizationId, tenderId, status: 'pending', provider: 'determinista-v1 (sin LLM)' })
    .returning();
  pendingAnalysisId = pending.id;
});

afterAll(async () => {
  await app.close();
  await t.cleanup();
});

describe('GET /analyses/:id', () => {
  it('análisis terminado: requisitos con evidencia (documento, página, fragmento)', async () => {
    const cookie = ownerCookie;
    const res = await app.inject({ method: 'GET', url: `/api/v1/analyses/${doneAnalysisId}`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      expediente: string;
      status: string;
      recomendacion: string;
      requisitos: { descripcion: string; veredicto: string; evidencia: { documento: string; pagina: number; fragmento: string } | null }[];
      importes: { valorEstimadoEur: number };
    };
    expect(body.expediente).toBe('AN-001');
    expect(body.status).toBe('done');
    expect(body.recomendacion).toBe('revisar');
    expect(body.requisitos.length).toBe(2);
    expect(body.requisitos[0]?.evidencia?.documento).toBe('pliego.pdf');
    expect(body.requisitos[0]?.evidencia?.pagina).toBe(2);
    expect(body.requisitos[0]?.evidencia?.fragmento).toContain('solvencia técnica');
    expect(body.requisitos[1]?.evidencia).toBeNull();
    expect(body.importes.valorEstimadoEur).toBe(100000);
  });

  it('otra organización no ve el análisis (404 genérico); desconocido → 404', async () => {
    const cookie = otherCookie;
    const res = await app.inject({ method: 'GET', url: `/api/v1/analyses/${doneAnalysisId}`, headers: { cookie } });
    expect(res.statusCode).toBe(404);
    const resUnknown = await app.inject({
      method: 'GET',
      url: '/api/v1/analyses/00000000-0000-0000-0000-000000000000',
      headers: { cookie },
    });
    expect(resUnknown.statusCode).toBe(404);
  });

  it('análisis pendiente: 200 con estado y sin requisitos inventados', async () => {
    const cookie = ownerCookie;
    const res = await app.inject({ method: 'GET', url: `/api/v1/analyses/${pendingAnalysisId}`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; requisitos: unknown[] };
    expect(body.status).toBe('pending');
    expect(body.requisitos).toEqual([]);
  });
});

describe('GET /analyses/:id/pdf', () => {
  it('pendiente → 409 analysis_not_ready', async () => {
    const cookie = ownerCookie;
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/analyses/${pendingAnalysisId}/pdf`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: { code: string } }).error.code).toBe('analysis_not_ready');
  });

  it('terminado → 200 application/pdf con la marca determinista', async () => {
    const cookie = ownerCookie;
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/analyses/${doneAnalysisId}/pdf`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('analisis-AN-001.pdf');
    expect(res.body.startsWith('%PDF-')).toBe(true);
    expect(res.body.length).toBeGreaterThan(1000);
  });
});

describe('POST/GET /analyses/:id/questions (determinista, sin LLM)', () => {
  it('pregunta con evidencia: responde con citas del expediente', async () => {
    const cookie = ownerCookie;
    const organizationId = ownerOrg;
    await makeActiveSubscription(t.db, organizationId);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/analyses/${doneAnalysisId}/questions`,
      headers: { cookie },
      payload: { texto: '¿Qué solvencia técnica se exige?' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      role: string;
      texto: string;
      citas: { documento: string; pagina: number; fragmento: string }[];
      sinEvidencia: boolean;
    };
    expect(body.role).toBe('assistant');
    expect(body.sinEvidencia).toBe(false);
    expect(body.citas.length).toBeGreaterThan(0);
    expect(body.citas[0]?.documento).toBe('pliego.pdf');
    expect(body.citas[0]?.pagina).toBe(2);
    const used = await t.db
      .select()
      .from(usageLedger)
      .where(eq(usageLedger.organizationId, organizationId));
    expect(used.filter((u) => u.kind === 'chat_question' && u.action === 'reserve').length).toBe(1);
  });

  it('pregunta sin evidencia: responde "Sin evidencia en los documentos"', async () => {
    const cookie = ownerCookie;
    const organizationId = ownerOrg;
    await makeActiveSubscription(t.db, organizationId);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/analyses/${doneAnalysisId}/questions`,
      headers: { cookie },
      payload: { texto: '¿Cuál es la política de dividendos de la empresa?' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { sinEvidencia: boolean; texto: string; citas: unknown[] };
    expect(body.sinEvidencia).toBe(true);
    expect(body.texto).toContain('Sin evidencia en los documentos');
    expect(body.citas).toEqual([]);
  });

  it('GET historial: preguntas y respuestas en orden; otra org → 404', async () => {
    const cookie = ownerCookie;
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/analyses/${doneAnalysisId}/questions`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const items = res.json() as { role: string; texto: string; sinEvidencia: boolean }[];
    expect(items.length).toBe(4);
    expect(items[0]?.role).toBe('user');
    expect(items[1]?.role).toBe('assistant');
    expect(items[1]?.sinEvidencia).toBe(false);
    expect(items[3]?.sinEvidencia).toBe(true);
    const other = { cookie: otherCookie };
    const resOther = await app.inject({
      method: 'GET',
      url: `/api/v1/analyses/${doneAnalysisId}/questions`,
      headers: { cookie: other.cookie },
    });
    expect(resOther.statusCode).toBe(404);
  });

  it('sin suscripción activa → 409 (la pregunta consume cuota de chat)', async () => {
    const { cookie, organizationId } = await loginAs(app, t.db, 'an-free@example.es');
    const [own] = await t.db
      .insert(personalizedAnalyses)
      .values({
        organizationId,
        tenderId,
        status: 'done',
        data: { recomendacion: 'revisar', filas: [] },
        provider: 'determinista-v1 (sin LLM)',
        consumedQuota: true,
      })
      .returning();
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/analyses/${own.id}/questions`,
      headers: { cookie },
      payload: { texto: '¿Qué garantía se exige?' },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: { code: string } }).error.code).toBe('quota_exceeded');
  });
});
