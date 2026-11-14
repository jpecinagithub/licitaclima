// LicitaClima — job de ingesta incremental (Fase C).
//
// Cada 6 h (config SOURCES.ingestionIntervalHours), por feed (643 y 1044):
// checkpoint persistente en ingestion_runs (cursor = next_url + ETag /
// Last-Modified del primer URL), deduplicación por <id> Atom y por
// (expediente+órgano), clasificación del nicho, corrección de provincia y
// avance por el pipeline. Una entrada republicada con el mismo <id> y nuevo
// <updated> se trata como actualización; un DOC_MOD (rectificación) sube la
// versión del expediente e invalida los análisis afectados (en el store) y
// devuelve el expediente a documentos_pendientes para re-extraer.

import { SOURCES } from '@licitaclima/config';
import {
  clasificarNicho,
  esPublicable,
  paginateFeed,
  resolverProvincia,
  type AtomEntry,
  type FeedId,
} from '@licitaclima/integrations';
import type { TenderInput, WorkerStore } from '../db.js';
import type { PipelineState } from '@licitaclima/domain';

export interface IngestResult {
  feed: FeedId;
  pages: number;
  entries: number;
  seen: number;
  newTenders: number;
  updatedTenders: number;
  rectified: number;
  stoppedBy: string;
  runId: string;
}

/** Normaliza una entrada Atom a TenderInput (importes diferenciados, nunca mezclados). */
export function entryToTenderInput(entry: AtomEntry, feed: FeedId): TenderInput {
  const clasificacion = clasificarNicho(entry.title, entry.cpv);
  const provincia = resolverProvincia({
    titulo: entry.title,
    nuts: entry.nuts,
    nombreFeed: entry.provinciaNombre,
  });
  return {
    source: feed === '643' ? 'feed643' : 'feed1044',
    sourceId: entry.id,
    expediente: entry.expediente,
    organo: entry.organo,
    objeto: entry.title,
    estado: entry.estado,
    valorEstimado: entry.valorEstimado,
    presupuestoBaseSinIva: entry.presupuestoBaseSinIva,
    presupuestoBaseConIva: entry.presupuestoBaseConIva,
    duracion: null, // la duración (PlannedPeriod) no se extrae del Atom en v1; consta en el pliego
    provincia: provincia.provincia,
    provinciaPorVerificar: provincia.provinciaPorVerificar,
    nuts: entry.nuts,
    plazoFecha: entry.plazoFecha,
    plazoHora: entry.plazoHora,
    // Hora solo si la fuente la da; si solo hay fecha, NUNCA se inventa hora.
    plazoSoloFecha: entry.plazoFecha !== null && entry.plazoHora === null,
    cpv: entry.cpv,
    claseNicho: clasificacion.clase,
    urlOficial: entry.link,
    documentUris: entry.documentUris,
    notices: entry.noticeTypes,
    firstPubAt: entry.estado === 'PUB' ? entry.updated : null,
    feedUpdatedAt: entry.updated,
    procedencia: `Atom ${feed} (ingesta incremental)`,
  };
}

/** Pipeline inicial tras el prefiltrado, según clase y documentos. */
export function pipelineInicial(input: TenderInput): PipelineState {
  if (!esPublicable(input.claseNicho)) return 'revision_requerida'; // marginal → revisión humana
  const tienePliego = input.documentUris.some((d) => d.kind === 'pcap' || d.kind === 'ppt');
  if (!tienePliego && input.documentUris.length === 0) return 'sin_documentos';
  return 'documentos_pendientes';
}

