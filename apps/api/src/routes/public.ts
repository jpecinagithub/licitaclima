// LicitaClima — endpoints públicos sin registro (block/api-lectura).
//
// GET /public/coverage: fuentes cubiertas (feeds oficiales 643 y 1044) con
// su última sincronización exitosa REAL (ingestion_runs) y conteos reales.
// Sin afirmar cobertura exhaustiva: no se cubren plataformas autonómicas.
// GET /public/sample: oportunidades PUB de núcleo reales, limitadas, sin
// registro. Nunca se fabrican oportunidades.

import type { FastifyPluginAsync } from 'fastify';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { ingestionRuns, sources, tenders } from '@licitaclima/db';
import type { RouteOptions } from './auth.js';
import { requireDb } from './auth.js';
import { VISIBLE_CLASSES, toOpportunityJson } from '../lib/opportunities.js';

export const publicRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const db = opts.db;

  app.get('/public/coverage', async (_request, reply) => {
    const d = requireDb(db);
    const [sourceRows, countRows, pubRows, lastOk] = await Promise.all([
      d.select().from(sources).orderBy(sources.key),
      d.select({ clase: tenders.claseNicho, n: count() }).from(tenders).groupBy(tenders.claseNicho),
      d
        .select({ n: count() })
        .from(tenders)
        .where(
          and(eq(tenders.estado, 'PUB'), inArray(tenders.claseNicho, [...VISIBLE_CLASSES])),
        ),
      d
        .select()
        .from(ingestionRuns)
        .where(eq(ingestionRuns.status, 'ok'))
        .orderBy(desc(ingestionRuns.finishedAt))
        .limit(1),
    ]);
    const counts = { total: 0, nucleo: 0, limitrofe: 0, marginal: 0 };
    for (const r of countRows) {
      const n = Number(r.n);
      counts.total += n;
      if (r.clase === 'nucleo') counts.nucleo = n;
      if (r.clase === 'limitrofe') counts.limitrofe = n;
      if (r.clase === 'marginal') counts.marginal = n;
    }
    const lastSyncAt = lastOk[0]?.finishedAt ? new Date(lastOk[0].finishedAt).toISOString() : null;
    const fuentes = await Promise.all(
      sourceRows.map(async (s) => {
        const [run] = await d
          .select()
          .from(ingestionRuns)
          .where(eq(ingestionRuns.sourceId, s.id))
          .orderBy(desc(ingestionRuns.startedAt))
          .limit(1);
        return {
          key: s.key,
          name: s.name,
          url: s.url,
          active: s.active,
          lastSuccessAt: s.lastSuccessAt ? new Date(s.lastSuccessAt).toISOString() : null,
          lastRun: run
            ? {
                status: run.status,
                startedAt: run.startedAt ? new Date(run.startedAt).toISOString() : null,
                finishedAt: run.finishedAt ? new Date(run.finishedAt).toISOString() : null,
                entriesSeen: run.entriesSeen,
                entriesNew: run.entriesNew,
                entriesUpdated: run.entriesUpdated,
              }
            : null,
        };
      }),
    );
    return reply.send({
      sources: fuentes,
      counts: {
        ...counts,
        abiertosNucleoLimitrofe: Number(pubRows[0]?.n ?? 0),
      },
      lastSyncAt,
      nota: 'Cobertura parcial: solo los feeds oficiales de PLACSP (643, perfiles en PLACSP, y 1044, plataformas agregadas sin menores). No se afirma cobertura exhaustiva de plataformas autonómicas.',
    });
  });

  app.get('/public/sample', async (request, reply) => {
    const d = requireDb(db);
    const q = (request.query ?? {}) as Record<string, unknown>;
    const rawLimit = Number(q['limit'] ?? 5);
    const limit = Number.isFinite(rawLimit) ? Math.min(10, Math.max(1, Math.floor(rawLimit))) : 5;
    const rows = await d
      .select()
      .from(tenders)
      .where(
        and(eq(tenders.estado, 'PUB'), inArray(tenders.claseNicho, [...VISIBLE_CLASSES])),
      )
      .orderBy(desc(tenders.publishedAt), desc(tenders.createdAt))
      .limit(limit);
    return reply.send({ items: rows.map((r) => toOpportunityJson(r)) });
  });
}
