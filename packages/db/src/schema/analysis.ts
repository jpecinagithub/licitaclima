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
import { tenders } from './ingestion.js';

/**
 * Análisis y datos PRIVADOS por organización (todo lleva organization_id).
 * Los análisis genéricos (compartidos) viven en `generic_analyses`;
 * las comparaciones, favoritos y conversaciones son por tenant.
 */

export const genericAnalyses = pgTable(
  'generic_analyses',
  {
    id: idColumn(),
    tenderId: uuid('tender_id')
      .notNull()
      .references(() => tenders.id, { onDelete: 'cascade' }),
    tenderVersionId: uuid('tender_version_id'),
    /** Versión del pipeline de extracción/análisis (para invalidar al cambiar). */
    pipelineVersion: text('pipeline_version').notNull(),
    provider: text('provider'),
    model: text('model'),
    /** 'pending' | 'done' | 'failed' | 'blocked_no_evidence' */
    status: text('status').notNull().default('pending'),
    summary: jsonb('summary'),
    /** Salida estructurada validada (Zod/JSON Schema) con evidencias. */
    data: jsonb('data'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('generic_analyses_tender_pipeline_uq').on(t.tenderId, t.pipelineVersion),
    index('generic_analyses_tender_idx').on(t.tenderId),
  ],
);

export const requirementEvidence = pgTable(
  'requirement_evidence',
  {
    id: idColumn(),
    genericAnalysisId: uuid('generic_analysis_id')
      .notNull()
      .references(() => genericAnalyses.id, { onDelete: 'cascade' }),
    requirement: text('requirement').notNull(),
    category: text('category'),
    /** { documentId, documentHash, page, fragment } o NULL si no hay evidencia. */
    evidence: jsonb('evidence'),
    ...createdOnly,
  },
  (t) => [index('requirement_evidence_analysis_idx').on(t.genericAnalysisId)],
);

export const matches = pgTable(
  'matches',
  {
    id: idColumn(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tenderId: uuid('tender_id')
      .notNull()
      .references(() => tenders.id, { onDelete: 'cascade' }),
    /** Versión del perfil con la que se calculó el encaje. */
    profileVersion: integer('profile_version').notNull(),
    /** 0.0000–1.0000. NO es probabilidad de ganar ni certificación de aptitud. */
    score: numeric('score', { precision: 5, scale: 4 }),
    /** 'compatible' | 'incompatible' | 'desconocido' | 'no_aplica' (por requisito, en explanation). */
    verdict: text('verdict').notNull().default('desconocido'),
    /** Un requisito obligatorio incompatible bloquea la recomendación positiva. */
    blocking: boolean('blocking').notNull().default(false),
    /** Matriz de encaje por requisito con evidencia y dato de perfil usado. */
    explanation: jsonb('explanation'),
    recalculatedAt: timestamp('recalculated_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('matches_org_tender_profile_uq').on(t.organizationId, t.tenderId, t.profileVersion),
    index('matches_org_idx').on(t.organizationId),
    index('matches_tender_idx').on(t.tenderId),
  ],
);

export const personalizedAnalyses = pgTable(
  'personalized_analyses',
  {
    id: idColumn(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tenderId: uuid('tender_id')
      .notNull()
      .references(() => tenders.id, { onDelete: 'cascade' }),
    matchId: uuid('match_id').references(() => matches.id, { onDelete: 'set null' }),
    /** 'pending' | 'running' | 'done' | 'failed' */
    status: text('status').notNull().default('pending'),
    /** Comparación perfil vs. requisitos, con evidencias. */
    data: jsonb('data'),
    evidence: jsonb('evidence'),
    provider: text('provider'),
    model: text('model'),
    costAmount: numeric('cost_amount', { precision: 19, scale: 4 }),
    costCurrency: text('cost_currency').notNull().default('EUR'),
    /** true cuando este análisis consumió una unidad de la cuota del periodo. */
    consumedQuota: boolean('consumed_quota').notNull().default(false),
    periodStart: timestamp('period_start', { withTimezone: true }),
    requestedByUserId: uuid('requested_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    /** Clave de idempotencia del cliente (reintento sin doble consumo). */
    idempotencyKey: text('idempotency_key'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('personalized_analyses_idem_uq').on(t.idempotencyKey),
    index('personalized_analyses_org_idx').on(t.organizationId),
    index('personalized_analyses_tender_idx').on(t.tenderId),
  ],
);

export const favorites = pgTable(
  'favorites',
  {
    id: idColumn(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tenderId: uuid('tender_id')
      .notNull()
      .references(() => tenders.id, { onDelete: 'cascade' }),
    /** Estado personal: 'pendiente' | 'estudiar' | 'descartada' | 'presentada'. */
    state: text('state').notNull().default('pendiente'),
    note: text('note'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('favorites_org_tender_uq').on(t.organizationId, t.tenderId),
    index('favorites_org_idx').on(t.organizationId),
  ],
);

export const conversations = pgTable(
  'conversations',
  {
    id: idColumn(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tenderId: uuid('tender_id').references(() => tenders.id, { onDelete: 'cascade' }),
    title: text('title'),
    ...timestamps,
  },
  (t) => [
    index('conversations_org_idx').on(t.organizationId),
    index('conversations_tender_idx').on(t.tenderId),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: idColumn(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    /** 'user' | 'assistant' | 'system' */
    role: text('role').notNull(),
    content: text('content').notNull(),
    /** Citas a documentos (sin evidencia, el chat debe reconocer el límite). */
    citations: jsonb('citations'),
    tokensUsed: integer('tokens_used'),
    ...createdOnly,
  },
  (t) => [
    index('messages_conversation_idx').on(t.conversationId),
    index('messages_org_idx').on(t.organizationId),
  ],
);
