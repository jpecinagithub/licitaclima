// LicitaClima — análisis personalizados y chat contextual (block/api-lectura).
//
// GET /analyses/:id: estado + resultado con evidencias cuando está listo.
//   El resultado es la matriz de encaje (MatchMatrix) guardada por el worker
//   en personalized_analyses.data, con requisitos, evidencias y dato de perfil.
// GET /analyses/:id/pdf: exportación PDF (pdfkit) con la marca de extracción
//   determinista v1 (sin LLM). Solo cuando el análisis está terminado.
// POST /analyses/:id/questions: SIN LLM. Respuesta DETERMINISTA buscando en
//   los fragmentos extraídos (extracted_pages) del expediente; con citas o
//   «Sin evidencia en los documentos». Consume 1 unidad de chat por pregunta.
// GET /analyses/:id/questions: historial de la conversación del expediente.
// Todo con aislamiento multi-tenant (organization_id de la sesión).

import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { Db } from '@licitaclima/db';
import {
  conversations,
  documents,
  extractedPages,
  genericAnalyses,
  messages,
  personalizedAnalyses,
  tenderVersions,
  tenders,
} from '@licitaclima/db';
import type { RouteOptions } from './auth.js';
import { requireDb } from './auth.js';
import { authenticate, requireOrg } from '../lib/tenant.js';
import { checkCsrf } from '../lib/csrf.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { analysisQuestionSchema } from '../lib/schemas.js';
import { reserveQuota } from '../lib/quotas.js';
import { answerDeterministically } from '../lib/analysis-questions.js';
import { buildAnalysisPdf, type PdfRequisito } from '../lib/pdf-export.js';
import { documentDisplayName, plazoFecha, plazoHora } from '../lib/opportunities.js';

type AnalysisRow = typeof personalizedAnalyses.$inferSelect;
type TenderRow = typeof tenders.$inferSelect;

async function loadAnalysisForOrg(db: Db, analysisId: string, organizationId: string): Promise<AnalysisRow> {
  // Un id que no es UUID no puede existir: 404, no 500 de Postgres.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(analysisId)) {
    throw notFound('Análisis no encontrado.');
  }
  const [row] = await db.select().from(personalizedAnalyses).where(eq(personalizedAnalyses.id, analysisId)).limit(1);
  if (!row) throw notFound('Análisis no encontrado.');
  if (row.organizationId !== organizationId) throw notFound('Análisis no encontrado.');
  return row;
}

interface MatrixRow {
  requisitoId?: string;
  categoria?: string;
  descripcion?: string;
  obligatorio?: boolean;
  veredicto?: string;
  evidencia?: { documentId?: string; documentHash?: string; page?: number; fragment?: string } | null;
  datoPerfilUsado?: string | null;
  nota?: string | null;
}

interface Matrix {
  filas?: MatrixRow[];
  recomendacion?: string;
  resumen?: { compatibles?: number; incompatibles?: number; desconocidos?: number; noAplica?: number };
  bloqueadoPor?: string[];
  advertenciaScore?: string;
}

function requisitosFromMatrix(
  matrix: Matrix | null,
  docNames: Map<string, string>,
): PdfRequisito[] {
  if (!matrix?.filas) return [];
  return matrix.filas.map((f) => ({
    descripcion: f.descripcion ?? f.requisitoId ?? '',
    veredicto: f.veredicto ?? 'desconocido',
    obligatorio: f.obligatorio ?? false,
    evidencia: f.evidencia
      ? {
          documento: f.evidencia.documentId ? (docNames.get(f.evidencia.documentId) ?? f.evidencia.documentId) : 'Documento del expediente',
          pagina: f.evidencia.page ?? null,
          fragmento: f.evidencia.fragment ?? '',
        }
      : null,
    datoPerfilUsado: f.datoPerfilUsado ?? null,
    nota: f.nota ?? null,
  }));
}