export async function runIngest(
  store: WorkerStore,
  opts: { feed: FeedId; maxPages?: number; fetchFn?: typeof fetch },
): Promise<IngestResult> {
  const { feed } = opts;
  const runId = await store.startIngestionRun(feed);
  const t0 = Date.now();
  let pages = 0;
  let entries = 0;
  let seen = 0;
  let newTenders = 0;
  let updatedTenders = 0;
  let rectified = 0;
  let errors = 0;

  // Checkpoint: última ingesta OK (cursor + ETag/Last-Modified).
  const latest = await store.getLatestIngestionRun(feed);
  const checkpoint =
    latest && latest.status === 'ok' && latest.cursorNextUrl
      ? { nextUrl: latest.cursorNextUrl, etag: latest.etag, lastModified: latest.lastModified }
      : null;

  try {
    const result = await paginateFeed(
      feed,
      async (page) => {
        pages += 1;
        entries += page.entries.length;
        for (const entry of page.entries) {
          // Deduplicación por <id> Atom: una entrada ya vista con el mismo
          // (o anterior) <updated> se ignora; una republicación con <updated>
          // MAYOR es una actualización/rectificación y se reprocesa.
          if (await store.hasSeenAtomId(feed, entry.id)) {
            const prev = await store.getTenderBySourceId(feed === '643' ? 'feed643' : 'feed1044', entry.id);
            const esRepublicacionNueva =
              prev !== null && entry.updated !== '' && (prev.feedUpdatedAt === null || entry.updated > prev.feedUpdatedAt);
            if (!esRepublicacionNueva) {
              seen += 1;
              continue;
            }
          }
          await store.markSeenAtomId(feed, entry.id);
          // Entradas eliminadas/archivadas del feed: se conservan (prompt §3:
          // "No elimines por ausencia en una descarga incremental").
          const input = entryToTenderInput(entry, feed);
          const clasificacion = clasificarNicho(entry.title, entry.cpv);
          if (!clasificacion.esNicho) continue;
          const { tender, created, rectified: wasRectified } = await store.upsertTender(input);
          if (created) {
            newTenders += 1;
            await store.setPipeline(tender.id, pipelineInicial(input));
            if (pipelineInicial(input) === 'documentos_pendientes') {
              await store.enqueueJob('documents', { tenderId: tender.id });
            }
          } else {
            updatedTenders += 1;
            if (wasRectified) {
              rectified += 1;
              // Rectificación: invalida análisis (lo hace el store) y re-extrae.
              await store.setPipeline(tender.id, 'documentos_pendientes');
              await store.enqueueJob('documents', { tenderId: tender.id });
            }
          }
        }
      },
      {
        userAgent: SOURCES.userAgent,
        maxPages: opts.maxPages ?? 400,
        fetchFn: opts.fetchFn,
        startUrl: checkpoint?.nextUrl ?? undefined,
        etag: checkpoint?.etag ?? undefined,
        lastModified: checkpoint?.lastModified ?? undefined,
      },
    );
    const stoppedBy = result.stoppedBy;
    await store.finishIngestionRun(runId, {
      status: stoppedBy === 'sin-cambios' ? 'sin-cambios' : 'ok',
      pages: result.pages,
      entries: result.entries,
      newTenders,
      updatedTenders,
      errors,
      cursorNextUrl: result.nextUrl,
      etag: null,
      lastModified: null,
      errorMessage: null,
      finishedAt: new Date().toISOString(),
    });
    await store.recordSourceHealth(feed, {
      ok: true,
      latencyMs: Date.now() - t0,
      entries: result.entries,
      error: null,
    });
    return { feed, pages: result.pages, entries: result.entries, seen, newTenders, updatedTenders, rectified, stoppedBy, runId };
  } catch (err) {
    errors += 1;
    const message = err instanceof Error ? err.message : String(err);
    await store.finishIngestionRun(runId, {
      status: 'error',
      pages,
      entries,
      newTenders,
      updatedTenders,
      errors,
      cursorNextUrl: null,
      etag: null,
      lastModified: null,
      errorMessage: message,
      finishedAt: new Date().toISOString(),
    });
    await store.recordSourceHealth(feed, { ok: false, latencyMs: Date.now() - t0, entries, error: message });
    throw err;
  }
}
