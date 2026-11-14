// LicitaClima — adaptador Stripe (Fase D).
// SOLO modo test y SOLO con configuración. Sin claves, el adaptador queda en
// estado `pending` y el checkout responde 503 `stripe_not_configured`.
// El acceso NUNCA se activa por la URL de éxito del Checkout: solo por
// webhook verificado (checkout.session.completed / invoice.paid) o por la
// reconciliación diaria. Los importes nunca vienen del cliente: el price_id
// sale únicamente de la configuración permitida (STRIPE_PRICE_ID).
// Una clave live se RECHAZA (stripe_live_not_allowed): este MVP no cobra en
// producción sin activación explícita y revisión fiscal/legal.
import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import type { Db } from '@licitaclima/db';
import { plans, stripeEvents, subscriptions } from '@licitaclima/db';
import { PLAN } from '@licitaclima/config';
import type { SubscriptionStatus } from '@licitaclima/domain';

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  priceId: string;
  publishableKey: string;
  /** 'test' | 'live' | 'missing' (sin claves). */
  mode: 'test' | 'live' | 'missing';
}

/** Lee la configuración de Stripe del entorno (sin valores por defecto). */
export function getStripeConfig(env: NodeJS.ProcessEnv = process.env): StripeConfig {
  const secretKey = (env.STRIPE_SECRET_KEY ?? '').trim();
  const webhookSecret = (env.STRIPE_WEBHOOK_SECRET ?? '').trim();
  const priceId = (env.STRIPE_PRICE_ID ?? '').trim();
  const publishableKey = (env.STRIPE_PUBLISHABLE_KEY ?? '').trim();
  const mode: StripeConfig['mode'] =
    !secretKey ? 'missing' : secretKey.startsWith('sk_live_') ? 'live' : 'test';
  return { secretKey, webhookSecret, priceId, publishableKey, mode };
}

/** Estado del adaptador: 'configured' | 'pending' (sin claves) | 'live_blocked'. */
export type StripeAdapterStatus = 'configured' | 'pending' | 'live_blocked';

export function stripeStatus(env: NodeJS.ProcessEnv = process.env): StripeAdapterStatus {
  const cfg = getStripeConfig(env);
  if (cfg.mode === 'live') return 'live_blocked';
  if (cfg.mode === 'missing' || !cfg.webhookSecret || !cfg.priceId) return 'pending';
  return 'configured';
}

export function isStripeConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return stripeStatus(env) === 'configured';
}

export class StripeNotConfiguredError extends Error {
  readonly code = 'stripe_not_configured';
  constructor(message = 'Stripe no configurado (PENDIENTE: faltan claves de test).') {
    super(message);
    this.name = 'StripeNotConfiguredError';
  }
}

export class StripeLiveBlockedError extends Error {
  readonly code = 'stripe_live_not_allowed';
  constructor(message = 'Clave live de Stripe rechazada: este MVP solo opera en modo test.') {
    super(message);
    this.name = 'StripeLiveBlockedError';
  }
}

function requireTestConfig(env: NodeJS.ProcessEnv = process.env): StripeConfig {
  const cfg = getStripeConfig(env);
  if (cfg.mode === 'live') throw new StripeLiveBlockedError();
  if (cfg.mode === 'missing' || !cfg.webhookSecret || !cfg.priceId) {
    throw new StripeNotConfiguredError();
  }
  return cfg;
}

export function createStripeClient(env: NodeJS.ProcessEnv = process.env): Stripe | null {
  const cfg = getStripeConfig(env);
  if (cfg.mode !== 'test') return null;
  return new Stripe(cfg.secretKey);
}

/** El price_id permitido sale SOLO de la configuración; nunca del cliente. */
export function allowedPriceId(env: NodeJS.ProcessEnv = process.env): string {
  return requireTestConfig(env).priceId;
}

export interface CheckoutInput {
  organizationId: string;
  email: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  url: string | null;
  sessionId: string;
}

/**
 * Crea una Checkout Session de suscripción (modo test).
 * No activa ningún acceso: la activación llega por webhook verificado.
 * Anti-doble-clic: la idempotencia la da Stripe con la clave por organización.
 */
