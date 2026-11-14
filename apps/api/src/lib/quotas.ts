// LicitaClima — cuotas atómicas (Fase D, prompt §5 y §10).
// - La cuota se reinicia por PERIODO DE SUSCRIPCIÓN, no por mes natural.
// - Reserva al iniciar un análisis, confirma al entregar, libera si falla.
// - Revisitar un análisis NO consume; las rectificaciones oficiales del mismo
//   expediente en el periodo NO consumen (se reutiliza el análisis hecho).
// - Concurrencia: la reserva corre en transacción con bloqueo de fila
//   (SELECT ... FOR UPDATE sobre la suscripción) + clave de idempotencia
//   única en usage_ledger: dos reservas simultáneas con 1 unidad restante
//   solo dejan pasar a una; un reintento con la misma clave no consume dos veces.
// - Límites desde @licitaclima/config (PLAN): 10 análisis, 100 consultas.
// - Pausa de admin (`pause.new_analyses` en system_settings) bloquea nuevas
//   reservas de análisis sin bloquear acceso ni cancelación.
import { and, eq, sql } from 'drizzle-orm';
import type { Db } from '@licitaclima/db';
import {
  organizations,
  personalizedAnalyses,
  subscriptions,
  systemSettings,
  usageLedger,
} from '@licitaclima/db';
import { PLAN } from '@licitaclima/config';
import { hasAccess } from '@licitaclima/integrations';
import { ApiError } from './errors.js';

export type QuotaKind = 'personalized_analysis' | 'chat_question';

export const QUOTA_LIMITS: Record<QuotaKind, number> = {
  personalized_analysis: PLAN.maxPersonalizedAnalysesPerPeriod,
  chat_question: PLAN.maxChatQuestionsPerPeriod,
};

export const quotaExceeded = (message = 'Cuota del periodo agotada.') =>
  new ApiError(409, 'quota_exceeded', message);

export const quotaPaused = (message = 'Nuevos análisis en pausa por el administrador.') =>
  new ApiError(409, 'paused', message);

export interface Period {
  start: Date;
  end: Date;
}

/** Periodo vigente: el de la suscripción; sin suscripción, el mes natural UTC. */
export async function getCurrentPeriod(db: Db, organizationId: string): Promise<Period> {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);
  if (sub?.currentPeriodStart && sub?.currentPeriodEnd) {
    return { start: sub.currentPeriodStart, end: sub.currentPeriodEnd };
  }
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

async function usedUnits(
  tx: Db,
  organizationId: string,
  kind: QuotaKind,
  periodStart: Date,
): Promise<number> {
  const [row] = await tx
    .select({
      total: sql<number>`coalesce(sum(case when ${usageLedger.action} = 'reserve' then ${usageLedger.units} when ${usageLedger.action} = 'release' then -${usageLedger.units} else 0 end), 0)`,
    })
    .from(usageLedger)
    .where(
      and(
        eq(usageLedger.organizationId, organizationId),
        eq(usageLedger.kind, kind),
        eq(usageLedger.periodStart, periodStart),
      ),
    );
  return Number(row?.total ?? 0);
}

export interface QuotaStatus {
  subscriptionStatus: string;
  hasAccess: boolean;
  periodStart: Date;
  periodEnd: Date;
  analyses: { limit: number; used: number; remaining: number };
  chat: { limit: number; used: number; remaining: number };
}

export async function getQuotaStatus(db: Db, organizationId: string): Promise<QuotaStatus> {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);
  const status = sub?.status ?? 'free';
  const period = await getCurrentPeriod(db, organizationId);
  const analysesUsed = await usedUnits(db, organizationId, 'personalized_analysis', period.start);
  const chatUsed = await usedUnits(db, organizationId, 'chat_question', period.start);
  const analysesLimit = QUOTA_LIMITS.personalized_analysis;
  const chatLimit = QUOTA_LIMITS.chat_question;
  return {
    subscriptionStatus: status,
    hasAccess: hasAccess({ status, currentPeriodEnd: sub?.currentPeriodEnd ?? null }),
    periodStart: period.start,
    periodEnd: period.end,
    analyses: { limit: analysesLimit, used: analysesUsed, remaining: Math.max(0, analysesLimit - analysesUsed) },
    chat: { limit: chatLimit, used: chatUsed, remaining: Math.max(0, chatLimit - chatUsed) },
  };
}

export interface ReserveInput {
  organizationId: string;
  kind: QuotaKind;
  /** Expediente/análisis al que se imputa (para reutilización y auditoría). */
  referenceId?: string | null;
  /** Clave de idempotencia del cliente: un reintento no consume dos veces. */
  idempotencyKey: string;
}

