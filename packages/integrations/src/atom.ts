// LicitaClima — adaptador Atom PLACSP (feeds 643 y 1044, Fase C).
//
// Fuentes oficiales (Fase A §1.4–1.5):
//   643:  licitacionesPerfilesContratanteCompleto3.atom (perfiles en PLACSP)
//   1044: PlataformasAgregadasSinMenores.atom (plataformas autonómicas)
// Paginación RFC 5005: cada fichero ≤ ~500 entradas, enlace <link rel="next">.
// Protecciones (las tres, tras el bug de bucle del pull de 30 días,
// volume-30d.md §7.3.1): la URL avanza en cada iteración (url = next),
// detección de ciclo (conjunto de URLs visitadas) y --max-pages.
//
// Seguridad XML: se elimina cualquier <!DOCTYPE ...> antes de parsear y el
// parser no resuelve entidades externas (sin XXE). Solo se usa xml.etree /
// fast-xml-parser con entidades estándar.

import { XMLParser } from 'fast-xml-parser';
import { SOURCES } from '@licitaclima/config';

export type FeedId = '643' | '1044';

export const FEED_URLS: Record<FeedId, string> = {
  '643': SOURCES.feed643,
  '1044': SOURCES.feed1044,
};

export type TenderStatusCode = 'PRE' | 'PUB' | 'EV' | 'ADJ' | 'RES' | 'ANUL';

export interface AtomDocumentRef {
  kind: 'pcap' | 'ppt' | 'general';
  uri: string;
  hash: string | null;
}

export interface AtomEntry {
  /** <id> Atom — clave de deduplicación dentro del feed. */
  id: string;
  link: string;
  title: string;
  updated: string; // ISO
  expediente: string;
  estado: TenderStatusCode | string;
  organo: string;
  cpv: string[];
  /** Importes como string decimal (nunca float). null = ausente en el feed. */
  valorEstimado: string | null;
  presupuestoBaseSinIva: string | null;
  presupuestoBaseConIva: string | null; // ausente en 1044 (0 %)
  provinciaNombre: string | null; // CountrySubentity; ausente en 1044
  nuts: string | null;
  plazoFecha: string | null; // EndDate YYYY-MM-DD
  plazoHora: string | null; // EndTime HH:MM:SS (null = solo fecha; NUNCA inventar hora)
  noticeTypes: string[];
  nLotes: number;
  documentUris: AtomDocumentRef[];
  feed: FeedId;
}

export interface AtomPage {
  feedUpdated: string | null;
  selfUrl: string | null;
  nextUrl: string | null;
  entries: AtomEntry[];
  /** Entradas eliminadas/archivadas (<at:deleted-entry>), si las hay. */
  deletedIds: string[];
}

export interface FetchResult {
  status: 200 | 304;
  body: string | null;
  etag: string | null;
  lastModified: string | null;
  attempts: number;
}

const MAX_ATTEMPTS = 5;
const FETCH_TIMEOUT_MS = 90_000;

