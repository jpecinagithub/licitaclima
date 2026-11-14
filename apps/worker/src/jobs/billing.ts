// LicitaClima worker — facturación (Fase D).
// - Reconciliación diaria con Stripe: SOLO se ejecuta si hay claves.
// - Procesado de eventos Stripe en cola: el webhook persiste el evento y
//   encola el trabajo; este job lo aplica de forma idempotente (duplicados y
//   eventos fuera de orden tolerados en applyStripeEvent).
import { asc, eq, isNull } from 'drizzle-orm';
import type { Db } from '@licitaclima/db';
import { stripeEvents } from '@licitaclima/db';
import { applyStripeEvent, isStripeConfigured, reconcileStripe } from '@licitaclima/integrations';

export interface ProcessStripeEventsResult {
  status: 'ok';
  processed: number;
  applied: number;
  skipped: number;
  errors: Array<{ eventId: string; error: string }>;
}

/** Aplica los eventos Stripe pendientes (processed_at IS NULL), en orden de llegada. */
export async function processPendingStripeEvents(db: Db, limit = 100): Promise<ProcessStripeEventsResult> {
  const pending = await db
    .select()
    .from(stripeEvents)
    .where(isNull(stripeEvents.processedAt))
    .orderBy(asc(stripeEvents.createdAt))
    .limit(limit);
  let applied = 0;
  let skipped = 0;
  const errors: Array<{ eventId: string; error: string }> = [];
  for (const row of pending) {
    try {
      const result = await applyStripeEvent(db, row.payload as unknown as Parameters<typeof applyStripeEvent>[1]);
      if (result.applied) applied += 1;
      else skipped += 1;
    } catch (err) {
      errors.push({ eventId: row.eventId, error: (err as Error).message });
    }
  }
  return { status: 'ok', processed: pending.length, applied, skipped, errors };
}

export interface ReconcileBillingResult {
  status: 'ok' | 'pending';
  reason?: string;
  checked?: number;
  updated?: number;
  unknown?: string[];
}

/** Reconciliación diaria con Stripe. Sin claves, PENDIENTE (no hace nada). */
export async function reconcileBilling(
  db: Db,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ReconcileBillingResult> {
  if (!isStripeConfigured(env)) {
    return { status: 'pending', reason: 'stripe_not_configured' };
  }
  const result = await reconcileStripe(db, env);
  return { status: 'ok', ...result };
}
