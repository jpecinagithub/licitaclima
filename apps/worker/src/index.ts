// LicitaClima worker — orquestador de trabajos (Fases C + D).
//
// Uso:
//   DATABASE_URL=postgres://licitaclima:licitaclima@localhost:5432/licitaclima \
//     pnpm --filter @licitaclima/worker start -- run ingest --feed 643
//   ... start -- run ingest --feed 1044
//   ... start -- run-due            (ejecuta los trabajos pendientes, un lote)
//   ... start -- enqueue-ingest     (encola la ingesta de los dos feeds)
//   ... start -- digest --org <id>  (resumen semanal de una organización)
//   ... start -- run billing-reconcile | run billing-events | run email-outbox
//   ... start -- schedule           (demonio: cola cada 15 min, ingesta cada
//                                    6 h, conciliación diaria, digest semanal
//                                    los lunes 09:00 Europe/Madrid)
//
// Sin DATABASE_URL usa el store en memoria (no persistente) y lo avisa; los
// jobs de Fase D (billing-*, email-outbox) requieren DATABASE_URL.

import { createDb, createPool, type Db } from '@licitaclima/db';
import { createStoreFromEnv } from './db.js';
import { dispatchJob, enqueueIngestBothFeeds, runDueJobs, type JobType } from './jobs/index.js';
import { runWeeklyDigest } from './jobs/digest-weekly.js';
import { runScheduler } from './schedule.js';

function argValue(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  return idx >= 0 ? argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const store = await createStoreFromEnv();
  await store.ensureSchema();
  const databaseUrl = process.env.DATABASE_URL;
  const db: Db | undefined = databaseUrl ? createDb(createPool(databaseUrl)) : undefined;

  if (command === 'run') {
    const type = argv[1] as JobType;
    const payload: Record<string, unknown> = {};
    const feed = argValue(argv, '--feed');
    if (feed) payload['feed'] = feed;
    const maxPages = argValue(argv, '--max-pages');
    if (maxPages) payload['maxPages'] = Number(maxPages);
    const tenderId = argValue(argv, '--tender');
    if (tenderId) payload['tenderId'] = tenderId;
    const org = argValue(argv, '--org');
    if (org) payload['organizationId'] = org;
    const limit = argValue(argv, '--limit');
    if (limit) payload['limit'] = Number(limit);
    const result = await dispatchJob(store, type, payload, { db });
    console.log(JSON.stringify({ job: type, result }, null, 2));
    return;
  }
  if (command === 'run-due') {
    const result = await runDueJobs(store, Number(argValue(argv, '--limit') ?? 10), { db });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === 'enqueue-ingest') {
    await enqueueIngestBothFeeds(store);
    console.log('ingesta de 643 y 1044 encolada');
    return;
  }
  if (command === 'digest') {
    const org = argValue(argv, '--org');
    if (!org) throw new Error('falta --org <id>');
    const result = await runWeeklyDigest(store, { organizationId: org });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === 'schedule') {
    if (!db) throw new Error('schedule requiere DATABASE_URL');
    await runScheduler(store, db);
    return;
  }
  console.log([
    'LicitaClima worker — uso:',
    '  run ingest --feed 643|1044 [--max-pages N] | run documents --tender <id> | run extract --tender <id>',
    '  run analyze --tender <id> | run publish --tender <id> | run alerts --tender <id>',
    '  run digest-weekly --org <id> | run billing-reconcile | run billing-events [--limit N] | run email-outbox [--limit N]',
    '  run-due [--limit N] | enqueue-ingest | digest --org <id> | schedule',
  ].join('\n'));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
