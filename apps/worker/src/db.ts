// LicitaClima — capa de acceso a datos del worker (Fase C).
//
// El esquema Drizzle de Fase B aún no existe (rama block/fase-b). Los jobs
// del worker programan contra ESTA interfaz; el adaptador Postgres
// (./pg-store.ts) trabaja contra el DDL provisional de
// @licitaclima/db (provisional-schema.ts) y se sustituirá por Drizzle cuando
// Fase B entregue el esquema. El adaptador en memoria sirve para tests y
// para arrancar sin BD (con aviso explícito: no es persistente).
//
// Pipeline persistente (prompt §4):
//   descubierto -> normalizado -> prefiltrado -> documentos_pendientes
//   -> extraido -> analizado -> validado -> publicado
// Alternativos: sin_documentos | requiere_OCR | fuente_no_disponible |
// revision_requerida | fallido.

import type { PipelineState, TenderStatus, NicheClass } from '@licitaclima/domain';
import type { AtomDocumentRef } from '@licitaclima/integrations';

export interface TenderInput {
  source: 'feed643' | 'feed1044';
  /** <id> Atom de la entrada. */
  sourceId: string;
  expediente: string;
  organo: string;
  objeto: string;
  estado: TenderStatus | string;
  valorEstimado: string | null;
  presupuestoBaseSinIva: string | null;
  presupuestoBaseConIva: string | null;
  duracion: string | null;
  provincia: string | null;
  provinciaPorVerificar: boolean;
  nuts: string | null;
  plazoFecha: string | null; // YYYY-MM-DD
  plazoHora: string | null; // HH:MM:SS o null (nunca inventar hora)
  plazoSoloFecha: boolean;
  cpv: string[];
  claseNicho: NicheClass;
  /** Clase final tras revisión manual (seed de 30 días), si existe. */
  claseManual?: string | null;
  motivoManual?: string | null;
  urlOficial: string;
  documentUris: AtomDocumentRef[];
  notices: string[];
  firstPubAt: string | null; // ISO
  feedUpdatedAt: string | null; // ISO
  /** Procedencia documentada (ventana, fuente, clase) — seed y auditoría. */
  procedencia?: string | null;
}

export interface TenderRecord extends TenderInput {
  id: string;
  pipeline: PipelineState;
  version: number;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
}

export interface IngestionRunInput {
  source: string;
  status: 'running' | 'ok' | 'error' | 'sin-cambios';
  pages: number;
  entries: number;
  newTenders: number;
  updatedTenders: number;
  errors: number;
  cursorNextUrl: string | null;
  etag: string | null;
  lastModified: string | null;
  errorMessage: string | null;
  finishedAt: string | null;
}

export interface IngestionRunRecord extends IngestionRunInput {
  id: string;
  startedAt: string;
}

export interface DocumentInput {
  tenderId: string;
  kind: 'pcap' | 'ppt' | 'general';
  url: string;
  sha256: string;
  sizeBytes: number;
  pages: number | null;
  status: string;
}

export interface DocumentRecord extends DocumentInput {
  id: string;
  createdAt: string;
}

export type JobStatus = 'pending' | 'running' | 'done' | 'failed' | 'retry';

