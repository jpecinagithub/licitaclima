import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdOnly, idColumn, timestamps } from './common.js';
import { organizations, users } from './core.js';

/**
 * Operaciones: auditoría, configuración del sistema y cola de trabajos.
 * - `audit_logs`: actor, acción, objeto, fecha y correlación; SIN secretos.
 * - `system_settings`: configuración versionada (precios, límites, fuentes);
 *   los cambios quedan en audit_logs.
 * - `jobs`: cola persistente sobre PostgreSQL (pg-boss o equivalente en
 *   Fase C; la tabla ya existe para no re-migrar).
 */

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: idColumn(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** 'user' | 'admin' | 'system' | 'worker' */
    actorType: text('actor_type').notNull().default('user'),
    action: text('action').notNull(),
    objectType: text('object_type').notNull(),
    objectId: text('object_id'),
    details: jsonb('details'),
    /** Hash sha256 de la IP (minimización de PII). */
    ipHash: text('ip_hash'),
    ...createdOnly,
  },
  (t) => [
    index('audit_logs_org_created_idx').on(t.organizationId, t.createdAt),
    index('audit_logs_actor_idx').on(t.actorUserId),
    index('audit_logs_action_idx').on(t.action),
  ],
);

export const systemSettings = pgTable(
  'system_settings',
  {
    id: idColumn(),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (t) => [uniqueIndex('system_settings_key_uq').on(t.key)],
);

export const jobs = pgTable(
  'jobs',
  {
    id: idColumn(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull().default({}),
    /** 'pending' | 'running' | 'done' | 'failed' | 'dead' */
    status: text('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    lastError: text('last_error'),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    /** Clave de idempotencia del trabajo (un reintento no lo duplica). */
    idempotencyKey: text('idempotency_key'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('jobs_idem_uq').on(t.idempotencyKey),
    index('jobs_status_run_idx').on(t.status, t.runAt),
    index('jobs_type_idx').on(t.type),
  ],
);
