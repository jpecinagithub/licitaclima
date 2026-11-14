// LicitaClima — adaptador PostgreSQL del worker (Fase C).
//
// Trabaja contra el esquema Drizzle de FASE B (rama block/fase-b, migraciones
// ya aplicadas en esta BD): sources, ingestion_runs, tenders,
// tender_versions, documents, extracted_pages, generic_analyses,
// requirement_evidence, matches, jobs, organizations, company_profiles,
// users, memberships, email_outbox, audit_logs.
//
// Adaptaciones necesarias (Fase B no prevé todo lo que el worker necesita):
// - El checkpoint de ingesta (next_url + ETag/Last-Modified + páginas) vive
//   como JSON en ingestion_runs.cursor_checkpoint.
// - Los campos que solo existen en la foto del expediente (documentUris,
//   notices, procedencia, clase_manual, motivo_manual) viven en
//   tender_versions.data (JSON); tenders solo lleva lo consultable.
// - documents no tiene columna `kind`: el tipo (pcap/ppt/general) se guarda
//   en `filename` (el feed no da nombre de fichero; es solo el tipo).
// - matches no tiene marca de invalidación: una rectificación BORRA los
//   matches del expediente (son derivados y el job analyze los recalcula).
// - No hay tabla de digests: el resumen enviado se recupera del outbox
//   (clave digest:{org}:{semana}) y el "sin novedades" de audit_logs.
// - No hay tabla de salud de fuentes: sources.last_success_at/last_error
//   + audit_logs.
// - No hay tabla seen_atom_ids: la deduplicación por <id> Atom usa
//   tenders.external_id; las entradas fuera del nicho se reclasifican al
//   re-ingerir (barato e idempotente) porque el cursor evita re-descargar.
// - La versión del expediente vive en tender_versions (MAX(version)).
// - El plazo solo con fecha guarda deadline_at=NULL + deadline_date_only=true
//   (decisión de Fase B); la fecha queda en tender_versions.data.
//
// Los jobs programan contra la interfaz WorkerStore (./db.ts); si Fase B
// cambia columnas, solo cambia este adaptador.

import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { SOURCES } from '@licitaclima/config';
import type {
  DocumentInput,
  DocumentRecord,
  DigestRecord,
  IngestionRunInput,
  IngestionRunRecord,
  JobRecord,
  OrganizationInput,
  OrganizationRecord,
  OutboxInput,
  OutboxRecord,
  TenderInput,
  TenderRecord,
  WorkerStore,
} from './db.js';
import type { NicheClass, PipelineState } from '@licitaclima/domain';

const FEED_KEYS: Record<string, string> = {
  '643': 'feed643',
  '1044': 'feed1044',
  feed643: 'feed643',
  feed1044: 'feed1044',
  'seed-30d': 'seed-30d',
};

function sourceKeyOf(source: string): string {
  return FEED_KEYS[source] ?? source;
}

/**
 * Fecha + hora del feed (hora local Europe/Madrid, sin offset en la fuente)
 * a ISO con el offset correcto (CET +01:00 / CEST +02:00). Devuelve null si
 * falta la fecha o la hora (nunca se inventa una hora).
 */
export function madridIso(fecha: string | null, hora: string | null): string | null {
  if (!fecha || !hora) return null;
  const wall = `${fecha}T${hora.slice(0, 8)}`;
  for (const offset of ['+02:00', '+01:00']) {
    const iso = `${wall}${offset}`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
    const wallEnMadrid = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
    if (wallEnMadrid === wall) return iso;
  }
  return `${wall}+01:00`; // último recurso: CET (no debería ocurrir)
}

function slugify(nombre: string): string {
  const base = nombre
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || 'organizacion';
}

const TENDER_SELECT = `
  SELECT t.*, v.version AS v_version, v.data AS v_data
  FROM tenders t
  LEFT JOIN LATERAL (
    SELECT version, data FROM tender_versions WHERE tender_id = t.id ORDER BY version DESC LIMIT 1
  ) v ON true
`;