export interface JobRecord {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  nextRetryAt: string;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OutboxInput {
  organizationId: string | null;
  kind: 'alerta' | 'resumen_semanal';
  subject: string;
  body: string;
  idempotencyKey: string;
  /** Expedientes incluidos (resumen semanal): van en el payload del outbox. */
  tenderIds?: string[];
}

export interface OutboxRecord extends OutboxInput {
  id: string;
  status: 'pending' | 'sent' | 'failed';
  createdAt: string;
}

export interface OrganizationInput {
  id?: string;
  name: string;
  email: string | null;
  provincias: string[];
  /** Actividad declarada (Fase B: company_profiles.actividad, NOT NULL). */
  actividad?: string;
}

export interface OrganizationRecord extends OrganizationInput {
  id: string;
  createdAt: string;
}

export interface DigestRecord {
  id: string;
  organizationId: string;
  weekStart: string; // YYYY-MM-DD (lunes)
  status: 'enviado' | 'sin_novedades';
  tenderIds: string[];
  createdAt: string;
}

export interface WorkerStore {
  ensureSchema(): Promise<void>;
  // Tendientes
  upsertTender(input: TenderInput): Promise<{ tender: TenderRecord; created: boolean; rectified: boolean }>;
  getTender(id: string): Promise<TenderRecord | null>;
  getTenderBySourceId(source: string, sourceId: string): Promise<TenderRecord | null>;
  getTenderByExpedienteOrgano(expediente: string, organo: string): Promise<TenderRecord | null>;
  listTenders(filter: {
    pipeline?: PipelineState | PipelineState[];
    provincia?: string;
    claseNicho?: NicheClass | NicheClass[];
    estado?: string;
    limit?: number;
  }): Promise<TenderRecord[]>;
  setPipeline(id: string, pipeline: PipelineState): Promise<void>;
  // Deduplicación por <id> Atom (también entradas fuera del nicho)
  hasSeenAtomId(source: string, atomId: string): Promise<boolean>;
  markSeenAtomId(source: string, atomId: string): Promise<void>;
  // Ingesta / salud de fuentes
  startIngestionRun(source: string): Promise<string>;
  finishIngestionRun(runId: string, result: Omit<IngestionRunInput, 'source'>): Promise<void>;
  getLatestIngestionRun(source: string): Promise<IngestionRunRecord | null>;
  recordSourceHealth(source: string, health: { ok: boolean; latencyMs: number | null; entries: number | null; error: string | null }): Promise<void>;
  // Documentos y extracción
  insertDocument(input: DocumentInput): Promise<DocumentRecord>;
  findDocumentByHash(sha256: string): Promise<DocumentRecord | null>;
  getDocumentsForTender(tenderId: string): Promise<DocumentRecord[]>;
  /** Guarda el texto extraído por página (numeración original) en extracted_pages. */
  saveExtractedPages(documentId: string, pages: Array<{ page: number; text: string }>): Promise<void>;
  saveExtraction(tenderId: string, version: string, payload: unknown, status: string): Promise<void>;
  getExtraction(tenderId: string): Promise<{ payload: unknown; status: string } | null>;
  saveMatch(tenderId: string, organizationId: string | null, payload: unknown, recomendacion: string): Promise<void>;
  invalidateMatches(tenderId: string, reason: string): Promise<number>;
  // Cola de trabajos
  enqueueJob(type: string, payload: Record<string, unknown>, opts?: { maxAttempts?: number; runAt?: string }): Promise<JobRecord>;
  claimDueJobs(limit: number): Promise<JobRecord[]>;
  completeJob(id: string): Promise<void>;
  failJob(id: string, error: string, nextRetryAt: string | null): Promise<void>;
  // Organizaciones, outbox y resúmenes
  upsertOrganization(input: OrganizationInput): Promise<OrganizationRecord>;
  listOrganizations(): Promise<OrganizationRecord[]>;
  insertOutbox(input: OutboxInput): Promise<OutboxRecord>;
  outboxExists(idempotencyKey: string): Promise<boolean>;
  listOutbox(status?: string): Promise<OutboxRecord[]>;
  recordDigest(organizationId: string, weekStart: string, status: 'enviado' | 'sin_novedades', tenderIds: string[]): Promise<DigestRecord>;
  getDigest(organizationId: string, weekStart: string): Promise<DigestRecord | null>;
  getLastDigest(organizationId: string): Promise<DigestRecord | null>;
}

// ---------------------------------------------------------------------------
// Adaptador en memoria (tests y arranque sin BD). NO persistente.
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function uuid(): string {
  return crypto.randomUUID();
}

export class InMemoryWorkerStore implements WorkerStore {
  readonly tenders = new Map<string, TenderRecord>();
  readonly seen = new Set<string>();
  readonly runs: IngestionRunRecord[] = [];
  readonly documents: DocumentRecord[] = [];
  readonly extractions = new Map<string, { payload: unknown; status: string }>();
  readonly matches: Array<{ tenderId: string; organizationId: string | null; payload: unknown; recomendacion: string; invalidated: boolean; reason: string | null }> = [];
  readonly jobs: JobRecord[] = [];
  readonly organizations: OrganizationRecord[] = [];
  readonly outbox: OutboxRecord[] = [];
  readonly digests: DigestRecord[] = [];

