// LicitaClima — job de descarga de pliegos PDF (Fase C).
//
// Solo PCAP + PPT al inicio (el resto de documentos generales no se descarga
// en el MVP). Deduplicación por hash SHA-256: un mismo documento se descarga
// y se extrae una sola vez aunque lo enlacen varios expedientes.
// Destino: volumen privado (DOCUMENTS_DIR, por defecto ./data/documents);
// en tests, almacenamiento en memoria. Los bytes NUNCA van a la BD.
// Estados: sin texto extraíble → requiere_OCR; WAF/bloqueo →
// fuente_no_disponible (reintentable); dominio fuera de la allowlist →
// revision_requerida (requiere revisión humana, no se reintenta a ciegas).

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { downloadPdf, extractPdfText, PdfDownloadError } from '@licitaclima/integrations';
import type { WorkerStore } from '../db.js';

export interface DocumentStorage {
  save(sha256: string, bytes: Buffer): Promise<void>;
  load(sha256: string): Promise<Buffer | null>;
  has(sha256: string): Promise<boolean>;
}

export class DiskDocumentStorage implements DocumentStorage {
  constructor(private readonly dir: string) {}

  async save(sha256: string, bytes: Buffer): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, `${sha256}.pdf`), bytes);
  }

  async load(sha256: string): Promise<Buffer | null> {
    try {
      return await readFile(join(this.dir, `${sha256}.pdf`));
    } catch {
      return null;
    }
  }

  async has(sha256: string): Promise<boolean> {
    return (await this.load(sha256)) !== null;
  }
}

export class MemoryDocumentStorage implements DocumentStorage {
  private readonly files = new Map<string, Buffer>();

  async save(sha256: string, bytes: Buffer): Promise<void> {
    this.files.set(sha256, bytes);
  }

  async load(sha256: string): Promise<Buffer | null> {
    return this.files.get(sha256) ?? null;
  }

  async has(sha256: string): Promise<boolean> {
    return this.files.has(sha256);
  }
}

export function createDocumentStorage(): DocumentStorage {
  const dir = process.env.DOCUMENTS_DIR ?? './data/documents';
  return new DiskDocumentStorage(dir);
}

export interface DocumentsResult {
  tenderId: string;
  downloaded: number;
  reusedByHash: number;
  scanned: boolean;
  nextPipeline: string;
}

/**
 * Descarga PCAP+PPT de un expediente. `downloadFn`/`extractFn` son
 * inyectables para tests (evitan red y pdfjs reales).
 */
export async function runDocuments(
  store: WorkerStore,
  storage: DocumentStorage,
  opts: {
    tenderId: string;
    downloadFn?: typeof downloadPdf;
    extractFn?: typeof extractPdfText;
  },
): Promise<DocumentsResult> {
  const downloadFn = opts.downloadFn ?? downloadPdf;
  const extractFn = opts.extractFn ?? extractPdfText;
  const tender = await store.getTender(opts.tenderId);
  if (!tender) throw new Error(`expediente desconocido: ${opts.tenderId}`);

  const pliegos = tender.documentUris.filter((d) => d.kind === 'pcap' || d.kind === 'ppt');
  if (pliegos.length === 0) {
    await store.setPipeline(tender.id, 'sin_documentos');
    return { tenderId: tender.id, downloaded: 0, reusedByHash: 0, scanned: false, nextPipeline: 'sin_documentos' };
  }

  let downloaded = 0;
  let reusedByHash = 0;
  let scanned = false;
  for (const ref of pliegos) {
    try {
      const pdf = await downloadFn(ref.uri);
      const existing = await store.findDocumentByHash(pdf.sha256);
      if (existing && (await storage.has(pdf.sha256))) {
        reusedByHash += 1;
      } else {
        await storage.save(pdf.sha256, pdf.bytes);
        downloaded += 1;
      }
      const doc = await store.insertDocument({
        tenderId: tender.id,
        kind: ref.kind,
        url: ref.uri,
        sha256: pdf.sha256,
        sizeBytes: pdf.sizeBytes,
        pages: null,
        status: 'descargado',
      });
      void doc;
      const text = await extractFn(pdf.bytes);
      if (text.sinTexto) scanned = true;
    } catch (err) {
      if (err instanceof PdfDownloadError && err.kind === 'ssrf') {
        // Dominio fuera de la allowlist o IP privada: revisión humana, no reintento.
        await store.setPipeline(tender.id, 'revision_requerida');
        return { tenderId: tender.id, downloaded, reusedByHash, scanned, nextPipeline: 'revision_requerida' };
      }
      // WAF / HTTP / timeout / PDF corrupto: fuente no disponible (reintentable).
      await store.setPipeline(tender.id, 'fuente_no_disponible');
      throw err;
    }
  }

  if (scanned) {
    await store.setPipeline(tender.id, 'requiere_OCR');
    return { tenderId: tender.id, downloaded, reusedByHash, scanned, nextPipeline: 'requiere_OCR' };
  }
  await store.setPipeline(tender.id, 'extraido');
  await store.enqueueJob('extract', { tenderId: tender.id });
  return { tenderId: tender.id, downloaded, reusedByHash, scanned, nextPipeline: 'extraido' };
}
