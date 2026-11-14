// LicitaClima — oportunidades y análisis personalizados (block/api-lectura).
//
// GET /opportunities: solo núcleo + limítrofe con estado PUB por defecto
// (los marginales NO se listan). Filtros: provincia, estado, clase, texto,
// estadoPersonal, favorito; orden y paginación. Los datos públicos no llevan
// organization_id; encaje, favorito y estado personal son por organización.
// POST /opportunities/:id/analyses: reserva cuota atómica (Fase D), crea el
// análisis en pendiente y encola `personalized-analyze` en la tabla jobs
// (el worker lo reclama con claimDueJobs). Revisitar un análisis terminado
// NO consume; una rectificación del mismo expediente tampoco (se reutiliza).
// PATCH /opportunities/:id/status: estado personal (favorites.state).

import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { and, count, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { Db } from '@licitaclima/db';
import {
  documents,
  favorites,
  genericAnalyses,
  jobs,
  lots,
  personalizedAnalyses,
  requirementEvidence,
  tenderVersions,
  tenders,
} from '@licitaclima/db';
import type { RouteOptions } from './auth.js';
import { requireDb } from './auth.js';
import { authenticate, requireOrg } from '../lib/tenant.js';
import { checkCsrf } from '../lib/csrf.js';
import { badRequest, notFound } from '../lib/errors.js';
import { personalStatusBodySchema } from '../lib/schemas.js';
import { releaseQuota, reserveQuota, shouldConsumeForAnalysis } from '../lib/quotas.js';
import {
  TENDER_STATES,
  VISIBLE_CLASSES,
  documentDisplayName,
  loadOpportunityContext,
  loadVisibleTender,
  toOpportunityJson,
} from '../lib/opportunities.js';

const ESTADOS = new Set<string>(TENDER_STATES);

function escapeLike(texto: string): string {
  return texto.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function parsePagination(query: Record<string, unknown>): { page: number; limit: number } {
  const rawLimit = Number(query['limit'] ?? query['pageSize'] ?? 20);
  const rawPage = Number(query['page'] ?? 1);
  const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, Math.floor(rawLimit))) : 20;
  const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1;
  return { page, limit };
}