  async ensureSchema(): Promise<void> {
    // En memoria no hay esquema que crear.
  }

  async upsertTender(input: TenderInput): Promise<{ tender: TenderRecord; created: boolean; rectified: boolean }> {
    const existing = [...this.tenders.values()].find(
      (t) => (t.source === input.source && t.sourceId === input.sourceId) || (t.expediente === input.expediente && t.organo === input.organo),
    );
    if (!existing) {
      const tender: TenderRecord = { ...input, id: uuid(), pipeline: 'descubierto', version: 1, createdAt: nowIso(), updatedAt: nowIso(), lastSeenAt: nowIso() };
      this.tenders.set(tender.id, tender);
      return { tender, created: true, rectified: false };
    }
    // Rectificación (DOC_MOD): cambia el estado o el updated del feed → nueva versión.
    // Los campos que la republicación no trae (null/vacíos) conservan el valor
    // previo: una actualización parcial no borra datos.
    const rectified =
      existing.estado !== input.estado || existing.feedUpdatedAt !== input.feedUpdatedAt;
    const merged: TenderInput = {
      ...input,
      valorEstimado: input.valorEstimado ?? existing.valorEstimado,
      presupuestoBaseSinIva: input.presupuestoBaseSinIva ?? existing.presupuestoBaseSinIva,
      presupuestoBaseConIva: input.presupuestoBaseConIva ?? existing.presupuestoBaseConIva,
      duracion: input.duracion ?? existing.duracion,
      provincia: input.provincia ?? existing.provincia,
      nuts: input.nuts ?? existing.nuts,
      plazoFecha: input.plazoFecha ?? existing.plazoFecha,
      plazoHora: input.plazoHora ?? existing.plazoHora,
      plazoSoloFecha: input.plazoFecha === null && input.plazoHora === null ? existing.plazoSoloFecha : input.plazoSoloFecha,
      cpv: input.cpv.length > 0 ? input.cpv : existing.cpv,
      documentUris: input.documentUris.length > 0 ? input.documentUris : existing.documentUris,
      notices: [...new Set([...existing.notices, ...input.notices])],
      firstPubAt: existing.firstPubAt ?? input.firstPubAt,
    };
    const updated: TenderRecord = {
      ...existing,
      ...merged,
      id: existing.id,
      pipeline: existing.pipeline,
      version: rectified ? existing.version + 1 : existing.version,
      createdAt: existing.createdAt,
      updatedAt: nowIso(),
      lastSeenAt: nowIso(),
    };
    this.tenders.set(updated.id, updated);
    if (rectified) await this.invalidateMatches(updated.id, `rectificación DOC_MOD: estado ${existing.estado} → ${input.estado}`);
    return { tender: updated, created: false, rectified };
  }

  async getTender(id: string): Promise<TenderRecord | null> {
    return this.tenders.get(id) ?? null;
  }

  async getTenderBySourceId(source: string, sourceId: string): Promise<TenderRecord | null> {
    return [...this.tenders.values()].find((t) => t.source === source && t.sourceId === sourceId) ?? null;
  }

  async getTenderByExpedienteOrgano(expediente: string, organo: string): Promise<TenderRecord | null> {
    return [...this.tenders.values()].find((t) => t.expediente === expediente && t.organo === organo) ?? null;
  }

