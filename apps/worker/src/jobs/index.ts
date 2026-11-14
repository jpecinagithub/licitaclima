// LicitaClima — orquestador de trabajos (Fase C).
//
// Trabajos: ingest, documents, extract, analyze, publish, digest-weekly,
// alerts. Cada trabajo tiene intentos, próximo reintento (backoff con
// jitter), versión y trazabilidad (tabla jobs). El runner reclama trabajos
// pendientes (FOR UPDATE SKIP LOCKED en Postgres) y los ejecuta; un fallo
// reprograma el reintento, no pierde el trabajo.
//
// Uso (CLI en ./index.ts):
//   pnpm --filter @licitaclima/worker start -- run ingest --feed 643
//   pnpm --filter @licitaclima/worker start -- run-due

import { createDocumentStorage } from './documents.js';
import { runIngest } from './ingest.js';
import { runDocuments } from './documents.js';
import { runExtract } from './extract.js';
import { runAnalyze, runPublish } from './analyze.js';
import { runWeeklyDigest } from './digest-weekly.js';
import { runAlerts } from './alerts.js';
import type { WorkerStore } from '../db.js';

export type JobType = 'ingest' | 'documents' | 'extract' | 'analyze' | 'publish' | 'digest-weekly' | 'alerts';

export function nextRetryAt(attempts: number): string {
  const baseMs = Math.min(60 * 60_000, 2 ** attempts * 60_000); // 1, 2, 4… min, máx 1 h
  return new Date(Date.now() + baseMs + Math.random() * 30_000).toISOString();
}

export async function dispatchJob(
  store: WorkerStore,
  type: JobType,
  payload: Record<string, unknown>,
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
    case 'publish':
      return runPublish(store, { tenderId: String(payload['tenderId']) });
    case 'digest-weekly':
      return runWeeklyDigest(store, { organizationId: String(payload['organizationId']) });
    case 'alerts':
      return runAlerts(store, { tenderId: String(payload['tenderId']) });
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
export async function runDueJobs(store: WorkerStore, limit = 10): Promise<RunDueResult> {
  const jobs = await store.claimDueJobs(limit);
  let done = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      await dispatchJob(store, job.type as JobType, job.payload);
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