export async function createCheckoutSession(
  input: CheckoutInput,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CheckoutSessionResult> {
  const cfg = requireTestConfig(env);
  const stripe = new Stripe(cfg.secretKey);
  const session = await stripe.checkout.sessions.create(
    {
      mode: 'subscription',
      line_items: [{ price: cfg.priceId, quantity: 1 }],
      customer_email: input.email,
      client_reference_id: input.organizationId,
      metadata: { organizationId: input.organizationId, planId: PLAN.id },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    },
    { idempotencyKey: `checkout:${input.organizationId}` },
  );
  return { url: session.url, sessionId: session.id };
}

export async function createPortalSession(
  input: { customerId: string; returnUrl: string },
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ url: string }> {
  const cfg = requireTestConfig(env);
  const stripe = new Stripe(cfg.secretKey);
  const session = await stripe.billingPortal.sessions.create({
    customer: input.customerId,
    return_url: input.returnUrl,
  });
  return { url: session.url };
}

/** Cancela al final del periodo pagado (el acceso se mantiene hasta entonces). */
export async function cancelSubscriptionAtPeriodEnd(
  stripeSubscriptionId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const cfg = requireTestConfig(env);
  const stripe = new Stripe(cfg.secretKey);
  await stripe.subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: true });
}

/**
 * Verifica la firma del webhook con el raw body. Lanza si la firma no es
 * válida o si Stripe no está configurado. Nunca se confía en el JSON ya
 * parseado: la firma se comprueba sobre el cuerpo crudo.
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signature: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Stripe.Event {
  const cfg = requireTestConfig(env);
  const stripe = new Stripe(cfg.secretKey);
  if (!signature) throw new Error('Falta la firma del webhook de Stripe (stripe-signature).');
  return stripe.webhooks.constructEvent(rawBody, signature, cfg.webhookSecret);
}

function toDate(unixSeconds: number | null | undefined): Date | null {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000);
}

/**
 * Mapeo estado Stripe → estado local (prompt §10).
 * - trialing se trata como active (periodo de prueba de la suscripción).
 * - incomplete / unpaid → past_due (pago pendiente, con gracia configurable).
 * - incomplete_expired → ended. paused → past_due.
 */
export function mapStripeSubscriptionStatus(sub: {
  status: string;
  cancel_at_period_end?: boolean | null;
  current_period_end?: number | null;
}): SubscriptionStatus {
  switch (sub.status) {
    case 'active':
    case 'trialing':
      if (sub.cancel_at_period_end) return 'canceled_at_period_end';
      return 'active';
    case 'past_due':
    case 'incomplete':
    case 'unpaid':
    case 'paused':
      return 'past_due';
    case 'canceled':
      if (sub.cancel_at_period_end) return 'canceled_at_period_end';
      return 'ended';
    case 'incomplete_expired':
      return 'ended';
    default:
      return 'free';
  }
}

/**
 * ¿Tiene acceso la suscripción? Activa sí; past_due sí dentro de la gracia
 * configurable (PLAN.graceDaysAfterFailedRenewal, 3 días) tras el fin del
 * periodo; canceled_at_period_end sí hasta el fin pagado; ended/free no
 * (acceso limitado a cuenta/facturación).
 */
export function hasAccess(
  sub: { status: string; currentPeriodEnd: Date | null },
  now = new Date(),
): boolean {
  if (sub.status === 'active' || sub.status === 'canceled_at_period_end') return true;
  if (sub.status === 'past_due') {
    if (!sub.currentPeriodEnd) return false;
    const graceMs = PLAN.graceDaysAfterFailedRenewal * 24 * 60 * 60 * 1000;
    return now.getTime() <= sub.currentPeriodEnd.getTime() + graceMs;
  }
  return false;
}

