import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdOnly, idColumn, timestamps } from './common.js';
import { organizations } from './core.js';

/**
 * Planes, suscripciones, cuota y Stripe.
 * Dinero en numeric(19,4) (unidades de EUR, nunca float).
 * Los importes de Stripe se guardan en unidades mínimas (céntimos) cuando
 * vienen del webhook; aquí los importes de plan son EUR con 4 decimales.
 */

export const plans = pgTable(
  'plans',
  {
    id: idColumn(),
    /** Clave estable, p. ej. 'licitaclima-mensual-v1'. Versionada en config. */
    key: text('key').notNull(),
    name: text('name').notNull(),
    priceAmount: numeric('price_amount', { precision: 19, scale: 4 }).notNull(),
    currency: text('currency').notNull().default('EUR'),
    interval: text('interval').notNull().default('month'),
    maxUsers: integer('max_users').notNull().default(1),
    maxCompanyProfiles: integer('max_company_profiles').notNull().default(1),
    maxProvinces: integer('max_provinces').notNull().default(3),
    maxPersonalizedAnalyses: integer('max_personalized_analyses').notNull().default(10),
    maxChatQuestions: integer('max_chat_questions').notNull().default(100),
    graceDays: integer('grace_days').notNull().default(3),
    /** Stripe price_id permitido (el backend lo elige de la config; nunca del cliente). */
    stripePriceId: text('stripe_price_id'),
    active: boolean('active').notNull().default(true),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => [uniqueIndex('plans_key_uq').on(t.key)],
);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: idColumn(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'restrict' }),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    /** 'free' | 'active' | 'past_due' | 'canceled_at_period_end' | 'ended' */
    status: text('status').notNull().default('free'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('subscriptions_org_uq').on(t.organizationId),
    uniqueIndex('subscriptions_stripe_customer_uq').on(t.stripeCustomerId),
    uniqueIndex('subscriptions_stripe_sub_uq').on(t.stripeSubscriptionId),
    index('subscriptions_status_idx').on(t.status),
  ],
);

export const usageLedger = pgTable(
  'usage_ledger',
  {
    id: idColumn(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, {
      onDelete: 'set null',
    }),
    /** 'personalized_analysis' | 'chat_question' */
    kind: text('kind').notNull(),
    referenceId: uuid('reference_id'),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    units: integer('units').notNull().default(1),
    /** 'reserve' | 'confirm' | 'release' — reserva al iniciar, confirma al entregar, libera si falla. */
    action: text('action').notNull(),
    /** Clave de idempotencia: un reintento no consume dos veces. */
    idempotencyKey: text('idempotency_key').notNull(),
    ...createdOnly,
  },
  (t) => [
    uniqueIndex('usage_ledger_idem_uq').on(t.idempotencyKey),
    index('usage_ledger_org_kind_period_idx').on(t.organizationId, t.kind, t.periodStart),
  ],
);

export const stripeEvents = pgTable(
  'stripe_events',
  {
    id: idColumn(),
    /** event_id de Stripe: único; los duplicados se toleran (no se reprocesan). */
    eventId: text('event_id').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    ...createdOnly,
  },
  (t) => [
    uniqueIndex('stripe_events_event_id_uq').on(t.eventId),
    index('stripe_events_type_idx').on(t.type),
  ],
);