export interface ReserveResult {
  ok: true;
  alreadyReserved: boolean;
  remaining: number;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Reserva 1 unidad de forma atómica. Lanza `quota_exceeded` (409) si no queda
 * cuota o la suscripción no da acceso, y `paused` (409) si el admin pausó los
 * nuevos análisis. El reintento con la misma idempotencyKey devuelve la
 * reserva existente sin consumir de nuevo.
 */
export async function reserveQuota(db: Db, input: ReserveInput): Promise<ReserveResult> {
  return db.transaction(async (tx) => {
    // Bloqueo de fila: serializa reservas concurrentes de la misma organización.
    const [sub] = await tx
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, input.organizationId))
      .for('update')
      .limit(1);
    if (!sub) {
      // Sin fila que bloquear, se bloquea la organización.
      await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, input.organizationId))
        .for('update')
        .limit(1);
    }
    const period = sub?.currentPeriodStart && sub?.currentPeriodEnd
      ? { start: sub.currentPeriodStart, end: sub.currentPeriodEnd }
      : await getCurrentPeriod(tx as unknown as Db, input.organizationId);

    // Reintento idempotente: la reserva ya existe.
    const [existing] = await tx
      .select()
      .from(usageLedger)
      .where(eq(usageLedger.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (existing) {
      const used = await usedUnits(tx as unknown as Db, input.organizationId, input.kind, period.start);
      const limit = QUOTA_LIMITS[input.kind];
      return { ok: true as const, alreadyReserved: true, remaining: Math.max(0, limit - used), periodStart: period.start, periodEnd: period.end };
    }

    if (input.kind === 'personalized_analysis') {
      const [pause] = await tx
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.key, 'pause.new_analyses'))
        .limit(1);
      if (pause && (pause.value as { paused?: boolean })?.paused === true) throw quotaPaused();
    }

    if (!hasAccess({ status: sub?.status ?? 'free', currentPeriodEnd: sub?.currentPeriodEnd ?? null })) {
      throw quotaExceeded('Se requiere una suscripción activa para usar esta cuota.');
    }

    const used = await usedUnits(tx as unknown as Db, input.organizationId, input.kind, period.start);
    const limit = QUOTA_LIMITS[input.kind];
    if (used >= limit) throw quotaExceeded();

    await tx.insert(usageLedger).values({
      organizationId: input.organizationId,
      subscriptionId: sub?.id ?? null,
      kind: input.kind,
      referenceId: input.referenceId ?? null,
      periodStart: period.start,
      periodEnd: period.end,
      units: 1,
      action: 'reserve',
      idempotencyKey: input.idempotencyKey,
    });
    return { ok: true as const, alreadyReserved: false, remaining: limit - used - 1, periodStart: period.start, periodEnd: period.end };
  });
}

/**
 * Confirma la entrega (no consume unidades extra: la reserva ya contó).
 * Idempotente por clave `confirm:<clave de reserva>`.
 */
export async function confirmQuota(db: Db, reserveIdempotencyKey: string): Promise<boolean> {
  const [reserve] = await db
    .select()
    .from(usageLedger)
    .where(eq(usageLedger.idempotencyKey, reserveIdempotencyKey))
    .limit(1);
  if (!reserve) return false;
  const confirmKey = `confirm:${reserveIdempotencyKey}`;
  const [row] = await db
    .insert(usageLedger)
    .values({
      organizationId: reserve.organizationId,
      subscriptionId: reserve.subscriptionId,
      kind: reserve.kind,
      referenceId: reserve.referenceId,
      periodStart: reserve.periodStart,
      periodEnd: reserve.periodEnd,
      units: 0,
      action: 'confirm',
      idempotencyKey: confirmKey,
    })
    .onConflictDoNothing()
    .returning();
  return Boolean(row);
}

/**
 * Libera la unidad reservada (fallo en el análisis). Idempotente por clave
 * `release:<clave de reserva>`: una segunda liberación no resta dos veces.
 */
export async function releaseQuota(db: Db, reserveIdempotencyKey: string): Promise<boolean> {
  const [reserve] = await db
    .select()
    .from(usageLedger)
    .where(eq(usageLedger.idempotencyKey, reserveIdempotencyKey))
    .limit(1);
  if (!reserve || reserve.action !== 'reserve') return false;
  const releaseKey = `release:${reserveIdempotencyKey}`;
  const [row] = await db
    .insert(usageLedger)
    .values({
      organizationId: reserve.organizationId,
      subscriptionId: reserve.subscriptionId,
      kind: reserve.kind,
      referenceId: reserve.referenceId,
      periodStart: reserve.periodStart,
      periodEnd: reserve.periodEnd,
      units: 1,
      action: 'release',
      idempotencyKey: releaseKey,
    })
    .onConflictDoNothing()
    .returning();
  return Boolean(row);
}

/**
 * ¿Debe consumir una unidad este análisis? NO si ya existe un análisis
 * personalizado terminado para el mismo expediente y organización
 * (revisita, o rectificación oficial del mismo expediente: se reutiliza el
 * análisis entregado y, si cambió el pliego, se actualiza sin consumir).
 */
export async function shouldConsumeForAnalysis(
  db: Db,
  input: { organizationId: string; tenderId: string },
): Promise<{ consume: boolean; existingAnalysisId: string | null; reason: string }> {
  const [existing] = await db
    .select({ id: personalizedAnalyses.id })
    .from(personalizedAnalyses)
    .where(
      and(
        eq(personalizedAnalyses.organizationId, input.organizationId),
        eq(personalizedAnalyses.tenderId, input.tenderId),
        eq(personalizedAnalyses.status, 'done'),
      ),
    )
    .limit(1);
  if (existing) {
    return { consume: false, existingAnalysisId: existing.id, reason: 'revisit_or_rectification' };
  }
  return { consume: true, existingAnalysisId: null, reason: 'new_analysis' };
}