async function analysisPayload(db: Db, row: AnalysisRow, tender: TenderRow) {
  const [docRows, genericRows, versionRows] = await Promise.all([
    db.select().from(documents).where(eq(documents.tenderId, tender.id)),
    db.select().from(genericAnalyses).where(eq(genericAnalyses.tenderId, tender.id)).limit(1),
    db
      .select({ version: tenderVersions.version })
      .from(tenderVersions)
      .where(eq(tenderVersions.tenderId, tender.id))
      .orderBy(desc(tenderVersions.version))
      .limit(1),
  ]);
  const docNames = new Map(docRows.map((doc) => [doc.id, documentDisplayName(doc.filename, doc.url)]));
  const matrix = (row.data ?? null) as Matrix | null;
  const generic = genericRows[0] ?? null;
  const genericData = (generic?.data ?? null) as {
    requisitos?: MatrixRow[];
    conflictos?: string[];
  } | null;
  // Antes de terminar, los requisitos visibles son los del análisis genérico.
  const requisitos =
    row.status === 'done'
      ? requisitosFromMatrix(matrix, docNames)
      : requisitosFromMatrix({ filas: genericData?.requisitos ?? [] }, docNames);
  const resumen = matrix?.resumen;
  const camposAusentes = requisitos
    .filter((r) => !r.evidencia)
    .map((r) => ({ campo: r.descripcion, motivo: r.nota ?? 'Sin evidencia en los documentos.' }));
  return {
    id: row.id,
    tenderId: row.tenderId,
    expediente: tender.expediente,
    estado: tender.pipeline,
    version: versionRows[0]?.version ?? 1,
    status: row.status,
    resumen:
      resumen && row.status === 'done'
        ? `Recomendación: ${matrix?.recomendacion ?? 'revisar'}. ${resumen.compatibles ?? 0} compatibles, ${resumen.incompatibles ?? 0} incompatibles, ${resumen.desconocidos ?? 0} desconocidos.`
        : null,
    recomendacion: matrix?.recomendacion ?? null,
    requisitos,
    importes: {
      valorEstimadoEur: tender.valorEstimado === null ? null : Number(tender.valorEstimado),
      presupuestoBaseSinIvaEur: tender.presupuestoBaseSinIva === null ? null : Number(tender.presupuestoBaseSinIva),
      presupuestoBaseConIvaEur: tender.presupuestoBaseConIva === null ? null : Number(tender.presupuestoBaseConIva),
    },
    conflictos: genericData?.conflictos ?? [],
    camposAusentes,
    provider: row.provider,
    consumedQuota: row.consumedQuota,
    tender: {
      id: tender.id,
      expediente: tender.expediente,
      organo: tender.organo,
      objeto: tender.objeto,
      estado: tender.estado,
      provincia: tender.provincia,
      urlOficial: tender.urlOficial,
      plazo: plazoFecha(tender),
      plazoHora: plazoHora(tender),
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const analysesRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const db = opts.db;

  app.get('/analyses/:id', async (request, reply) => {
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const d = requireDb(db);
    const row = await loadAnalysisForOrg(d, (request.params as { id: string }).id, organizationId);
    const [tender] = await d.select().from(tenders).where(eq(tenders.id, row.tenderId)).limit(1);
    if (!tender) throw notFound('Análisis no encontrado.');
    return reply.send(await analysisPayload(d, row, tender));
  });

  app.get('/analyses/:id/pdf', async (request, reply) => {
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const d = requireDb(db);
    const row = await loadAnalysisForOrg(d, (request.params as { id: string }).id, organizationId);
    if (row.status !== 'done') {
      throw conflict('El análisis aún no está terminado.', 'analysis_not_ready');
    }
    const [tender] = await d.select().from(tenders).where(eq(tenders.id, row.tenderId)).limit(1);
    if (!tender) throw notFound('Análisis no encontrado.');
    const payload = await analysisPayload(d, row, tender);
    const pdf = await buildAnalysisPdf({
      expediente: tender.expediente,
      organo: tender.organo,
      objeto: tender.objeto,
      estado: tender.estado,
      provincia: tender.provincia,
      urlOficial: tender.urlOficial,
      plazo: payload.tender.plazo,
      importes: payload.importes,
      recomendacion: payload.recomendacion,
      provider: row.provider,
      requisitos: payload.requisitos,
    });
    const nombre = `analisis-${tender.expediente.replace(/[^A-Za-z0-9]+/g, '-')}.pdf`;
    return reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${nombre}"`)
      .send(pdf);
  });

  app.post('/analyses/:id/questions', async (request, reply) => {
    checkCsrf(request);
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const d = requireDb(db);
    const parsed = analysisQuestionSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Pregunta no válida.');
    const texto = parsed.data.texto;
    const row = await loadAnalysisForOrg(d, (request.params as { id: string }).id, organizationId);
    if (row.status !== 'done') {
      throw conflict('El análisis aún no está terminado.', 'analysis_not_ready');
    }
    const [tender] = await d.select().from(tenders).where(eq(tenders.id, row.tenderId)).limit(1);
    if (!tender) throw notFound('Análisis no encontrado.');

    // Cada pregunta consume 1 unidad de chat del periodo (100/periodo).
    const reserve = await reserveQuota(d, {
      organizationId,
      kind: 'chat_question',
      referenceId: row.id,
      idempotencyKey: `chat:${row.id}:${randomUUID()}`,
    });
    void reserve;

    // Conversación del expediente (una por organización + expediente).
    let [conv] = await d
      .select()
      .from(conversations)
      .where(
        and(eq(conversations.organizationId, organizationId), eq(conversations.tenderId, tender.id)),
      )
      .limit(1);
    if (!conv) {
      [conv] = await d
        .insert(conversations)
        .values({ organizationId, tenderId: tender.id, title: `Preguntas sobre ${tender.expediente}` })
        .returning();
    }

    // Solo fragmentos extraídos de ESTE expediente (documentos autorizados).
    const pages = await d
      .select({
        documento: documents.filename,
        url: documents.url,
        pagina: extractedPages.pageNumber,
        texto: extractedPages.textContent,
      })
      .from(extractedPages)
      .innerJoin(documents, eq(extractedPages.documentId, documents.id))
      .where(eq(documents.tenderId, tender.id))
      .orderBy(asc(documents.filename), asc(extractedPages.pageNumber));
    const answer = answerDeterministically(
      texto,
      pages.map((p) => ({ documento: documentDisplayName(p.documento, p.url), pagina: p.pagina, texto: p.texto })),
    );

    const saved = await d.transaction(async (tx) => {
      // createdAt explícito y estrictamente creciente: `now()` de Postgres es
      // el mismo instante para toda la transacción, así que sin esto los dos
      // mensajes empatarían y el historial no tendría un orden estable.
      const [last] = await tx
        .select({ createdAt: messages.createdAt })
        .from(messages)
        .where(eq(messages.conversationId, conv.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);
      const base = Math.max(Date.now(), last ? new Date(last.createdAt).getTime() + 1 : 0);
      await tx.insert(messages).values({
        conversationId: conv.id,
        organizationId,
        role: 'user',
        content: texto,
        citations: null,
        createdAt: new Date(base),
      });
      const [assistant] = await tx
        .insert(messages)
        .values({
          conversationId: conv.id,
          organizationId,
          role: 'assistant',
          content: answer.texto,
          citations: answer.citas,
          createdAt: new Date(base + 1),
        })
        .returning();
      return assistant;
    });
    return reply.code(201).send({
      id: saved.id,
      role: 'assistant',
      texto: answer.texto,
      citas: answer.citas,
      sinEvidencia: answer.sinEvidencia,
      createdAt: saved.createdAt.toISOString(),
    });
  });

  app.get('/analyses/:id/questions', async (request, reply) => {
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const d = requireDb(db);
    const row = await loadAnalysisForOrg(d, (request.params as { id: string }).id, organizationId);
    const [conv] = await d
      .select()
      .from(conversations)
      .where(
        and(eq(conversations.organizationId, organizationId), eq(conversations.tenderId, row.tenderId)),
      )
      .limit(1);
    if (!conv) return reply.send([]);
    const rows = await d
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conv.id))
      .orderBy(asc(messages.createdAt), asc(messages.id));
    return reply.send(
      rows.map((m) => ({
        id: m.id,
        role: m.role,
        texto: m.content,
        citas: (m.citations as { documento: string; pagina: number | null; fragmento: string }[] | null) ?? [],
        sinEvidencia:
          m.role === 'assistant' && m.content.startsWith('Sin evidencia en los documentos'),
        createdAt: m.createdAt.toISOString(),
      })),
    );
  });
}