/** Espera con backoff exponencial + jitter (evita thundering herd). */
export function backoffMs(attempt: number): number {
  return Math.min(120_000, 2 ** attempt * 5_000) + Math.random() * 5_000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

/**
 * GET de una página Atom con UA de navegador real (el WAF de
 * contrataciondelsectorpublico.gob.es rechaza UA mínimo — Fase A §6.6),
 * GET condicional (ETag/Last-Modified) y reintentos con backoff+jitter.
 */
export async function fetchAtomPage(
  url: string,
  opts: { etag?: string | null; lastModified?: string | null; userAgent: string } & {
    fetchFn?: typeof fetch;
    timeoutMs?: number;
    maxAttempts?: number;
  },
): Promise<FetchResult> {
  const fetchFn = opts.fetchFn ?? fetch;
  const maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const headers: Record<string, string> = {
        'User-Agent': opts.userAgent,
        Accept: 'application/atom+xml,application/xml;q=0.9,*/*;q=0.8',
      };
      if (opts.etag) headers['If-None-Match'] = opts.etag;
      if (opts.lastModified) headers['If-Modified-Since'] = opts.lastModified;
      const res = await fetchFn(url, {
        headers,
        signal: AbortSignal.timeout(opts.timeoutMs ?? FETCH_TIMEOUT_MS),
      });
      if (res.status === 304) {
        return { status: 304, body: null, etag: opts.etag ?? null, lastModified: opts.lastModified ?? null, attempts: attempt };
      }
      if (isRetryableStatus(res.status)) {
        throw new Error(`HTTP ${res.status} en ${url}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
      const body = await res.text();
      const head = body.slice(0, 200).trimStart().toLowerCase();
      if (!head.startsWith('<?xml') && !head.startsWith('<feed')) {
        throw new Error(`respuesta no-XML (posible WAF): ${body.slice(0, 120)}`);
      }
      return {
        status: 200,
        body,
        etag: res.headers.get('etag'),
        lastModified: res.headers.get('last-modified'),
        attempts: attempt,
      };
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts) break;
      await sleep(backoffMs(attempt));
    }
  }
  throw new Error(`fetch Atom fallido tras ${maxAttempts} intentos: ${String(lastError)}`);
}

// ---------------------------------------------------------------------------
// Parseo (seguro: sin DOCTYPE, sin entidades externas)
// ---------------------------------------------------------------------------

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) =>
    ['entry', 'link', 'ItemClassificationCode', 'NoticeTypeCode', 'ProcurementProjectLot'].includes(name),
});

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function textOf(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (v && typeof v === 'object' && '#text' in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)['#text'] ?? '').trim();
  }
  return '';
}

function first<T>(v: T | T[] | undefined | null): T | undefined {
  const a = asArray(v);
  return a[0];
}

/**
 * Importe del feed a string decimal. El feed mezcla formato español con coma
 * (42.884,99) y decimal plano (44294455.44); regla corregida en el pull de
 * 30 días (volume-30d.md §7.2): coma → español; punto + 1–2 decimales →
 * decimal plano; punto + grupos de 3 → miles; entero → tal cual.
 * Devuelve null si está ausente o no se puede parsear (nunca 0 inventado).
 */
export function parseAmount(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  try {
    if (s.includes(',')) return s.replace(/\./g, '').replace(',', '.');
    if (/^\d+\.\d{1,2}$/.test(s)) return s;
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) return s.replace(/\./g, '');
    if (/^\d+$/.test(s)) return s;
    return null;
  } catch {
    return null;
  }
}

/** Recoge todas las referencias a documentos (URI + hash) con su tipo. */
function collectDocumentRefs(cfs: Record<string, unknown>): AtomDocumentRef[] {
  const out: AtomDocumentRef[] = [];
  const walk = (node: unknown, kind: AtomDocumentRef['kind']): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, kind);
      return;
    }
    const obj = node as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'ExternalReference') {
        for (const ref of asArray(value)) {
          const r = ref as Record<string, unknown>;
          const uri = textOf(r['URI']);
          if (uri) out.push({ kind, uri, hash: textOf(r['DocumentHash']) || null });
        }
      } else if (key === 'LegalDocumentReference') {
        walk(value, 'pcap');
      } else if (key === 'TechnicalDocumentReference') {
        walk(value, 'ppt');
      } else if (key === 'DocumentHash' || key === 'URI' || key.startsWith('@_')) {
        // ya tratado / metadato sin interés aquí
      } else {
        walk(value, kind);
      }
    }
  };
  walk(cfs, 'general');
  return out;
}

function parseEntry(raw: Record<string, unknown>, feed: FeedId): AtomEntry {
  const cfs = (first(raw['ContractFolderStatus']) ?? {}) as Record<string, unknown>;
  const pp = (first(cfs['ProcurementProject']) ?? {}) as Record<string, unknown>;
  const ba = (first(pp['BudgetAmount']) ?? {}) as Record<string, unknown>;
  const rl = (first(pp['RealizedLocation']) ?? {}) as Record<string, unknown>;
  const tp = (first(cfs['TenderingProcess']) ?? {}) as Record<string, unknown>;
  const dl = (first(tp['TenderSubmissionDeadlinePeriod']) ?? {}) as Record<string, unknown>;

  let organo = '';
  const party = first(
    (first(cfs['LocatedContractingParty']) as Record<string, unknown> | undefined)?.['Party'],
  ) as Record<string, unknown> | undefined;
  const partyName = first(party?.['PartyName']) as Record<string, unknown> | undefined;
  if (partyName) organo = textOf(first(partyName['Name']));

  const links = asArray(raw['link']) as Record<string, unknown>[];
  const link = links.find((l) => l['@_rel'] === 'alternate') ?? links[0];
  const cpv = asArray(pp['RequiredCommodityClassification'])
    .flatMap((rc) => asArray((rc as Record<string, unknown>)['ItemClassificationCode']).map(textOf))
    .filter(Boolean);

  return {
    id: textOf(raw['id']),
    link: String(link?.['@_href'] ?? ''),
    title: textOf(raw['title']),
    updated: textOf(raw['updated']),
    expediente: textOf(cfs['ContractFolderID']),
    estado: textOf(cfs['ContractFolderStatusCode']),
    organo,
    cpv,
    valorEstimado: parseAmount(textOf(ba['EstimatedOverallContractAmount'])),
    presupuestoBaseSinIva: parseAmount(textOf(ba['TaxExclusiveAmount'])),
    presupuestoBaseConIva: parseAmount(textOf(ba['TotalAmount'])),
    provinciaNombre: textOf(rl['CountrySubentity']) || null,
    nuts: textOf(rl['CountrySubentityCode']) || null,
    plazoFecha: textOf(dl['EndDate']) || null,
    plazoHora: textOf(dl['EndTime']) || null,
    noticeTypes: asArray(cfs['ValidNoticeInfo'])
      .flatMap((vn) => asArray((vn as Record<string, unknown>)['NoticeTypeCode']).map(textOf))
      .filter(Boolean),
    nLotes: asArray(pp['ProcurementProjectLot']).length,
    documentUris: collectDocumentRefs(cfs),
    feed,
  };
}

/** Parsea una página Atom ya descargada. Lanza si el XML no es válido. */
export function parseAtomPage(xml: string, feed: FeedId): AtomPage {
  // Sin DOCTYPE: ninguna entidad externa puede definirse ni resolverse.
  const safe = xml.replace(/<!DOCTYPE[^>]*(\[[^\]]*\])?>/gi, '');
  const doc = parser.parse(safe) as Record<string, unknown>;
  const root = (doc['feed'] ?? {}) as Record<string, unknown>;
  const links = asArray(root['link']) as Record<string, unknown>[];
  const rel = (r: string): string | null => {
    const l = links.find((x) => x['@_rel'] === r);
    return l ? String(l['@_href']) : null;
  };
  const deleted = asArray(root['deleted-entry']) as Record<string, unknown>[];
  return {
    feedUpdated: textOf(root['updated']) || null,
    selfUrl: rel('self'),
    nextUrl: rel('next'),
    entries: asArray(root['entry']).map((e) => parseEntry(e as Record<string, unknown>, feed)),
    deletedIds: deleted.map((d) => String(d['@_ref'] ?? '')).filter(Boolean),
  };
}

// ---------------------------------------------------------------------------
// Paginación (con las tres protecciones anti-bucle)
// ---------------------------------------------------------------------------

export interface PaginateOptions {
  userAgent: string;
  /** Fecha de corte: se para cuando una página solo trae entradas anteriores. */
  cutoff?: Date | null;
  maxPages?: number;
  fetchFn?: typeof fetch;
  /** Estado inicial para reanudar (checkpoint persistente). */
  startUrl?: string | null;
  visited?: string[];
  /** ETag/Last-Modified del primer URL (GET condicional). */
  etag?: string | null;
  lastModified?: string | null;
}

export interface PaginateResult {
  pages: number;
  entries: number;
  nextUrl: string | null;
  visited: string[];
  stoppedBy: 'fin' | 'corte' | 'max-paginas' | 'ciclo' | 'sin-cambios';
}

/**
 * Recorre un feed siguiendo `next` y llama a `onPage` por cada página.
 * Protecciones: (1) url = next en cada iteración; (2) ciclo detectado por
 * URL ya visitada → parada con error; (3) maxPages → parada.
 */
export async function paginateFeed(
  feed: FeedId,
  onPage: (page: AtomPage, pageNo: number) => Promise<void> | void,
  opts: PaginateOptions,
): Promise<PaginateResult> {
  const maxPages = opts.maxPages ?? 400;
  const visited = new Set(opts.visited ?? []);
  let url: string | null = opts.startUrl ?? FEED_URLS[feed];
  let pages = 0;
  let entries = 0;
  let etag = opts.etag ?? null;
  let lastModified = opts.lastModified ?? null;

  while (url) {
    if (visited.has(url)) {
      return { pages, entries, nextUrl: url, visited: [...visited], stoppedBy: 'ciclo' };
    }
    if (pages >= maxPages) {
      return { pages, entries, nextUrl: url, visited: [...visited], stoppedBy: 'max-paginas' };
    }
    visited.add(url);
    const fetched = await fetchAtomPage(url, {
      etag: pages === 0 ? etag : null,
      lastModified: pages === 0 ? lastModified : null,
      userAgent: opts.userAgent,
      fetchFn: opts.fetchFn,
    });
    if (fetched.status === 304 || !fetched.body) {
      return { pages, entries, nextUrl: url, visited: [...visited], stoppedBy: 'sin-cambios' };
    }
    const page = parseAtomPage(fetched.body, feed);
    pages += 1;
    entries += page.entries.length;
    await onPage(page, pages);
    etag = fetched.etag;
    lastModified = fetched.lastModified;
    url = page.nextUrl; // (1) avanzar: sin esto se re-descarga siempre la pág. 1
    if (!url) return { pages, entries, nextUrl: null, visited: [...visited], stoppedBy: 'fin' };
    if (opts.cutoff) {
      const ups = page.entries.map((e) => Date.parse(e.updated)).filter((n) => !Number.isNaN(n));
      if (ups.length > 0 && Math.min(...ups) < opts.cutoff.getTime()) {
        return { pages, entries, nextUrl: url, visited: [...visited], stoppedBy: 'corte' };
      }
    }
  }
  return { pages, entries, nextUrl: null, visited: [...visited], stoppedBy: 'fin' };
}