export async function ensurePlan(db: Db) {
  const [plan] = await db
    .insert(plans)
    .values({
      key: PLAN.id,
      name: PLAN.name,
      priceAmount: String(PLAN.priceEurExclTax),
      currency: PLAN.currency,
      interval: PLAN.interval,
      maxUsers: PLAN.maxUsers,
      maxCompanyProfiles: PLAN.maxCompanyProfiles,
      maxProvinces: PLAN.maxProvinces,
      maxPersonalizedAnalyses: PLAN.maxPersonalizedAnalysesPerPeriod,
      maxChatQuestions: PLAN.maxChatQuestionsPerPeriod,
      graceDays: PLAN.graceDaysAfterFailedRenewal,
      stripePriceId: process.env.STRIPE_PRICE_ID?.trim() || null,
      active: true,
      version: 1,
    })
    .onConflictDoNothing()
    .returning();
  if (plan) return plan;
  const [existing] = await db.select().from(plans).where(eq(plans.key, PLAN.id)).limit(1);
  return existing;
}

export interface ApplyStripeEventResult {
  applied: boolean;
  reason: string;
}

interface StripeEventLike {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
}

/**
 * Aplica un evento Stripe ya verificado. Idempotente y tolerante a duplicados
 * y a eventos fuera de orden:
 * - event_id único en stripe_events: un duplicado no se reprocesa.
 * - customer.subscription.updated con `created` anterior al último aplicado
 *   para esa suscripción se ignora (stale).
 * - Tras aplicar, se marca processed_at. Los tipos desconocidos se registran
 *   sin aplicar cambios (no se pierde el evento).
 */
export async function applyStripeEvent(
  db: Db,
  event: StripeEventLike,
): Promise<ApplyStripeEventResult> {
  const [existing] = await db
    .select({ id: stripeEvents.id, processedAt: stripeEvents.processedAt })
    .from(stripeEvents)
    .where(eq(stripeEvents.eventId, event.id))
    .limit(1);
  // Duplicado ya procesado: no se reprocesa. Si existe pero sin procesar
  // (lo persistió el webhook y lo aplica el worker), se continúa.
  if (existing?.processedAt) return { applied: false, reason: 'duplicate' };
  if (!existing) {
    await db
      .insert(stripeEvents)
      .values({
        eventId: event.id,
        type: event.type,
        payload: event as unknown as Record<string, unknown>,
      })
      .onConflictDoNothing();
  }

  const obj = event.data.object as Record<string, unknown>;
  const markProcessed = async () => {
    await db
      .update(stripeEvents)
      .set({ processedAt: new Date() })
      .where(eq(stripeEvents.eventId, event.id));
  };

  const findByStripeSub = async (stripeSubId: string) => {
    const [row] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubId))
      .limit(1);
    return row;
  };
  const findByCustomer = async (customerId: string) => {
    const [row] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeCustomerId, customerId))
      .limit(1);
    return row;
  };

  let result: ApplyStripeEventResult = { applied: false, reason: 'recorded_only' };

  if (event.type === 'checkout.session.completed') {
    // El Checkout NO activa por redirect: es este webhook quien crea la suscripción.
    const organizationId = (obj.metadata as Record<string, unknown> | undefined)?.organizationId;
    const stripeSubId = obj.subscription as string | undefined;
    const customerId = obj.customer as string | undefined;
    if (typeof organizationId === 'string' && stripeSubId && customerId) {
      const plan = await ensurePlan(db);
      if (plan) {
        const [current] = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.organizationId, organizationId))
          .limit(1);
        if (current) {
          await db
            .update(subscriptions)
            .set({
              stripeCustomerId: customerId,
              stripeSubscriptionId: stripeSubId,
              status: 'active',
              updatedAt: new Date(),
            })
            .where(eq(subscriptions.id, current.id));
        } else {
          await db.insert(subscriptions).values({
            organizationId,
            planId: plan.id,
            stripeCustomerId: customerId,
            stripeSubscriptionId: stripeSubId,
            status: 'active',
          });
        }
        result = { applied: true, reason: 'subscription_created' };
      }
    } else {
      result = { applied: false, reason: 'missing_metadata' };
    }
  } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    const stripeSubId =
      (obj.subscription as string | undefined) ??
      (obj.lines as { data?: Array<{ subscription?: string }> } | undefined)?.data?.[0]?.subscription;
    const customerId = obj.customer as string | undefined;
    const sub = stripeSubId
      ? await findByStripeSub(stripeSubId)
      : customerId
        ? await findByCustomer(customerId)
        : undefined;
    if (sub) {
      if (event.type === 'invoice.paid') {
        await db
          .update(subscriptions)
          .set({
            status: 'active',
            cancelAtPeriodEnd: false,
            currentPeriodStart: toDate(obj.period_start as number | undefined) ?? sub.currentPeriodStart,
            currentPeriodEnd: toDate(obj.period_end as number | undefined) ?? sub.currentPeriodEnd,
            lastStripeEventAt: event.created,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.id, sub.id));
      } else {
        // Fallo de renovación: past_due; la gracia (3 días) la aplica hasAccess().
        await db
          .update(subscriptions)
          .set({ status: 'past_due', lastStripeEventAt: event.created, updatedAt: new Date() })
          .where(eq(subscriptions.id, sub.id));
      }
      result = { applied: true, reason: event.type };
    } else {
      result = { applied: false, reason: 'unknown_subscription' };
    }
  } else if (
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const stripeSubId = obj.id as string | undefined;
    const sub = stripeSubId ? await findByStripeSub(stripeSubId) : undefined;
    if (!sub) {
      // Puede llegar antes que checkout.session.completed: se registra y la
      // reconciliación diaria lo concilia cuando exista la suscripción local.
      result = { applied: false, reason: 'unknown_subscription' };
    } else if (
      sub.lastStripeEventAt !== null &&
      sub.lastStripeEventAt !== undefined &&
      event.created < sub.lastStripeEventAt
    ) {
      result = { applied: false, reason: 'stale_event' };
    } else if (event.type === 'customer.subscription.deleted') {
      await db
        .update(subscriptions)
        .set({
          status: 'ended',
          cancelAtPeriodEnd: false,
          canceledAt: new Date(),
          lastStripeEventAt: event.created,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, sub.id));
      result = { applied: true, reason: 'subscription_deleted' };
    } else {
      const status = mapStripeSubscriptionStatus({
        status: String(obj.status ?? 'active'),
        cancel_at_period_end: (obj.cancel_at_period_end as boolean | null) ?? null,
        current_period_end: (obj.current_period_end as number | null) ?? null,
      });
      await db
        .update(subscriptions)
        .set({
          status,
          currentPeriodStart: toDate(obj.current_period_start as number | undefined) ?? sub.currentPeriodStart,
          currentPeriodEnd: toDate(obj.current_period_end as number | undefined) ?? sub.currentPeriodEnd,
          cancelAtPeriodEnd: Boolean(obj.cancel_at_period_end ?? false),
          canceledAt: toDate(obj.canceled_at as number | undefined) ?? sub.canceledAt,
          lastStripeEventAt: event.created,
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.id, sub.id));
      result = { applied: true, reason: 'subscription_updated' };
    }
  } else if (event.type === 'charge.refunded' || event.type === 'charge.dispute.created') {
    // Reembolsos y disputas se registran y escalan: no hay reembolso automático.
    result = { applied: true, reason: 'recorded_for_review' };
  }

  await markProcessed();
  return result;
}

