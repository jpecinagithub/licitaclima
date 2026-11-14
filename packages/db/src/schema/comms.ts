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
import { organizations, users } from './core.js';
import { conversations as convTable } from './analysis.js';

/**
 * Captación, comunicaciones y consentimiento.
 * - El correo comercial exige consentimiento SEPARADO, opcional, no
 *   premarcado, registrado con versión del texto y fecha.
 * - La baja de marketing no cancela comunicaciones necesarias de cuenta.
 * - El outbox es transaccional: el envío real lo hace el worker (Fase D);
 *   aquí solo se encola con clave idempotente.
 */

export const emailOutbox = pgTable(
  'email_outbox',
  {
    id: idColumn(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    toEmail: text('to_email').notNull(),
    templateKey: text('template_key').notNull(),
    subject: text('subject').notNull(),
    bodyText: text('body_text'),
    bodyHtml: text('body_html'),
    /** Datos para renderizar la plantilla en el envío (sin secretos). */
    payload: jsonb('payload'),
    /** Clave idempotente: un reintento no envía dos veces. */
    idempotencyKey: text('idempotency_key').notNull(),
    /** 'pending' | 'sent' | 'failed' | 'suppressed' */
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    providerMessageId: text('provider_message_id'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('email_outbox_idem_uq').on(t.idempotencyKey),
    index('email_outbox_status_idx').on(t.status, t.nextAttemptAt),
    index('email_outbox_org_idx').on(t.organizationId),
  ],
);

export const emailEvents = pgTable(
  'email_events',
  {
    id: idColumn(),
    outboxId: uuid('outbox_id').references(() => emailOutbox.id, { onDelete: 'set null' }),
    email: text('email').notNull(),
    /** 'delivered' | 'bounced' | 'complained' | 'opened' | 'clicked' */
    eventType: text('event_type').notNull(),
    providerEventId: text('provider_event_id'),
    payload: jsonb('payload'),
    ...createdOnly,
  },
  (t) => [
    index('email_events_outbox_idx').on(t.outboxId),
    index('email_events_email_idx').on(t.email),
    uniqueIndex('email_events_provider_uq').on(t.providerEventId, t.eventType),
  ],
);

export const consentEvents = pgTable(
  'consent_events',
  {
    id: idColumn(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    email: text('email').notNull(),
    /** 'marketing' | 'newsletter' | 'service_alerts' | 'analytics' */
    purpose: text('purpose').notNull(),
    granted: boolean('granted').notNull(),
    /** Versión del texto de consentimiento aceptado. */
    textVersion: text('text_version').notNull(),
    source: text('source'),
    ...createdOnly,
  },
  (t) => [index('consent_events_email_purpose_idx').on(t.email, t.purpose)],
);

export const suppressionEntries = pgTable(
  'suppression_entries',
  {
    id: idColumn(),
    email: text('email').notNull(),
    /** 'email' | 'marketing' */
    channel: text('channel').notNull(),
    reason: text('reason').notNull(),
    ...createdOnly,
  },
  (t) => [uniqueIndex('suppression_entries_email_channel_uq').on(t.email, t.channel)],
);

export const leads = pgTable(
  'leads',
  {
    id: idColumn(),
    email: text('email').notNull(),
    activity: text('activity'),
    province: text('province'),
    source: text('source'),
    utm: jsonb('utm'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    convertedOrganizationId: uuid('converted_organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (t) => [uniqueIndex('leads_email_uq').on(t.email)],
);

export const attributionEvents = pgTable(
  'attribution_events',
  {
    id: idColumn(),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    channel: text('channel').notNull(),
    campaign: text('campaign'),
    utm: jsonb('utm'),
    /** Gasto atribuible (EUR). Solo registro manual/importado en el MVP. */
    amount: numeric('amount', { precision: 19, scale: 4 }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    ...createdOnly,
  },
  (t) => [
    index('attribution_events_lead_idx').on(t.leadId),
    index('attribution_events_org_idx').on(t.organizationId),
  ],
);

export const supportTickets = pgTable(
  'support_tickets',
  {
    id: idColumn(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    conversationId: uuid('conversation_id').references(() => convTable.id, {
      onDelete: 'set null',
    }),
    subject: text('subject').notNull(),
    /** 'open' | 'pending' | 'resolved' | 'closed' */
    status: text('status').notNull().default('open'),
    /** 'low' | 'normal' | 'high' | 'urgent' */
    priority: text('priority').notNull().default('normal'),
    ...timestamps,
  },
  (t) => [
    index('support_tickets_org_idx').on(t.organizationId),
    index('support_tickets_status_idx').on(t.status),
  ],
);
