import {
  bigint,
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

/**
 * Datos PÚBLICOS (sin organization_id): fuentes, licitaciones, documentos
 * y análisis genéricos se comparten entre clientes. Lo privado de cada
 * empresa (matches, análisis personalizados, favoritos, chat) vive en
 * analysis.ts y SIEMPRE lleva organization_id.
 *
 * Dinero: numeric(19,4), nunca float. Importes diferenciados
 * (valor estimado / presupuesto base sin IVA / con IVA) sin intercambiarlos.
 */

export const sources = pgTable(
  'sources',
  {
    id: idColumn(),
    /** 'feed643' | 'feed1044' (claves estables del prompt §3). */
    key: text('key').notNull(),
    name: text('name').notNull(),
    url: text('url').notNull(),
    kind: text('kind').notNull().default('atom'),
    active: boolean('active').notNull().default(true),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    lastError: text('last_error'),
    ...timestamps,
  },
  (t) => [uniqueIndex('sources_key_uq').on(t.key)],
);

export const ingestionRuns = pgTable(
  'ingestion_runs',
  {
    id: idColumn(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    /** 'running' | 'ok' | 'partial' | 'failed' */
    status: text('status').notNull().default('running'),
    /** Cursor/checkpoint persistente para reanudar tras caídas. */
    cursorCheckpoint: text('cursor_checkpoint'),
    entriesSeen: integer('entries_seen').notNull().default(0),
    entriesNew: integer('entries_new').notNull().default(0),
    entriesUpdated: integer('entries_updated').notNull().default(0),
    entriesSkipped: integer('entries_skipped').notNull().default(0),
    error: text('error'),
    ...createdOnly,
  },
  (t) => [
    index('ingestion_runs_source_idx').on(t.sourceId, t.startedAt),
    index('ingestion_runs_status_idx').on(t.status),
  ],
);

export const tenders = pgTable(
  'tenders',
  {
    id: idColumn(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'restrict' }),
    sourceKey: text('source_key').notNull(),
    /** Identificador original de la entrada en la fuente (deduplicación entre fuentes). */
    externalId: text('external_id').notNull(),
    expediente: text('expediente').notNull(),
    organo: text('organo').notNull(),
    objeto: text('objeto').notNull(),
    /** Estado de la fuente: PRE | PUB | EV | ADJ | RES | ANUL */
    estado: text('estado').notNull(),
    /** 'nucleo' | 'limitrofe' | 'marginal' | NULL (sin clasificar). */
    claseNicho: text('clase_nicho'),
    provincia: text('provincia'),
    /** true cuando la provincia se infirió del órgano (no del lugar de ejecución). */
    provinciaPorVerificar: boolean('provincia_por_verificar').notNull().default(false),
    nuts: text('nuts'),
    cpv: text('cpv').array().notNull().default([]),
    urlOficial: text('url_oficial').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    modifiedAt: timestamp('modified_at', { withTimezone: true }),
    /** Plazo con hora solo si la fuente la da; NULL si solo hay fecha (nunca inventar hora). */
    deadlineAt: timestamp('deadline_at', { withTimezone: true }),
    deadlineDateOnly: boolean('deadline_date_only').notNull().default(false),
    valorEstimado: numeric('valor_estimado', { precision: 19, scale: 4 }),
    presupuestoBaseSinIva: numeric('presupuesto_base_sin_iva', { precision: 19, scale: 4 }),
    presupuestoBaseConIva: numeric('presupuesto_base_con_iva', { precision: 19, scale: 4 }),
    currency: text('currency').notNull().default('EUR'),
    duracion: text('duracion'),
    /** Pipeline §4: descubierto → … → publicado (o sin_documentos, requiere_OCR, …). */
    pipeline: text('pipeline').notNull().default('descubierto'),
    contentHash: text('content_hash'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('tenders_source_external_uq').on(t.sourceId, t.externalId),
    index('tenders_estado_idx').on(t.estado),
    index('tenders_pipeline_idx').on(t.pipeline),
    index('tenders_provincia_idx').on(t.provincia),
    index('tenders_published_idx').on(t.publishedAt),
    index('tenders_clase_idx').on(t.claseNicho),
  ],
);

export const tenderVersions = pgTable(
  'tender_versions',
  {
    id: idColumn(),
    tenderId: uuid('tender_id')
      .notNull()
      .references(() => tenders.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    /** Foto completa del expediente en esa versión (rectificaciones oficiales). */
    data: jsonb('data').notNull(),
    /** 'created' | 'rectification' | 'status_change' | 'documents_change' */
    changeKind: text('change_kind').notNull().default('created'),
    ...createdOnly,
  },
  (t) => [
    uniqueIndex('tender_versions_tender_version_uq').on(t.tenderId, t.version),
    index('tender_versions_tender_idx').on(t.tenderId),
  ],
);

export const lots = pgTable(
  'lots',
  {
    id: idColumn(),
    tenderId: uuid('tender_id')
      .notNull()
      .references(() => tenders.id, { onDelete: 'cascade' }),
    numero: text('numero').notNull(),
    objeto: text('objeto'),
    valorEstimado: numeric('valor_estimado', { precision: 19, scale: 4 }),
    presupuestoBase: numeric('presupuesto_base', { precision: 19, scale: 4 }),
    currency: text('currency').notNull().default('EUR'),
    ...createdOnly,
  },
  (t) => [
    uniqueIndex('lots_tender_numero_uq').on(t.tenderId, t.numero),
    index('lots_tender_idx').on(t.tenderId),
  ],
);

export const documents = pgTable(
  'documents',
  {
    id: idColumn(),
    tenderId: uuid('tender_id')
      .notNull()
      .references(() => tenders.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    filename: text('filename'),
    mime: text('mime'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    /** sha256 del contenido. La extracción se comparte por hash (una vez por hash+versión). */
    sha256: text('sha256').notNull(),
    /** Ruta en el volumen privado (nunca URL pública). */
    storagePath: text('storage_path'),
    /** 'pending' | 'downloaded' | 'failed' | 'blocked' | 'too_large' */
    status: text('status').notNull().default('pending'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('documents_tender_sha_uq').on(t.tenderId, t.sha256),
    index('documents_sha_idx').on(t.sha256),
    index('documents_tender_idx').on(t.tenderId),
  ],
);

export const documentVersions = pgTable(
  'document_versions',
  {
    id: idColumn(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    sha256: text('sha256').notNull(),
    storagePath: text('storage_path'),
    ...createdOnly,
  },
  (t) => [
    uniqueIndex('document_versions_doc_version_uq').on(t.documentId, t.version),
    index('document_versions_doc_idx').on(t.documentId),
  ],
);

export const extractedPages = pgTable(
  'extracted_pages',
  {
    id: idColumn(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    /** Numeración de página ORIGINAL del PDF (se preserva). */
    pageNumber: integer('page_number').notNull(),
    textContent: text('text_content').notNull(),
    charCount: integer('char_count').notNull().default(0),
    ...createdOnly,
  },
  (t) => [
    uniqueIndex('extracted_pages_doc_page_uq').on(t.documentId, t.pageNumber),
    index('extracted_pages_doc_idx').on(t.documentId),
  ],
);
