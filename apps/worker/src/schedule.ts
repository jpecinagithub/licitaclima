// LicitaClima worker — programador interno (Fase F).
//
// Cadencias (prompt §3 y §10, decisión 2026-11-14: resumen SEMANAL):
//   - cada 15 min: ejecuta la cola (run-due) + eventos Stripe pendientes +
//     outbox de correo. Las tres operaciones son idempotentes y no hacen nada
//     útil sin proveedor configurado (Stripe/correo PENDIENTES: devuelven
//     'pending' en vez de enviar o cobrar nada).
//   - cada 6 h: encola la ingesta de los dos feeds (643 y 1044), solo si no
//     hay ninguna ingesta pendiente o en curso (anti-duplicado).
//   - cada 24 h: conciliación con Stripe (no-op sin claves).
//   - lunes 09:00 Europe/Madrid: encola el digest semanal por cada
//     organización con suscripción activa. El digest es idempotente por
//     (organización, semana): un reencolado no duplica el envío.
//
// El worker sigue siendo invocable por lotes (run / run-due /
// enqueue-ingest) para cron externo; `schedule` es la alternativa en
// proceso único para despliegues con un solo contenedor de worker.

import { eq } from 'drizzle-orm';
import type { Db } from '@licitaclima/db';
import { subscriptions } from '@licitaclima/db';
import { processPendingStripeEvents, reconcileBilling } from './jobs/billing.js';
import { processEmailOutbox } from './jobs/email-outbox.js';
import {
  enqueueIngestIfNonePending,
  runDueJobs,
} from './jobs/index.js';
import type { WorkerStore as Store } from './db.js';

export const DUE_INTERVAL_MS = 15 * 60_000;
export const INGEST_INTERVAL_MS = 6 * 60 * 60_000;
export const RECONCILE_INTERVAL_MS = 24 * 60 * 60_000;
export const WEEK_MS = 7 * 24 * 60 * 60_000;

/** Organizaciones con suscripción activa (destinatarias del digest semanal). */
export async function listActiveOrganizationIds(db: Db): Promise<string[]> {
  const rows = await db
    .select({ organizationId: subscriptions.organizationId })
    .from(subscriptions)
    .where(eq(subscriptions.status, 'active'));
  return [...new Set(rows.map((r) => r.organizationId))];
}

/** Próximo lunes 09:00 Europe/Madrid (instante UTC) a partir de `from`. */
export function nextMonday0900Madrid(from: Date): Date {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const candidate = new Date(from.getTime());
  // Redondea a la siguiente hora en punto (UTC): los pasos de 1 h caen
  // siempre en minutos :00, así que el lunes 09:00 Madrid se alcanza.
  candidate.setUTCMinutes(0, 0, 0);
  candidate.setTime(candidate.getTime() + 60 * 60_000);
  for (let i = 0; i < 8 * 24 + 1; i++) {
    const parts = Object.fromEntries(
      fmt.formatToParts(candidate).map((p) => [p.type, p.value]),
    );
    if (parts['weekday'] === 'Mon' && parts['hour'] === '09' && parts['minute'] === '00') {
      return candidate;
    }
    candidate.setTime(candidate.getTime() + 60 * 60_000);
  }
  throw new Error('no se encontró el próximo lunes 09:00 (Europe/Madrid)');
}

function log(tick: string, result: unknown): void {
  console.log(JSON.stringify({ tick, at: new Date().toISOString(), result }));
}

async function tickDue(store: Store, db: Db): Promise<void> {
  try {
    log('due', await runDueJobs(store, 10, { db }));
  } catch (err) {
    console.error('[schedule:due]', err instanceof Error ? err.message : String(err));
  }
  try {
    log('billing-events', await processPendingStripeEvents(db));
  } catch (err) {
    console.error('[schedule:billing-events]', err instanceof Error ? err.message : String(err));
  }
  try {
    log('email-outbox', await processEmailOutbox(db));
  } catch (err) {
    console.error('[schedule:email-outbox]', err instanceof Error ? err.message : String(err));
  }
}

async function tickIngest(store: Store, db: Db): Promise<void> {
  try {
    log('ingest', await enqueueIngestIfNonePending(db, store));
  } catch (err) {
    console.error('[schedule:ingest]', err instanceof Error ? err.message : String(err));
  }
}

async function tickReconcile(db: Db): Promise<void> {
  try {
    log('billing-reconcile', await reconcileBilling(db));
  } catch (err) {
    console.error('[schedule:billing-reconcile]', err instanceof Error ? err.message : String(err));
  }
}

async function tickDigest(store: Store, db: Db): Promise<void> {
  try {
    const orgs = await listActiveOrganizationIds(db);
    for (const organizationId of orgs) {
      await store.enqueueJob('digest-weekly', { organizationId });
    }
    log('digest-weekly', { enqueued: orgs.length });
  } catch (err) {
    console.error('[schedule:digest-weekly]', err instanceof Error ? err.message : String(err));
  }
}

/** Bucle del programador. No retorna (demonio); SIGINT/SIGTERM paran limpio. */
export async function runScheduler(store: Store, db: Db): Promise<never> {
  console.log(
    JSON.stringify({
      scheduler: 'LicitaClima worker',
      dueCadaMin: DUE_INTERVAL_MS / 60_000,
      ingestaCadaH: INGEST_INTERVAL_MS / 3_600_000,
      conciliacionCadaH: RECONCILE_INTERVAL_MS / 3_600_000,
      digest: 'lunes 09:00 Europe/Madrid',
    }),
  );
  await tickDue(store, db);
  await tickIngest(store, db);
  await tickReconcile(db);

  const dueTimer = setInterval(() => void tickDue(store, db), DUE_INTERVAL_MS);
  const ingestTimer = setInterval(() => void tickIngest(store, db), INGEST_INTERVAL_MS);
  const reconcileTimer = setInterval(() => void tickReconcile(db), RECONCILE_INTERVAL_MS);

  let digestTimer: ReturnType<typeof setTimeout> | undefined;
  const planDigest = () => {
    const next = nextMonday0900Madrid(new Date());
    const delay = Math.max(0, next.getTime() - Date.now());
    console.log(JSON.stringify({ digestProximo: next.toISOString() }));
    digestTimer = setTimeout(() => {
      void tickDigest(store, db).finally(planDigest);
    }, delay);
  };
  planDigest();

  const stop = () => {
    clearInterval(dueTimer);
    clearInterval(ingestTimer);
    clearInterval(reconcileTimer);
    if (digestTimer) clearTimeout(digestTimer);
    console.log('programador detenido');
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return new Promise<never>(() => {});
}