/**
 * Reconciliación diaria con Stripe: consulta el estado vigente en Stripe y
 * actualiza las suscripciones locales conocidas. Solo se ejecuta si hay
 * claves (el job comprueba `isStripeConfigured` antes de llamarla).
 */
export async function reconcileStripe(
  db: Db,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ checked: number; updated: number; unknown: string[] }> {
  const cfg = requireTestConfig(env);
  const stripe = new Stripe(cfg.secretKey);
  const list = await stripe.subscriptions.list({ limit: 100, status: 'all' });
  let updated = 0;
  const unknown: string[] = [];
  for (const sub of list.data) {
    const [local] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, sub.id))
      .limit(1);
    if (!local) {
      unknown.push(sub.id);
      continue;
    }
    const status = mapStripeSubscriptionStatus({
      status: sub.status,
      cancel_at_period_end: sub.cancel_at_period_end,
      current_period_end: sub.current_period_end,
    });
    await db
      .update(subscriptions)
      .set({
        status,
        currentPeriodStart: toDate(sub.current_period_start) ?? local.currentPeriodStart,
        currentPeriodEnd: toDate(sub.current_period_end) ?? local.currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        canceledAt: toDate(sub.canceled_at) ?? local.canceledAt,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, local.id));
    updated += 1;
  }
  return { checked: list.data.length, updated, unknown };
}
