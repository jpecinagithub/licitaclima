import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createdOnly, idColumn, timestamps } from './common.js';

/**
 * Identidad y acceso.
 * - Los clientes entran SOLO por magic link (sin contraseña).
 * - Los administradores tienen contraseña Argon2id + TOTP obligatorio.
 * - `role` global: 'cliente' | 'admin' | 'owner'. El rol dentro de una
 *   organización vive en `memberships` (owner/admin/miembro).
 */

export const users = pgTable(
  'users',
  {
    id: idColumn(),
    email: text('email').notNull(),
    displayName: text('display_name'),
    /** Rol global. 'cliente' por defecto; 'admin'/'owner' solo vía CLI bootstrap. */
    role: text('role').notNull().default('cliente'),
    /** Solo administradores. NULL en clientes (no hay contraseña que robar). */
    passwordHash: text('password_hash'),
    /** Secreto TOTP cifrado con AES-256-GCM (clave en env, fuera de la BD). NULL si no configurado. */
    totpSecretEncrypted: text('totp_secret_encrypted'),
    totpEnabled: boolean('totp_enabled').notNull().default(false),
    /** Códigos de recuperación: SOLO hashes sha256 (JSON array de hex). Nunca en claro. */
    recoveryCodesHash: text('recovery_codes_hash').array().notNull().default(sql`'{}'::text[]`),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    // La unicidad no distingue mayúsculas: 'Jon@x.es' y 'jon@x.es' son el mismo usuario.
    uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`),
    index('users_role_idx').on(t.role),
  ],
);

export const organizations = pgTable(
  'organizations',
  {
    id: idColumn(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    /** 'active' | 'suspended' */
    status: text('status').notNull().default('active'),
    ...timestamps,
  },
  (t) => [uniqueIndex('organizations_slug_uq').on(t.slug)],
);

export const memberships = pgTable(
  'memberships',
  {
    id: idColumn(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** Rol dentro de la organización: 'owner' | 'admin' | 'miembro'. */
    role: text('role').notNull().default('miembro'),
    ...createdOnly,
  },
  (t) => [
    uniqueIndex('memberships_org_user_uq').on(t.organizationId, t.userId),
    index('memberships_user_idx').on(t.userId),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: idColumn(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** NULL en sesiones de administrador (no pertenecen a ningún tenant). */
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    /** SOLO hash sha256 del token opaco. El token en claro solo existe en la cookie. */
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    /** Momento de la última verificación MFA (admin). NULL en clientes. */
    mfaVerifiedAt: timestamp('mfa_verified_at', { withTimezone: true }),
    userAgent: text('user_agent'),
    /** Hash sha256 de la IP (minimización de PII; nunca la IP en claro). */
    ipHash: text('ip_hash'),
    ...createdOnly,
  },
  (t) => [
    uniqueIndex('sessions_token_hash_uq').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
    index('sessions_org_idx').on(t.organizationId),
    index('sessions_expires_idx').on(t.expiresAt),
  ],
);

export const loginTokens = pgTable(
  'login_tokens',
  {
    id: idColumn(),
    email: text('email').notNull(),
    /** SOLO hash sha256 del token criptográfico. El token en claro solo viaja por correo. */
    tokenHash: text('token_hash').notNull(),
    organizationId: uuid('organization_id').references(() => organizations.id, {
      onDelete: 'cascade',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** NULL = sin consumir. El consumo es atómico: UPDATE ... WHERE used_at IS NULL. */
    usedAt: timestamp('used_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    ...createdOnly,
  },
  (t) => [
    uniqueIndex('login_tokens_token_hash_uq').on(t.tokenHash),
    index('login_tokens_email_idx').on(t.email),
    index('login_tokens_expires_idx').on(t.expiresAt),
  ],
);