  async listTenders(filter: { pipeline?: PipelineState | PipelineState[]; provincia?: string; claseNicho?: NicheClass | NicheClass[]; estado?: string; limit?: number }): Promise<TenderRecord[]> {
    let rows = [...this.tenders.values()];
    if (filter.pipeline) {
      const ps = Array.isArray(filter.pipeline) ? filter.pipeline : [filter.pipeline];
      rows = rows.filter((t) => ps.includes(t.pipeline));
    }
    if (filter.provincia) rows = rows.filter((t) => t.provincia === filter.provincia);
    if (filter.claseNicho) {
      const cs = Array.isArray(filter.claseNicho) ? filter.claseNicho : [filter.claseNicho];
      rows = rows.filter((t) => cs.includes(t.claseNicho));
    }
    if (filter.estado) rows = rows.filter((t) => t.estado === filter.estado);
    return rows.slice(0, filter.limit ?? 100);
  }

  async setPipeline(id: string, pipeline: PipelineState): Promise<void> {
    const t = this.tenders.get(id);
    if (t) this.tenders.set(id, { ...t, pipeline, updatedAt: nowIso() });
  }

  async hasSeenAtomId(source: string, atomId: string): Promise<boolean> {
    return this.seen.has(`${source}:${atomId}`);
  }

  async markSeenAtomId(source: string, atomId: string): Promise<void> {
    this.seen.add(`${source}:${atomId}`);
  }

  async startIngestionRun(source: string): Promise<string> {
    const run: IngestionRunRecord = {
      id: uuid(), source, status: 'running', pages: 0, entries: 0, newTenders: 0,
      updatedTenders: 0, errors: 0, cursorNextUrl: null, etag: null, lastModified: null,
      errorMessage: null, finishedAt: null, startedAt: nowIso(),
    };
    this.runs.push(run);
    return run.id;
  }

  async finishIngestionRun(runId: string, result: Omit<IngestionRunInput, 'source'>): Promise<void> {
    const run = this.runs.find((r) => r.id === runId);
    if (run) Object.assign(run, result);
  }

  async getLatestIngestionRun(source: string): Promise<IngestionRunRecord | null> {
    const runs = this.runs.filter((r) => r.source === source);
    return runs.length > 0 ? runs[runs.length - 1] : null;
  }

  async recordSourceHealth(): Promise<void> {
    // En memoria no se persiste la salud; el adaptador Postgres sí.
  }

  async insertDocument(input: DocumentInput): Promise<DocumentRecord> {
    const existing = this.documents.find((d) => d.sha256 === input.sha256);
    if (existing) return existing;
    const doc: DocumentRecord = { ...input, id: uuid(), createdAt: nowIso() };
    this.documents.push(doc);
    return doc;
  }

  async findDocumentByHash(sha256: string): Promise<DocumentRecord | null> {
    return this.documents.find((d) => d.sha256 === sha256) ?? null;
  }

  async getDocumentsForTender(tenderId: string): Promise<DocumentRecord[]> {
    return this.documents.filter((d) => d.tenderId === tenderId);
  }

  readonly extractedPages = new Map<string, Array<{ page: number; text: string }>>();

  async saveExtractedPages(documentId: string, pages: Array<{ page: number; text: string }>): Promise<void> {
    this.extractedPages.set(documentId, pages);
  }

  async saveExtraction(tenderId: string, version: string, payload: unknown, status: string): Promise<void> {
    this.extractions.set(`${tenderId}:${version}`, { payload, status });
  }

  async getExtraction(tenderId: string): Promise<{ payload: unknown; status: string } | null> {
    return this.extractions.get(`${tenderId}:determinista-v1`) ?? null;
  }

  async saveMatch(tenderId: string, organizationId: string | null, payload: unknown, recomendacion: string): Promise<void> {
    this.matches.push({ tenderId, organizationId, payload, recomendacion, invalidated: false, reason: null });
  }

  async invalidateMatches(tenderId: string, reason: string): Promise<number> {
    let n = 0;
    for (const m of this.matches) {
      if (m.tenderId === tenderId && !m.invalidated) {
        m.invalidated = true;
        m.reason = reason;
        n++;
      }
    }
    return n;
  }