export const opportunitiesRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const db = opts.db;

  app.get('/opportunities', async (request, reply) => {
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const d = requireDb(db);
    const q = (request.query ?? {}) as Record<string, unknown>;
    const { page, limit } = parsePagination(q);

    const provincia = typeof q['provincia'] === 'string' && q['provincia'].trim() ? q['provincia'].trim() : null;
    const estado = typeof q['estado'] === 'string' && q['estado'].trim() ? q['estado'].trim().toUpperCase() : 'PUB';
    if (!ESTADOS.has(estado)) throw badRequest(`Estado no válido: ${estado}.`);
    const clase = typeof q['clase'] === 'string' && q['clase'].trim() ? q['clase'].trim().toLowerCase() : null;
    if (clase && !VISIBLE_CLASSES.includes(clase as (typeof VISIBLE_CLASSES)[number]) && clase !== 'marginal') {
      throw badRequest(`Clase no válida: ${clase}.`);
    }
    const texto = typeof q['texto'] === 'string' && q['texto'].trim() ? q['texto'].trim() : null;
    const estadoPersonal =
      typeof q['estadoPersonal'] === 'string' && q['estadoPersonal'].trim() ? q['estadoPersonal'].trim() : null;
    if (estadoPersonal && !['pendiente', 'estudiar', 'descartada', 'presentada'].includes(estadoPersonal)) {
      throw badRequest(`Estado personal no válido: ${estadoPersonal}.`);
    }
    const soloFavoritos = q['favorito'] === 'true' || q['favoritos'] === 'true';
    const orden = typeof q['orden'] === 'string' ? q['orden'] : 'publicacion_desc';

    // Los marginales nunca se listan: pedir clase=marginal devuelve lista vacía.
    if (clase === 'marginal') {
      return reply.send({ items: [], total: 0, page, pageSize: limit });
    }

    const conds = [
      inArray(tenders.claseNicho, [...VISIBLE_CLASSES]),
      eq(tenders.estado, estado),
    ];
    if (provincia) conds.push(sql`lower(${tenders.provincia}) = lower(${provincia})`);
    if (clase) conds.push(eq(tenders.claseNicho, clase));
    if (texto) {
      const like = `%${escapeLike(texto)}%`;
      conds.push(or(ilike(tenders.objeto, like), ilike(tenders.organo, like), ilike(tenders.expediente, like))!);
    }
    if (estadoPersonal || soloFavoritos) {
      const favConds = [eq(favorites.organizationId, organizationId), eq(favorites.tenderId, tenders.id)];
      if (estadoPersonal) favConds.push(eq(favorites.state, estadoPersonal));
      conds.push(sql`exists (select 1 from ${favorites} where ${sql.join(favConds, sql` and `)})`);
    }
    const where = and(...conds);
    const orderBy =
      orden === 'plazo_asc'
        ? [sql`${tenders.deadlineAt} asc nulls last`, desc(tenders.publishedAt)]
        : orden === 'importe_desc'
          ? [sql`${tenders.valorEstimado} desc nulls last`]
          : orden === 'importe_asc'
            ? [sql`${tenders.valorEstimado} asc nulls last`]
            : [desc(tenders.publishedAt), desc(tenders.createdAt)];

    const [totalRows, rows] = await Promise.all([
      d.select({ n: count() }).from(tenders).where(where),
      d
        .select()
        .from(tenders)
        .where(where)
        .orderBy(...orderBy)
        .limit(limit)
        .offset((page - 1) * limit),
    ]);
    const ids = rows.map((r) => r.id);
    const context = await loadOpportunityContext(d, organizationId, ids);
    const items = rows.map((r) => {
      const c = context.counts.get(r.id) ?? { documentos: 0, lotes: 0 };
      return toOpportunityJson(r, {
        nDocumentos: c.documentos,
        nLotes: c.lotes,
        match: context.matchesByTender.get(r.id) ?? null,
        favorite: context.favoritesByTender.get(r.id) ?? null,
      });
    });
    return reply.send({ items, total: Number(totalRows[0]?.n ?? 0), page, pageSize: limit });
  });

  app.get('/opportunities/:id', async (request, reply) => {
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const d = requireDb(db);
    const tender = await loadVisibleTender(d, (request.params as { id: string }).id);
    const [lotRows, docRows, genericRows, versionRows] = await Promise.all([
      d.select().from(lots).where(eq(lots.tenderId, tender.id)),
      d.select().from(documents).where(eq(documents.tenderId, tender.id)),
      d.select().from(genericAnalyses).where(eq(genericAnalyses.tenderId, tender.id)).limit(1),
      d
        .select({ version: tenderVersions.version })
        .from(tenderVersions)
        .where(eq(tenderVersions.tenderId, tender.id))
        .orderBy(desc(tenderVersions.version))
        .limit(1),
    ]);
    const context = await loadOpportunityContext(d, organizationId, [tender.id]);
    const generic = genericRows[0] ?? null;
    let requisitos: { requisito: string; evidencia: unknown }[] = [];
    if (generic) {
      const evRows = await d
        .select()
        .from(requirementEvidence)
        .where(eq(requirementEvidence.genericAnalysisId, generic.id));
      const docById = new Map(docRows.map((doc) => [doc.id, documentDisplayName(doc.filename, doc.url)]));
      requisitos = evRows.map((r) => {
        const ev = (r.evidence ?? null) as { documentId?: string; page?: number; fragment?: string } | null;
        return {
          requisito: r.requirement,
          categoria: r.category,
          evidencia: ev
            ? {
                documento: ev.documentId ? (docById.get(ev.documentId) ?? ev.documentId) : null,
                pagina: ev.page ?? null,
                fragmento: ev.fragment ?? null,
              }
            : null,
        };
      });
    }
    const match = context.matchesByTender.get(tender.id) ?? null;
    return reply.send({
      ...toOpportunityJson(tender, {
        nDocumentos: docRows.length,
        nLotes: lotRows.length,
        match,
        favorite: context.favoritesByTender.get(tender.id) ?? null,
      }),
      lotes: lotRows.map((l) => ({
        id: l.id,
        numero: l.numero,
        objeto: l.objeto,
        valorEstimadoEur: l.valorEstimado === null ? null : Number(l.valorEstimado),
        presupuestoBaseEur: l.presupuestoBase === null ? null : Number(l.presupuestoBase),
      })),
      documentos: docRows.map((doc) => ({
        id: doc.id,
        filename: documentDisplayName(doc.filename, doc.url),
        mime: doc.mime,
        sizeBytes: doc.sizeBytes,
        url: doc.url,
        estado: doc.status,
      })),
      analisisGenerico: generic
        ? {
            id: generic.id,
            estado: tender.pipeline,
            version: versionRows[0]?.version ?? 1,
            provider: generic.provider,
            requisitos,
          }
        : null,
    });
  });

  app.post('/opportunities/:id/analyses', async (request, reply) => {
    checkCsrf(request);
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const d = requireDb(db);
    const tender = await loadVisibleTender(d, (request.params as { id: string }).id);

    // Reutilización: un análisis terminado para el mismo expediente y
    // organización NO consume (revisita o rectificación oficial).
    const reuse = await shouldConsumeForAnalysis(d, { organizationId, tenderId: tender.id });
    if (!reuse.consume && reuse.existingAnalysisId) {
      return reply.send({
        analysisId: reuse.existingAnalysisId,
        jobId: null,
        status: 'done',
        consumedQuota: false,
        reason: reuse.reason,
      });
    }
    // Ya hay uno en curso: devolverlo sin duplicar trabajo ni cuota.
    const [pending] = await d
      .select()
      .from(personalizedAnalyses)
      .where(
        and(
          eq(personalizedAnalyses.organizationId, organizationId),
          eq(personalizedAnalyses.tenderId, tender.id),
          inArray(personalizedAnalyses.status, ['pending', 'running']),
        ),
      )
      .limit(1);
    if (pending) {
      const [job] = await d
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(
            eq(jobs.type, 'personalized-analyze'),
            sql`${jobs.payload} ->> 'personalizedAnalysisId' = ${pending.id}`,
            inArray(jobs.status, ['pending', 'running']),
          ),
        )
        .limit(1);
      return reply.code(202).send({
        analysisId: pending.id,
        jobId: job?.id ?? null,
        status: pending.status,
        consumedQuota: pending.consumedQuota,
        reason: 'already_in_progress',
      });
    }

    const idempotencyKey = `analysis:${organizationId}:${tender.id}:${randomUUID()}`;
    const reserve = await reserveQuota(d, {
      organizationId,
      kind: 'personalized_analysis',
      referenceId: tender.id,
      idempotencyKey,
    });
    // Si falla la creación, la reserva se libera (no se pierde la unidad).
    try {
      const created = await d.transaction(async (tx) => {
        const [analysis] = await tx
          .insert(personalizedAnalyses)
          .values({
            organizationId,
            tenderId: tender.id,
            status: 'pending',
            provider: 'determinista-v1 (sin LLM)',
            consumedQuota: true,
            periodStart: reserve.periodStart,
            requestedByUserId: ctx.user.id,
            idempotencyKey,
          })
          .returning();
        const [job] = await tx
          .insert(jobs)
          .values({
            type: 'personalized-analyze',
            payload: {
              tenderId: tender.id,
              organizationId,
              personalizedAnalysisId: analysis.id,
            },
            organizationId,
            idempotencyKey: `job:personalized:${analysis.id}`,
          })
          .returning();
        return { analysis, job };
      });
      return reply.code(202).send({
        analysisId: created.analysis.id,
        jobId: created.job.id,
        status: 'pending',
        consumedQuota: true,
        remaining: reserve.remaining,
      });
    } catch (err) {
      await releaseQuota(d, idempotencyKey).catch(() => undefined);
      throw err;
    }
  });

  app.patch('/opportunities/:id/status', async (request, reply) => {
    checkCsrf(request);
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const d = requireDb(db);
    const parsed = personalStatusBodySchema.safeParse(request.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Estado no válido.');
    const tender = await loadVisibleTender(d, (request.params as { id: string }).id);
    const [row] = await d
      .insert(favorites)
      .values({ organizationId, tenderId: tender.id, state: parsed.data.estado })
      .onConflictDoUpdate({
        target: [favorites.organizationId, favorites.tenderId],
        set: { state: parsed.data.estado, updatedAt: new Date() },
      })
      .returning();
    return reply.send({ tenderId: tender.id, estado: row.state, favorito: true });
  });
}
