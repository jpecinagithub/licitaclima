// LicitaClima — orquestador de trabajos (Fases C + D).
//
// Trabajos Fase C: ingest, documents, extract, analyze, publish,
// digest-weekly, alerts. Trabajos Fase D: billing-reconcile, billing-events,
// email-outbox (necesitan Db Drizzle: se pasan con opts.db; sin DATABASE_URL
// no se pueden ejecutar y dispatchJob lo dice explícitamente).
// Cada trabajo tiene intentos, próximo reintento (backoff con jitter), versión
// y trazabilidad (tabla jobs). El runner reclama trabajos pendientes
// (FOR UPDATE SKIP LOCKED en Postgres) y los ejecuta; un fallo reprograma el
// reintento, no pierde el trabajo.
//
// Uso (CLI en ./index.ts):
//   pnpm --filter @licitaclima/worker start -- run ingest --feed 643
//   pnpm --filter @licitaclima/worker start -- run-due
//   pnpm --filter @licitaclima/worker start -- schedule   (demonio: ingesta
//     cada 6 h, cola cada 15 min, conciliación diaria, digest semanal)

import { and, count, eq, or } from 'drizzle-orm';
import type { Db } from '@licitaclima/db';
import { jobs } from '@licitaclima/db';
import { createDocumentStorage } from './documents.js';
import { runIngest } from './ingest.js';
import { runDocuments } from './documents.js';
import { runExtract } from './extract.js';
import { runAnalyze, runPublish } from './analyze.js';
import { runPersonalizedAnalyze } from './personalized.js';
import { runWeeklyDigest } from './digest-weekly.js';
import { runAlerts } from './alerts.js';
import { processPendingStripeEvents, reconcileBilling } from './billing.js';
import { processEmailOutbox } from './email-outbox.js';
import type { WorkerStore } from '../db.js';

export type JobType =
  | 'ingest' | 'documents' | 'extract' | 'analyze' | 'publish' | 'digest-weekly' | 'alerts'
  | 'personalized-analyze'
  | 'billing-reconcile' | 'billing-events' | 'email-outbox';

export interface DispatchOpts {
  /** Db Drizzle; obligatorio para los jobs de Fase D. Sin él, esos jobs fallan con error claro. */
  db?: Db;
}

function requireDb(opts: DispatchOpts | undefined): Db {
  if (!opts?.db) throw new Error('este trabajo requiere DATABASE_URL (Db Drizzle no disponible)');
  return opts.db;
}

export function nextRetryAt(attempts: number): string {
  const baseMs = Math.min(60 * 60_000, 2 ** attempts * 60_000); // 1, 2, 4… min, máx 1 h
  return new Date(Date.now() + baseMs + Math.random() * 30_000).toISOString();
}

export async function dispatchJob(
  store: WorkerStore,
  type: JobType,
  payload: Record<string, unknown>,
  opts?: DispatchOpts,
): Promise<unknown> {
  const storage = createDocumentStorage();
  switch (type) {
    case 'ingest':
      return runIngest(store, { feed: (payload['feed'] as '643' | '1044') ?? '643', maxPages: (payload['maxPages'] as number | undefined) ?? 400 });
    case 'documents':
      return runDocuments(store, storage, { tenderId: String(payload['tenderId']) });
    case 'extract':
      return runExtract(store, storage, { tenderId: String(payload['tenderId']) });
    case 'analyze':
      return runAnalyze(store, { tenderId: String(payload['tenderId']) });
    case 'personalized-analyze':
      return runPersonalizedAnalyze(
        store,
        storage,
        {
          tenderId: String(payload['tenderId']),
          organizationId: String(payload['organizationId']),
          personalizedAnalysisId: String(payload['personalizedAnalysisId']),
        },
        requireDb(opts),
      );
    case 'publish':
      return runPublish(store, { tenderId: String(payload['tenderId']) });
    case 'digest-weekly':
      return runWeeklyDigest(store, { organizationId: String(payload['organizationId']) });
    case 'alerts':
      return runAlerts(store, { tenderId: String(payload['tenderId']) });
    case 'billing-reconcile':
      return reconcileBilling(requireDb(opts));
    case 'billing-events':
      return processPendingStripeEvents(requireDb(opts), (payload['limit'] as number | undefined) ?? 100);
    case 'email-outbox':
      return processEmailOutbox(requireDb(opts), { limit: (payload['limit'] as number | undefined) ?? 50 });
    default:
      throw new Error(`tipo de trabajo desconocido: ${type}`);
  }
}

export interface RunDueResult {
  claimed: number;
  done: number;
  failed: number;
}

/** Reclama y ejecuta los trabajos pendientes (un lote). */
export async function runDueJobs(store: WorkerStore, limit = 10, opts?: DispatchOpts): Promise<RunDueResult> {
  const jobs = await store.claimDueJobs(limit);
  let done = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      await dispatchJob(store, job.type as JobType, job.payload, opts);
      await store.completeJob(job.id);
      done += 1;
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      await store.failJob(job.id, message, nextRetryAt(job.attempts));
    }
  }
  return { claimed: jobs.length, done, failed };
}

/** Encola la ingesta de los dos feeds (cada 6 h, desde el planificador externo). */
export async function enqueueIngestBothFeeds(store: WorkerStore): Promise<void> {
  await store.enqueueJob('ingest', { feed: '643' });
  await store.enqueueJob('ingest', { feed: '1044' });
}

/**
 * Encola la ingesta solo si no hay ninguna ingesta pendiente o en curso.
 * Evita que el programador (cada 6 h) apile duplicados cuando una ingesta
 * anterior sigue en la cola. Requiere Db (consulta directa a la tabla jobs).
 */
export async function enqueueIngestIfNonePending(db: Db, store: WorkerStore): Promise<{ enqueued: boolean }> {
  const [row] = await db
    .select({ n: count() })
    .from(jobs)
    .where(and(eq(jobs.type, 'ingest'), or(eq(jobs.status, 'pending'), eq(jobs.status, 'running'))));
  if ((row?.n ?? 0) > 0) return { enqueued: false };
  await enqueueIngestBothFeeds(store);
  return { enqueued: true };
}