  async enqueueJob(type: string, payload: Record<string, unknown>, opts?: { maxAttempts?: number; runAt?: string }): Promise<JobRecord> {
    const job: JobRecord = {
      id: uuid(), type, payload, status: 'pending', attempts: 0,
      maxAttempts: opts?.maxAttempts ?? 5, nextRetryAt: opts?.runAt ?? nowIso(),
      lastError: null, createdAt: nowIso(), updatedAt: nowIso(),
    };
    this.jobs.push(job);
    return job;
  }

  async claimDueJobs(limit: number): Promise<JobRecord[]> {
    const now = nowIso();
    const due = this.jobs.filter((j) => j.status === 'pending' && j.nextRetryAt <= now).slice(0, limit);
    for (const j of due) {
      j.status = 'running';
      j.attempts += 1;
      j.updatedAt = now;
    }
    return due;
  }

  async completeJob(id: string): Promise<void> {
    const j = this.jobs.find((x) => x.id === id);
    if (j) {
      j.status = 'done';
      j.updatedAt = nowIso();
    }
  }

  async failJob(id: string, error: string, nextRetryAt: string | null): Promise<void> {
    const j = this.jobs.find((x) => x.id === id);
    if (!j) return;
    j.lastError = error;
    j.updatedAt = nowIso();
    if (nextRetryAt && j.attempts < j.maxAttempts) {
      j.status = 'retry';
      j.nextRetryAt = nextRetryAt;
    } else {
      j.status = 'failed';
    }
  }

  async upsertOrganization(input: OrganizationInput): Promise<OrganizationRecord> {
    const existing = input.id ? this.organizations.find((o) => o.id === input.id) : undefined;
    if (existing) {
      Object.assign(existing, input);
      return existing;
    }
    const org: OrganizationRecord = { ...input, id: input.id ?? uuid(), createdAt: nowIso() };
    this.organizations.push(org);
    return org;
  }

  async listOrganizations(): Promise<OrganizationRecord[]> {
    return [...this.organizations];
  }

  async insertOutbox(input: OutboxInput): Promise<OutboxRecord> {
    const existing = this.outbox.find((o) => o.idempotencyKey === input.idempotencyKey);
    if (existing) return existing;
    const row: OutboxRecord = { ...input, id: uuid(), status: 'pending', createdAt: nowIso() };
    this.outbox.push(row);
    return row;
  }

  async outboxExists(idempotencyKey: string): Promise<boolean> {
    return this.outbox.some((o) => o.idempotencyKey === idempotencyKey);
  }

  async listOutbox(status?: string): Promise<OutboxRecord[]> {
    return status ? this.outbox.filter((o) => o.status === status) : [...this.outbox];
  }

  async recordDigest(organizationId: string, weekStart: string, status: 'enviado' | 'sin_novedades', tenderIds: string[]): Promise<DigestRecord> {
    const existing = this.digests.find((d) => d.organizationId === organizationId && d.weekStart === weekStart);
    if (existing) return existing;
    const digest: DigestRecord = { id: uuid(), organizationId, weekStart, status, tenderIds, createdAt: nowIso() };
    this.digests.push(digest);
    return digest;
  }

  async getDigest(organizationId: string, weekStart: string): Promise<DigestRecord | null> {
    return this.digests.find((d) => d.organizationId === organizationId && d.weekStart === weekStart) ?? null;
  }

  async getLastDigest(organizationId: string): Promise<DigestRecord | null> {
    const ds = this.digests.filter((d) => d.organizationId === organizationId);
    return ds.length > 0 ? ds[ds.length - 1] : null;
  }
}

/**
 * Crea el store. Con DATABASE_URL → PostgreSQL real (pg-store.ts, esquema
 * Drizzle de Fase B). Sin ella → en memoria, con aviso: los datos se pierden
 * al parar el worker y la ingesta no persiste el checkpoint.
 */
export async function createStoreFromEnv(): Promise<WorkerStore> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn('[worker] DATABASE_URL no definida: store EN MEMORIA (no persistente).');
    return new InMemoryWorkerStore();
  }
  const { PostgresWorkerStore } = await import('./pg-store.js');
  const store = new PostgresWorkerStore(url);
  await store.ensureSchema();
  return store;
}