// numeric(18,4) de PostgreSQL llega como '90000.0000': se normaliza a
// '90000' (cadena decimal sin ceros a la derecha) para que la API sea
// estable y coincida con el formato que entregó el feed.
function dec(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

function rowToTender(r: Record<string, unknown>): TenderRecord {
  const data = (r['v_data'] as Record<string, unknown> | null) ?? {};
  const deadlineAt = r['deadline_at'] ? new Date(String(r['deadline_at'])) : null;
  const plazoFecha =
    typeof data['plazoFecha'] === 'string'
      ? (data['plazoFecha'] as string)
      : deadlineAt
        ? deadlineAt.toISOString().slice(0, 10)
        : null;
  const plazoHora =
    typeof data['plazoHora'] === 'string'
      ? (data['plazoHora'] as string)
      : deadlineAt
        ? deadlineAt.toISOString().slice(11, 19)
        : null;
  return {
    id: String(r['id']),
    source: (r['source_key'] as string) === 'feed1044' ? 'feed1044' : 'feed643',
    sourceId: String(r['external_id']),
    expediente: String(r['expediente']),
    organo: String(r['organo']),
    objeto: String(r['objeto']),
    estado: String(r['estado']),
    valorEstimado: dec(r['valor_estimado']),
    presupuestoBaseSinIva: dec(r['presupuesto_base_sin_iva']),
    presupuestoBaseConIva: dec(r['presupuesto_base_con_iva']),
    duracion: (r['duracion'] as string | null) ?? null,
    provincia: (r['provincia'] as string | null) ?? null,
    provinciaPorVerificar: Boolean(r['provincia_por_verificar']),
    nuts: (r['nuts'] as string | null) ?? null,
    plazoFecha,
    plazoHora,
    plazoSoloFecha: Boolean(r['deadline_date_only']),
    cpv: (r['cpv'] as string[]) ?? [],
    claseNicho: (r['clase_nicho'] as NicheClass | null) ?? 'marginal',
    claseManual: (data['claseManual'] as string | null) ?? null,
    motivoManual: (data['motivoManual'] as string | null) ?? null,
    urlOficial: String(r['url_oficial']),
    documentUris: (data['documentUris'] as TenderInput['documentUris']) ?? [],
    notices: (data['notices'] as string[]) ?? [],
    firstPubAt: r['published_at'] ? new Date(String(r['published_at'])).toISOString() : null,
    feedUpdatedAt: r['modified_at'] ? new Date(String(r['modified_at'])).toISOString() : null,
    procedencia: (data['procedencia'] as string | null) ?? null,
    pipeline: r['pipeline'] as PipelineState,
    version: Number(r['v_version'] ?? 1),
    createdAt: new Date(String(r['created_at'])).toISOString(),
    updatedAt: new Date(String(r['updated_at'])).toISOString(),
    lastSeenAt: new Date(String(r['updated_at'])).toISOString(),
  };
}

export class PostgresWorkerStore implements WorkerStore {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 10 });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  /**
   * Verifica que el esquema de Fase B existe y asegura las filas de fuentes.
   * Si las tablas no existen, lanza un error claro (hay que aplicar las
   * migraciones de Fase B; este adaptador no crea tablas).
   */
  async ensureSchema(): Promise<void> {
    const check = await this.pool.query(
      "SELECT 1 FROM information_schema.columns WHERE table_name = 'tenders' AND column_name = 'external_id'",
    );
    if (check.rows.length === 0) {
      throw new Error(
        'Esquema de Fase B no encontrado en la BD (falta tenders.external_id): aplica las migraciones de Fase B antes de arrancar el worker.',
      );
    }
    await this.pool.query(
      `INSERT INTO sources (id, key, name, url, kind, active) VALUES
         (gen_random_uuid(), 'feed643', 'Perfiles en PLACSP (643)', $1, 'atom', true),
         (gen_random_uuid(), 'feed1044', 'Plataformas agregadas sin menores (1044)', $2, 'atom', true)
       ON CONFLICT (key) DO UPDATE SET url = EXCLUDED.url`,
      [SOURCES.feed643, SOURCES.feed1044],
    );
  }

  private async getSourceId(key: string): Promise<string> {
    const res = await this.pool.query('SELECT id FROM sources WHERE key = $1', [key]);
    if (res.rows.length === 0) throw new Error(`fuente desconocida en BD: ${key}`);
    return String(res.rows[0]['id']);
  }

  private async getSourceIdForInput(source: TenderInput['source']): Promise<string> {
    return this.getSourceId(sourceKeyOf(source));
  }

  // ------------------------------------------------------------------ tenders
  async upsertTender(input: TenderInput): Promise<{ tender: TenderRecord; created: boolean; rectified: boolean }> {
    const sourceId = await this.getSourceIdForInput(input.source);
    const existing = await this.pool.query(
      `${TENDER_SELECT} WHERE (t.source_id = $1 AND t.external_id = $2) OR (t.expediente = $3 AND t.organo = $4) LIMIT 1`,
      [sourceId, input.sourceId, input.expediente, input.organo],
    );
    const contentHash = createHash('sha256')
      .update(JSON.stringify({ expediente: input.expediente, estado: input.estado, feedUpdatedAt: input.feedUpdatedAt, ve: input.valorEstimado }))
      .digest('hex');
    const deadlineAt = madridIso(input.plazoFecha, input.plazoHora);

    if (existing.rows.length === 0) {
      const res = await this.pool.query(
        `INSERT INTO tenders (id, source_id, source_key, external_id, expediente, organo, objeto, estado,
           clase_nicho, provincia, provincia_por_verificar, nuts, cpv, url_oficial,
           published_at, modified_at, deadline_at, deadline_date_only,
           valor_estimado, presupuesto_base_sin_iva, presupuesto_base_con_iva, currency,
           duracion, pipeline, content_hash)
         VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'EUR',$21,'descubierto',$22)
         RETURNING *`,
        [
          sourceId, sourceKeyOf(input.source), input.sourceId, input.expediente, input.organo, input.objeto, input.estado,
          input.claseNicho, input.provincia, input.provinciaPorVerificar, input.nuts, input.cpv, input.urlOficial,
          input.firstPubAt, input.feedUpdatedAt, deadlineAt, input.plazoSoloFecha,
          input.valorEstimado, input.presupuestoBaseSinIva, input.presupuestoBaseConIva,
          input.duracion, contentHash,
        ],
      );
      const tenderId = String(res.rows[0]['id']);
      await this.pool.query(
        'INSERT INTO tender_versions (id, tender_id, version, data, change_kind) VALUES (gen_random_uuid(), $1, 1, $2, $3)',
        [tenderId, JSON.stringify(input), 'created'],
      );
      const tender = await this.getTender(tenderId);
      return { tender: tender as TenderRecord, created: true, rectified: false };
    }

    const prev = rowToTender(existing.rows[0]);
    // Rectificación: cambia el estado o el <updated> del feed (comparado
    // como instante, no como cadena: '15:00+01:00' y '14:00Z' son lo mismo).
    const prevMs = prev.feedUpdatedAt ? new Date(prev.feedUpdatedAt).getTime() : null;
    const nextMs = input.feedUpdatedAt ? new Date(input.feedUpdatedAt).getTime() : null;
    const rectified = prev.estado !== input.estado || prevMs !== nextMs;
    // COALESCE: los campos que la republicación no trae conservan el valor previo.
    const fechaFusionada = input.plazoFecha ?? prev.plazoFecha;
    const horaFusionada = input.plazoHora ?? prev.plazoHora;
    const res = await this.pool.query(
      `UPDATE tenders SET objeto=$2, estado=$3, clase_nicho=$4,
         provincia = COALESCE($5, provincia),
         provincia_por_verificar=$6, nuts = COALESCE($7, nuts),
         cpv = CASE WHEN cardinality($8::text[]) = 0 THEN cpv ELSE $8 END,
         url_oficial=$9, modified_at=$10,
         deadline_at = COALESCE($11, deadline_at),
         deadline_date_only=$12,
         valor_estimado = COALESCE($13, valor_estimado),
         presupuesto_base_sin_iva = COALESCE($14, presupuesto_base_sin_iva),
         presupuesto_base_con_iva = COALESCE($15, presupuesto_base_con_iva),
         duracion = COALESCE($16, duracion),
         content_hash=$17, updated_at = now()
       WHERE id=$1 RETURNING *`,
      [
        prev.id, input.objeto, input.estado, input.claseNicho,
        input.provincia, input.provinciaPorVerificar, input.nuts, input.cpv,
        input.urlOficial, input.feedUpdatedAt,
        deadlineAt, fechaFusionada !== null && horaFusionada === null,
        input.valorEstimado, input.presupuestoBaseSinIva, input.presupuestoBaseConIva,
        input.duracion, contentHash,
      ],
    );
    void res;
    if (rectified) {
      const newVersion = prev.version + 1;
      await this.pool.query(
        'INSERT INTO tender_versions (id, tender_id, version, data, change_kind) VALUES (gen_random_uuid(), $1, $2, $3, $4) ON CONFLICT (tender_id, version) DO NOTHING',
        [prev.id, newVersion, JSON.stringify(input), 'rectification'],
      );
      await this.invalidateMatches(prev.id, `rectificación DOC_MOD: estado ${prev.estado} → ${input.estado}`);
    }
    const tender = await this.getTender(prev.id);
    return { tender: tender as TenderRecord, created: false, rectified };
  }

  async getTender(id: string): Promise<TenderRecord | null> {
    const res = await this.pool.query(`${TENDER_SELECT} WHERE t.id = $1`, [id]);
    return res.rows.length > 0 ? rowToTender(res.rows[0]) : null;
  }

  async getTenderBySourceId(source: string, sourceId: string): Promise<TenderRecord | null> {
    const res = await this.pool.query(
      `${TENDER_SELECT} WHERE t.source_key = $1 AND t.external_id = $2`,
      [sourceKeyOf(source), sourceId],
    );
    return res.rows.length > 0 ? rowToTender(res.rows[0]) : null;
  }

  async getTenderByExpedienteOrgano(expediente: string, organo: string): Promise<TenderRecord | null> {
    const res = await this.pool.query(`${TENDER_SELECT} WHERE t.expediente = $1 AND t.organo = $2`, [expediente, organo]);
    return res.rows.length > 0 ? rowToTender(res.rows[0]) : null;
  }

  async listTenders(filter: { pipeline?: PipelineState | PipelineState[]; provincia?: string; claseNicho?: NicheClass | NicheClass[]; estado?: string; limit?: number }): Promise<TenderRecord[]> {
    const conds: string[] = [];
    const params: unknown[] = [];
    if (filter.pipeline) {
      const ps = Array.isArray(filter.pipeline) ? filter.pipeline : [filter.pipeline];
      params.push(ps);
      conds.push(`t.pipeline = ANY($${params.length})`);
    }
    if (filter.provincia) {
      params.push(filter.provincia);
      conds.push(`t.provincia = $${params.length}`);
    }
    if (filter.claseNicho) {
      const cs = Array.isArray(filter.claseNicho) ? filter.claseNicho : [filter.claseNicho];
      params.push(cs);
      conds.push(`t.clase_nicho = ANY($${params.length})`);
    }
    if (filter.estado) {
      params.push(filter.estado);
      conds.push(`t.estado = $${params.length}`);
    }
    params.push(filter.limit ?? 100);
    const res = await this.pool.query(
      `${TENDER_SELECT} ${conds.length > 0 ? `WHERE ${conds.join(' AND ')}` : ''} ORDER BY t.updated_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(rowToTender);
  }

  async setPipeline(id: string, pipeline: PipelineState): Promise<void> {
    await this.pool.query('UPDATE tenders SET pipeline = $2, updated_at = now() WHERE id = $1', [id, pipeline]);
  }

  async hasSeenAtomId(source: string, atomId: string): Promise<boolean> {
    const res = await this.pool.query(
      'SELECT 1 FROM tenders WHERE source_key = $1 AND external_id = $2',
      [sourceKeyOf(source), atomId],
    );
    return res.rows.length > 0;
  }

  async markSeenAtomId(): Promise<void> {
    // Sin tabla seen_atom_ids en Fase B: la deduplicación de entradas del
    // nicho usa tenders.external_id; las de fuera del nicho se reclasifican
    // (barato) si se re-ingiere una página, porque el cursor evita re-descargar.
  }

  // ---------------------------------------------------------- ingesta y salud
  async startIngestionRun(source: string): Promise<string> {
    const sourceId = await this.getSourceId(sourceKeyOf(source));
    const res = await this.pool.query(
      'INSERT INTO ingestion_runs (id, source_id, status) VALUES (gen_random_uuid(), $1, $2) RETURNING id',
      [sourceId, 'running'],
    );
    return String(res.rows[0]['id']);
  }

  async finishIngestionRun(runId: string, result: Omit<IngestionRunInput, 'source'>): Promise<void> {
    const checkpoint = JSON.stringify({
      nextUrl: result.cursorNextUrl,
      etag: result.etag,
      lastModified: result.lastModified,
      pages: result.pages,
    });
    await this.pool.query(
      `UPDATE ingestion_runs SET status=$2, cursor_checkpoint=$3, entries_seen=$4,
         entries_new=$5, entries_updated=$6, entries_skipped=$7, error=$8, finished_at=$9 WHERE id=$1`,
      [
        runId, result.status, checkpoint, result.entries, result.newTenders, result.updatedTenders,
        result.errors, result.errorMessage, result.finishedAt,
      ],
    );
  }

  async getLatestIngestionRun(source: string): Promise<IngestionRunRecord | null> {
    const sourceId = await this.getSourceId(sourceKeyOf(source));
    const res = await this.pool.query(
      'SELECT * FROM ingestion_runs WHERE source_id = $1 ORDER BY started_at DESC LIMIT 1',
      [sourceId],
    );
    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    let checkpoint: { nextUrl?: string | null; etag?: string | null; lastModified?: string | null; pages?: number } = {};
    try {
      checkpoint = r['cursor_checkpoint'] ? JSON.parse(String(r['cursor_checkpoint'])) : {};
    } catch {
      checkpoint = {};
    }
    return {
      id: String(r['id']),
      source: sourceKeyOf(source),
      status: r['status'],
      pages: Number(checkpoint.pages ?? 0),
      entries: Number(r['entries_seen']),
      newTenders: Number(r['entries_new']),
      updatedTenders: Number(r['entries_updated']),
      errors: Number(r['entries_skipped']),
      cursorNextUrl: checkpoint.nextUrl ?? null,
      etag: checkpoint.etag ?? null,
      lastModified: checkpoint.lastModified ?? null,
      errorMessage: (r['error'] as string | null) ?? null,
      finishedAt: r['finished_at'] ? new Date(String(r['finished_at'])).toISOString() : null,
      startedAt: new Date(String(r['started_at'])).toISOString(),
    };
  }

  async recordSourceHealth(source: string, health: { ok: boolean; latencyMs: number | null; entries: number | null; error: string | null }): Promise<void> {
    const key = sourceKeyOf(source);
    await this.pool.query(
      `UPDATE sources SET last_success_at = CASE WHEN $2 THEN now() ELSE last_success_at END,
         last_error = $3, updated_at = now() WHERE key = $1`,
      [key, health.ok, health.error],
    );
    await this.pool.query(
      `INSERT INTO audit_logs (id, actor_type, action, object_type, object_id, details)
       VALUES (gen_random_uuid(), 'system', 'source_health_check', 'source', $1, $2)`,
      [key, JSON.stringify({ ok: health.ok, latencyMs: health.latencyMs, entries: health.entries, error: health.error })],
    );
  }

  // ------------------------------------------------------------- documentos
  async insertDocument(input: DocumentInput): Promise<DocumentRecord> {
    // Fase B no tiene columna `kind`: el tipo (pcap/ppt/general) va en `filename`.
    const res = await this.pool.query(
      `INSERT INTO documents (id, tender_id, url, filename, mime, size_bytes, sha256, storage_path, status)
       VALUES (gen_random_uuid(),$1,$2,$3,'application/pdf',$4,$5,$6,'downloaded')
       ON CONFLICT (tender_id, sha256) DO NOTHING RETURNING *`,
      [input.tenderId, input.url, input.kind, input.sizeBytes, input.sha256, `${input.sha256}.pdf`],
    );
    const row =
      res.rows.length > 0
        ? res.rows[0]
        : (await this.pool.query('SELECT * FROM documents WHERE tender_id = $1 AND sha256 = $2', [input.tenderId, input.sha256])).rows[0];
    return this.docFromRow(row);
  }

  private docFromRow(r: Record<string, unknown>): DocumentRecord {
    return {
      id: String(r['id']),
      tenderId: String(r['tender_id']),
      kind: (r['filename'] as DocumentInput['kind']) ?? 'general',
      url: String(r['url']),
      sha256: String(r['sha256']),
      sizeBytes: Number(r['size_bytes'] ?? 0),
      pages: null,
      status: String(r['status']),
      createdAt: new Date(String(r['created_at'])).toISOString(),
    };
  }

  async findDocumentByHash(sha256: string): Promise<DocumentRecord | null> {
    const res = await this.pool.query('SELECT * FROM documents WHERE sha256 = $1 ORDER BY created_at LIMIT 1', [sha256]);
    return res.rows.length > 0 ? this.docFromRow(res.rows[0]) : null;
  }

  async getDocumentsForTender(tenderId: string): Promise<DocumentRecord[]> {
    const res = await this.pool.query('SELECT * FROM documents WHERE tender_id = $1 ORDER BY created_at', [tenderId]);
    return res.rows.map((r) => this.docFromRow(r));
  }

  async saveExtractedPages(documentId: string, pages: Array<{ page: number; text: string }>): Promise<void> {
    for (const p of pages) {
      await this.pool.query(
        `INSERT INTO extracted_pages (id, document_id, page_number, text_content, char_count)
         VALUES (gen_random_uuid(),$1,$2,$3,$4)
         ON CONFLICT (document_id, page_number) DO UPDATE SET text_content = EXCLUDED.text_content, char_count = EXCLUDED.char_count`,
        [documentId, p.page, p.text, p.text.length],
      );
    }
  }

  // ------------------------------------------------------ extracción y matches
  async saveExtraction(tenderId: string, version: string, payload: unknown, status: string): Promise<void> {
    const extraction = payload as { requisitos?: Array<{ obligatorio?: boolean; evidencia?: unknown }> };
    const blocked = (extraction.requisitos ?? []).some((r) => r.obligatorio && !r.evidencia);
    const dbStatus = blocked ? 'blocked_no_evidence' : status === 'extraido' ? 'done' : status;
    const res = await this.pool.query(
      `INSERT INTO generic_analyses (id, tender_id, pipeline_version, provider, status, data)
       VALUES (gen_random_uuid(),$1,$2,'determinista-v1 (sin LLM)',$3,$4)
       ON CONFLICT (tender_id, pipeline_version) DO UPDATE SET status = EXCLUDED.status, data = EXCLUDED.data, updated_at = now()
       RETURNING id`,
      [tenderId, version, dbStatus, JSON.stringify(payload)],
    );
    const analysisId = String(res.rows[0]['id']);
    await this.pool.query('DELETE FROM requirement_evidence WHERE generic_analysis_id = $1', [analysisId]);
    for (const req of extraction.requisitos ?? []) {
      const r = req as { id?: string; categoria?: string; evidencia?: unknown };
      await this.pool.query(
        'INSERT INTO requirement_evidence (id, generic_analysis_id, requirement, category, evidence) VALUES (gen_random_uuid(), $1,$2,$3,$4)',
        [analysisId, r.id ?? '', r.categoria ?? null, r.evidencia ? JSON.stringify(r.evidencia) : null],
      );
    }
  }

  async getExtraction(tenderId: string): Promise<{ payload: unknown; status: string } | null> {
    const res = await this.pool.query(
      "SELECT data, status FROM generic_analyses WHERE tender_id = $1 AND pipeline_version = 'determinista-v1'",
      [tenderId],
    );
    return res.rows.length > 0 ? { payload: res.rows[0]['data'], status: String(res.rows[0]['status']) } : null;
  }

  async saveMatch(tenderId: string, organizationId: string | null, payload: unknown, recomendacion: string): Promise<void> {
    if (!organizationId) return; // sin organización no hay match por tenant (el análisis genérico ya está guardado)
    const profile = await this.pool.query(
      'SELECT version FROM company_profiles WHERE organization_id = $1',
      [organizationId],
    );
    const profileVersion = profile.rows.length > 0 ? Number(profile.rows[0]['version']) : 1;
    const matrix = payload as { resumen?: { compatibles?: number; incompatibles?: number; desconocidos?: number; noAplica?: number }; bloqueadoPor?: string[] };
    const resumen = {
      compatibles: matrix.resumen?.compatibles ?? 0,
      incompatibles: matrix.resumen?.incompatibles ?? 0,
      desconocidos: matrix.resumen?.desconocidos ?? 0,
      noAplica: matrix.resumen?.noAplica ?? 0,
    };
    const total = resumen.compatibles + resumen.incompatibles + resumen.desconocidos + resumen.noAplica;
    const score = total > 0 ? (resumen.compatibles / total).toFixed(4) : '0.0000';
    const verdict = recomendacion === 'positiva' ? 'compatible' : recomendacion === 'negativa' ? 'incompatible' : 'desconocido';
    await this.pool.query(
      `INSERT INTO matches (id, organization_id, tender_id, profile_version, score, verdict, blocking, explanation, recalculated_at)
       VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,now())
       ON CONFLICT (organization_id, tender_id, profile_version) DO UPDATE SET
         score = EXCLUDED.score, verdict = EXCLUDED.verdict, blocking = EXCLUDED.blocking,
         explanation = EXCLUDED.explanation, recalculated_at = now(), updated_at = now()`,
      [organizationId, tenderId, profileVersion, score, verdict, (matrix.bloqueadoPor ?? []).length > 0, JSON.stringify(payload)],
    );
  }

  async invalidateMatches(tenderId: string, reason: string): Promise<number> {
    // Fase B no tiene marca de invalidación: los matches son derivados y se
    // recalculan con el job analyze, así que se eliminan (con traza en audit_logs).
    const res = await this.pool.query('DELETE FROM matches WHERE tender_id = $1 RETURNING id', [tenderId]);
    const n = res.rowCount ?? 0;
    if (n > 0) {
      await this.pool.query(
        `INSERT INTO audit_logs (id, actor_type, action, object_type, object_id, details)
         VALUES (gen_random_uuid(), 'system', 'matches_invalidados', 'tender', $1, $2)`,
        [tenderId, JSON.stringify({ motivo: reason, eliminados: n })],
      );
    }
    return n;
  }

  // -------------------------------------------------------------------- jobs
  async enqueueJob(type: string, payload: Record<string, unknown>, opts?: { maxAttempts?: number; runAt?: string }): Promise<JobRecord> {
    const res = await this.pool.query(
      'INSERT INTO jobs (id, type, payload, max_attempts, run_at) VALUES (gen_random_uuid(), $1,$2,$3,$4) RETURNING *',
      [type, JSON.stringify(payload), opts?.maxAttempts ?? 5, opts?.runAt ?? new Date().toISOString()],
    );
    return this.jobFromRow(res.rows[0]);
  }

  async claimDueJobs(limit: number): Promise<JobRecord[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const res = await client.query(
        `SELECT * FROM jobs WHERE status = 'pending' AND run_at <= now()
         ORDER BY run_at LIMIT $1 FOR UPDATE SKIP LOCKED`,
        [limit],
      );
      const jobs: JobRecord[] = [];
      for (const row of res.rows) {
        await client.query("UPDATE jobs SET status='running', attempts = attempts + 1, updated_at = now() WHERE id = $1", [row['id']]);
        jobs.push(this.jobFromRow({ ...row, status: 'running', attempts: Number(row['attempts']) + 1 }));
      }
      await client.query('COMMIT');
      return jobs;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private jobFromRow(r: Record<string, unknown>): JobRecord {
    return {
      id: String(r['id']),
      type: String(r['type']),
      payload: (r['payload'] as Record<string, unknown>) ?? {},
      status: r['status'] as JobRecord['status'],
      attempts: Number(r['attempts']),
      maxAttempts: Number(r['max_attempts']),
      nextRetryAt: new Date(String(r['run_at'])).toISOString(),
      lastError: (r['last_error'] as string | null) ?? null,
      createdAt: new Date(String(r['created_at'])).toISOString(),
      updatedAt: new Date(String(r['updated_at'])).toISOString(),
    };
  }

  async completeJob(id: string): Promise<void> {
    await this.pool.query("UPDATE jobs SET status='done', updated_at = now() WHERE id = $1", [id]);
  }

  async failJob(id: string, error: string, nextRetryAt: string | null): Promise<void> {
    const res = await this.pool.query('SELECT attempts, max_attempts FROM jobs WHERE id = $1', [id]);
    if (res.rows.length === 0) return;
    const retry = nextRetryAt && Number(res.rows[0]['attempts']) < Number(res.rows[0]['max_attempts']);
    await this.pool.query(
      "UPDATE jobs SET last_error = $2, status = $3, run_at = COALESCE($4, run_at), updated_at = now() WHERE id = $1",
      [id, error, retry ? 'pending' : 'failed', nextRetryAt],
    );
  }

  // ------------------------------------------------- organizaciones y outbox
  async upsertOrganization(input: OrganizationInput): Promise<OrganizationRecord> {
    const slugBase = slugify(input.name);
    let slug = slugBase;
    if (input.id) {
      const existing = await this.pool.query('SELECT id, slug FROM organizations WHERE id = $1', [input.id]);
      if (existing.rows.length > 0) slug = String(existing.rows[0]['slug']);
    } else {
      const clash = await this.pool.query('SELECT 1 FROM organizations WHERE slug = $1', [slug]);
      if (clash.rows.length > 0) slug = `${slugBase}-${createHash('sha256').update(input.name).digest('hex').slice(0, 6)}`;
    }
    const orgRes = input.id
      ? await this.pool.query(
          `INSERT INTO organizations (id, name, slug) VALUES ($1,$2,$3)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name RETURNING *`,
          [input.id, input.name, slug],
        )
      : await this.pool.query(
          `INSERT INTO organizations (id, name, slug) VALUES (gen_random_uuid(), $1,$2)
           ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING *`,
          [input.name, slug],
        );
    const orgId = String(orgRes.rows[0]['id']);
    await this.pool.query(
      `INSERT INTO company_profiles (id, organization_id, actividad, provincias, version)
       VALUES (gen_random_uuid(), $1,$2,$3,1)
       ON CONFLICT (organization_id) DO UPDATE SET provincias = EXCLUDED.provincias`,
      [orgId, input.actividad ?? 'mantenimiento e instalación de climatización', input.provincias],
    );
    if (input.email) {
      const email = input.email.toLowerCase();
      const userRes = await this.pool.query(
        `INSERT INTO users (id, email, role) VALUES (gen_random_uuid(), $1,'cliente')
         ON CONFLICT (lower(email)) DO NOTHING RETURNING id`,
        [email],
      );
      let userId: string | null = userRes.rows.length > 0 ? String(userRes.rows[0]['id']) : null;
      if (!userId) {
        const found = await this.pool.query('SELECT id FROM users WHERE lower(email) = $1', [email]);
        userId = found.rows.length > 0 ? String(found.rows[0]['id']) : null;
      }
      if (userId) {
        await this.pool.query(
          `INSERT INTO memberships (id, organization_id, user_id, role) VALUES (gen_random_uuid(), $1,$2,'owner')
           ON CONFLICT (organization_id, user_id) DO NOTHING`,
          [orgId, userId],
        );
      }
    }
    return { id: orgId, name: input.name, email: input.email, provincias: input.provincias, createdAt: new Date(String(orgRes.rows[0]['created_at'])).toISOString() };
  }

  async listOrganizations(): Promise<OrganizationRecord[]> {
    const res = await this.pool.query(
      `SELECT o.id, o.name, o.created_at, cp.provincias,
              (SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id
               WHERE m.organization_id = o.id ORDER BY m.created_at LIMIT 1) AS email
       FROM organizations o
       LEFT JOIN company_profiles cp ON cp.organization_id = o.id
       ORDER BY o.created_at`,
    );
    return res.rows.map((r) => ({
      id: String(r['id']),
      name: String(r['name']),
      email: (r['email'] as string | null) ?? null,
      provincias: (r['provincias'] as string[]) ?? [],
      createdAt: new Date(String(r['created_at'])).toISOString(),
    }));
  }

  private async orgEmail(organizationId: string): Promise<string> {
    const res = await this.pool.query(
      `SELECT u.email FROM memberships m JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = $1 ORDER BY m.created_at LIMIT 1`,
      [organizationId],
    );
    if (res.rows.length === 0) {
      throw new Error(`organización ${organizationId} sin email (sin usuario miembro): no se puede encolar el correo`);
    }
    return String(res.rows[0]['email']);
  }

  async insertOutbox(input: OutboxInput): Promise<OutboxRecord> {
    const toEmail = input.organizationId ? await this.orgEmail(input.organizationId) : null;
    if (!toEmail) throw new Error('outbox sin organización ni email: no se puede encolar');
    const res = await this.pool.query(
      `INSERT INTO email_outbox (id, organization_id, to_email, template_key, subject, body_text, payload, idempotency_key)
       VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`,
      [input.organizationId, toEmail, input.kind, input.subject, input.body, JSON.stringify({ kind: input.kind, tenderIds: input.tenderIds ?? [] }), input.idempotencyKey],
    );
    const row =
      res.rows.length > 0
        ? res.rows[0]
        : (await this.pool.query('SELECT * FROM email_outbox WHERE idempotency_key = $1', [input.idempotencyKey])).rows[0];
    return this.outboxFromRow(row);
  }

  private outboxFromRow(r: Record<string, unknown>): OutboxRecord {
    return {
      id: String(r['id']),
      organizationId: (r['organization_id'] as string | null) ?? null,
      kind: r['template_key'] as OutboxRecord['kind'],
      subject: String(r['subject']),
      body: String(r['body_text'] ?? ''),
      idempotencyKey: String(r['idempotency_key']),
      status: r['status'] as OutboxRecord['status'],
      createdAt: new Date(String(r['created_at'])).toISOString(),
    };
  }

  async outboxExists(idempotencyKey: string): Promise<boolean> {
    const res = await this.pool.query('SELECT 1 FROM email_outbox WHERE idempotency_key = $1', [idempotencyKey]);
    return res.rows.length > 0;
  }

  async listOutbox(status?: string): Promise<OutboxRecord[]> {
    const res = status
      ? await this.pool.query('SELECT * FROM email_outbox WHERE status = $1 ORDER BY created_at', [status])
      : await this.pool.query('SELECT * FROM email_outbox ORDER BY created_at');
    return res.rows.map((r) => this.outboxFromRow(r));
  }

  // ----------------------------------------------------------------- digests
  async recordDigest(organizationId: string, weekStart: string, status: 'enviado' | 'sin_novedades', tenderIds: string[]): Promise<DigestRecord> {
    const existing = await this.getDigest(organizationId, weekStart);
    if (existing) return existing;
    if (status === 'enviado') {
      const res = await this.pool.query(
        "SELECT * FROM email_outbox WHERE organization_id = $1 AND template_key = 'resumen_semanal' AND idempotency_key = $2",
        [organizationId, `digest:${organizationId}:${weekStart}`],
      );
      if (res.rows.length > 0) {
        const payload = (res.rows[0]['payload'] as Record<string, unknown>) ?? {};
        return {
          id: String(res.rows[0]['id']),
          organizationId,
          weekStart,
          status: 'enviado',
          tenderIds: (payload['tenderIds'] as string[]) ?? tenderIds,
          createdAt: new Date(String(res.rows[0]['created_at'])).toISOString(),
        };
      }
      return { id: `digest:${organizationId}:${weekStart}`, organizationId, weekStart, status, tenderIds, createdAt: new Date().toISOString() };
    }
    await this.pool.query(
      `INSERT INTO audit_logs (id, actor_type, action, object_type, object_id, details)
       VALUES (gen_random_uuid(), 'system', 'digest_sin_novedades', 'organization', $1, $2)`,
      [organizationId, JSON.stringify({ week_start: weekStart })],
    );
    return { id: `digest:${organizationId}:${weekStart}:sin_novedades`, organizationId, weekStart, status, tenderIds, createdAt: new Date().toISOString() };
  }

  async getDigest(organizationId: string, weekStart: string): Promise<DigestRecord | null> {
    const outbox = await this.pool.query(
      "SELECT * FROM email_outbox WHERE organization_id = $1 AND template_key = 'resumen_semanal' AND idempotency_key = $2",
      [organizationId, `digest:${organizationId}:${weekStart}`],
    );
    if (outbox.rows.length > 0) {
      const payload = (outbox.rows[0]['payload'] as Record<string, unknown>) ?? {};
      return {
        id: String(outbox.rows[0]['id']),
        organizationId,
        weekStart,
        status: 'enviado',
        tenderIds: (payload['tenderIds'] as string[]) ?? [],
        createdAt: new Date(String(outbox.rows[0]['created_at'])).toISOString(),
      };
    }
    const audit = await this.pool.query(
      `SELECT * FROM audit_logs WHERE action = 'digest_sin_novedades' AND object_id = $1
         AND details->>'week_start' = $2 ORDER BY created_at DESC LIMIT 1`,
      [organizationId, weekStart],
    );
    if (audit.rows.length > 0) {
      return {
        id: String(audit.rows[0]['id']),
        organizationId,
        weekStart,
        status: 'sin_novedades',
        tenderIds: [],
        createdAt: new Date(String(audit.rows[0]['created_at'])).toISOString(),
      };
    }
    return null;
  }

  async getLastDigest(organizationId: string): Promise<DigestRecord | null> {
    const outbox = await this.pool.query(
      "SELECT * FROM email_outbox WHERE organization_id = $1 AND template_key = 'resumen_semanal' ORDER BY created_at DESC LIMIT 1",
      [organizationId],
    );
    const audit = await this.pool.query(
      `SELECT * FROM audit_logs WHERE action = 'digest_sin_novedades' AND object_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [organizationId],
    );
    const fromOutbox = outbox.rows.length > 0
      ? {
          id: String(outbox.rows[0]['id']),
          organizationId,
          weekStart: String((outbox.rows[0]['idempotency_key'] as string).split(':').pop()),
          status: 'enviado' as const,
          tenderIds: ((outbox.rows[0]['payload'] as Record<string, unknown> | null)?.['tenderIds'] as string[]) ?? [],
          createdAt: new Date(String(outbox.rows[0]['created_at'])).toISOString(),
        }
      : null;
    const fromAudit = audit.rows.length > 0
      ? {
          id: String(audit.rows[0]['id']),
          organizationId,
          weekStart: String(((audit.rows[0]['details'] as Record<string, unknown>) ?? {})['week_start'] ?? ''),
          status: 'sin_novedades' as const,
          tenderIds: [] as string[],
          createdAt: new Date(String(audit.rows[0]['created_at'])).toISOString(),
        }
      : null;
    if (fromOutbox && fromAudit) return fromOutbox.createdAt > fromAudit.createdAt ? fromOutbox : fromAudit;
    return fromOutbox ?? fromAudit;
  }
}
