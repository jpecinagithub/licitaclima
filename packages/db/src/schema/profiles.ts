import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdOnly, idColumn, timestamps } from './common.js';
import { organizations, users } from './core.js';

/**
 * Perfil de empresa (datos DECLARADOS por el cliente, no verificados).
 * Un perfil por organización en el MVP. Cada PATCH crea una versión en
 * `profile_versions` y marca el recálculo de encaje como pendiente
 * (lo ejecuta el worker en Fase C; aquí solo se marca).
 */

export const companyProfiles = pgTable(
  'company_profiles',
  {
    id: idColumn(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    actividad: text('actividad').notNull(),
    /** Máximo 3 provincias en el plan inicial (validado en la API). */
    provincias: text('provincias').array().notNull().default([]),
    radioKm: integer('radio_km'),
    tamanoContratosOrientativo: text('tamano_contratos_orientativo'),
    capacidadOperativa: text('capacidad_operativa'),
    experiencia: text('experiencia'),
    certificacionesDeclaradas: text('certificaciones_declaradas').array().notNull().default([]),
    preferencias: text('preferencias'),
    /** Versión vigente (1 = primera). Se incrementa en cada PATCH. */
    version: integer('version').notNull().default(1),
    /** El worker recalcula matches cuando es true; la API solo lo marca. */
    matchesRecalcPending: boolean('matches_recalc_pending').notNull().default(false),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('company_profiles_org_uq').on(t.organizationId),
    index('company_profiles_recalc_idx').on(t.matchesRecalcPending),
  ],
);

export const profileVersions = pgTable(
  'profile_versions',
  {
    id: idColumn(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => companyProfiles.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    /** Foto completa del perfil en esa versión (JSON). */
    data: jsonb('data').notNull(),
    changedByUserId: uuid('changed_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    changeReason: text('change_reason'),
    ...createdOnly,
  },
  (t) => [
    uniqueIndex('profile_versions_profile_version_uq').on(t.profileId, t.version),
    index('profile_versions_org_idx').on(t.organizationId),
  ],
);
