// LicitaClima — descarga y extracción de texto de pliegos PDF (Fase C).
//
// Descarga: SOLO dominios de la allowlist (ssrf.ts), https, validación DNS,
// redirecciones seguidas manualmente y revalidadas (máx. 5), tamaño máx.
// 20 MB, MIME application/pdf, firma %PDF. El HTML de rechazo del WAF
// ("Request Rejected") NO se guarda como documento: se detecta por MIME/firma
// y se marca fuente_no_disponible.
//
// Extracción de texto: pdfjs-dist (elegido frente a pdf-parse porque está
// mantenido, no ejecuta código del PDF y permite extraer por página con su
// numeración original; sin fuentes externas).
// Si el PDF no tiene texto extraíble (escaneado), se devuelve pages vacías y
// el job lo marca requiere_OCR (OCR local opcional, no obligatorio en MVP).
// Límites del worker: 200 páginas / 120 s (config LIMITS).

import { createHash } from 'node:crypto';
import { LIMITS, SOURCES } from '@licitaclima/config';
import {
  PDF_MAX_BYTES,
  PDF_MAX_REDIRECTS,
  SsrfError,
  validateDocumentUrl,
} from './ssrf.js';

export interface DownloadedPdf {
  bytes: Buffer;
  sha256: string;
  sizeBytes: number;
  contentType: string | null;
  finalUrl: string;
  redirects: number;
}

export class PdfDownloadError extends Error {
  constructor(
    message: string,
    public readonly kind:
      | 'ssrf'
      | 'waf'
      | 'http'
      | 'demasiado-grande'
      | 'mime'
      | 'firma'
      | 'timeout',
  ) {
    super(message);
    this.name = 'PdfDownloadError';
  }
}

export interface DownloadOptions {
  userAgent?: string;
  maxBytes?: number;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  lookupFn?: (host: string) => Promise<Array<{ address: string }>>;
}

/**
 * Descarga un PDF con todas las validaciones. Las redirecciones se siguen
 * manualmente para revalidar cada destino (una redirección a IP privada o a
 * un dominio fuera de la allowlist se bloquea).
 */
export async function downloadPdf(rawUrl: string, opts: DownloadOptions = {}): Promise<DownloadedPdf> {
  const fetchFn = opts.fetchFn ?? fetch;
  const maxBytes = opts.maxBytes ?? PDF_MAX_BYTES;
  const timeoutMs = opts.timeoutMs ?? LIMITS.pdfTimeoutMs;
  let current: string;
  try {
    current = (await validateDocumentUrl(rawUrl, { lookupFn: opts.lookupFn })).url;
  } catch (err) {
    if (err instanceof SsrfError) throw new PdfDownloadError(err.message, 'ssrf');
    throw err;
  }
  let redirects = 0;
  for (;;) {
    let res: Response;
    try {
      res = await fetchFn(current, {
        headers: {
          'User-Agent': opts.userAgent ?? SOURCES.userAgent,
          Accept: 'application/pdf,*/*;q=0.8',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const msg = String(err);
      throw new PdfDownloadError(
        `descarga fallida (${current}): ${msg}`,
        msg.includes('timeout') || msg.includes('Timeout') ? 'timeout' : 'http',
      );
    }
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) throw new PdfDownloadError(`redirección sin Location (${current})`, 'http');
      if (++redirects > PDF_MAX_REDIRECTS) {
        throw new PdfDownloadError(`demasiadas redirecciones (>${PDF_MAX_REDIRECTS})`, 'http');
      }
      const next = new URL(location, current).toString();
      try {
        current = (await validateDocumentUrl(next, { lookupFn: opts.lookupFn })).url;
      } catch (err) {
        if (err instanceof SsrfError) throw new PdfDownloadError(err.message, 'ssrf');
        throw err;
      }
      continue;
    }
    if (!res.ok) {
      throw new PdfDownloadError(`HTTP ${res.status} en ${current}`, res.status === 403 ? 'waf' : 'http');
    }
    const contentType = res.headers.get('content-type');
    const length = res.headers.get('content-length');
    if (length && Number(length) > maxBytes) {
      throw new PdfDownloadError(`PDF de ${length} bytes supera el máximo de ${maxBytes}`, 'demasiado-grande');
    }
    // Leer con límite: abortar en cuanto se supere maxBytes.
    const reader = res.body?.getReader();
    if (!reader) throw new PdfDownloadError('respuesta sin cuerpo', 'http');
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new PdfDownloadError(`PDF supera el máximo de ${maxBytes} bytes`, 'demasiado-grande');
      }
      chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    if (contentType && !contentType.toLowerCase().includes('application/pdf')) {
      throw new PdfDownloadError(
        `MIME inesperado (${contentType}); posible rechazo del WAF, no es un PDF`,
        contentType.toLowerCase().includes('text/html') ? 'waf' : 'mime',
      );
    }
    if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new PdfDownloadError('firma %PDF ausente: el contenido no es un PDF', 'firma');
    }
    return {
      bytes,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      sizeBytes: bytes.byteLength,
      contentType,
      finalUrl: current,
      redirects,
    };
  }
}

export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

// ---------------------------------------------------------------------------
// Extracción de texto con pdfjs-dist
// ---------------------------------------------------------------------------

export interface PdfPageText {
  page: number; // numeración original del PDF (1-based)
  text: string;
}

export interface PdfTextResult {
  pages: PdfPageText[];
  numPages: number;
  /** true si no se pudo extraer texto de ninguna página (escaneado). */
  sinTexto: boolean;
  truncated: boolean; // true si se alcanzó el límite de páginas
}

/**
 * Extrae el texto por página. `maxPages` = 200 por defecto (config LIMITS).
 * El PDF se trata como DATO: su contenido nunca se interpreta como
 * instrucciones (ver jobs/extract.ts y el test de prompt injection).
 */
export async function extractPdfText(
  bytes: Buffer,
  opts: { maxPages?: number } = {},
): Promise<PdfTextResult> {
  const maxPages = opts.maxPages ?? LIMITS.pdfMaxPages;
  // Import dinámico: pdfjs-dist es pesado y solo se necesita en el worker.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    verbosity: 0,
  });
  const doc = await loadingTask.promise;
  const totalPages = doc.numPages;
  const pages: PdfPageText[] = [];
  const limit = Math.min(totalPages, maxPages);
  for (let n = 1; n <= limit; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ('str' in item ? String(item.str) : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    pages.push({ page: n, text });
  }
  await doc.destroy();
  const sinTexto = pages.every((p) => p.text.length === 0);
  return { pages, numPages: totalPages, sinTexto, truncated: totalPages > maxPages };
}
