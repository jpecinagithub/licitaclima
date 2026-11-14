// Tests de descarga y extracción de PDF (Fase C).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { downloadPdf, extractPdfText, sha256Hex } from './pdf.js';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'pliego-ejemplo.pdf');

/** PDF mínimo válido de 1 página en blanco (sin texto → escaneado). */
function pdfBlanco(): Buffer {
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefPos = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

function mockFetchPdf(body: Buffer, contentType = 'application/pdf'): typeof fetch {
  return (async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(body));
        controller.close();
      },
    });
    return new Response(stream, { status: 200, headers: { 'content-type': contentType } });
  }) as unknown as typeof fetch;
}

const lookupOk = async () => [{ address: '185.23.56.10' }];
const lookupPrivate = async () => [{ address: '10.0.0.5' }];

describe('downloadPdf', () => {
  const url = 'https://contrataciondelestado.es/FileSystem/servlet/GetDocumentByIdServlet?cifrado=AAA';

  it('descarga un PDF válido y calcula su SHA-256', async () => {
    const bytes = readFileSync(FIXTURE);
    const pdf = await downloadPdf(url, { fetchFn: mockFetchPdf(bytes), lookupFn: lookupOk });
    expect(pdf.sizeBytes).toBe(bytes.byteLength);
    expect(pdf.sha256).toBe(sha256Hex(bytes));
    expect(pdf.bytes.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('rechaza el HTML de rechazo del WAF (no es un PDF)', async () => {
    const html = Buffer.from('<html><body>Request Rejected. Your support ID is: 123</body></html>');
    await expect(
      downloadPdf(url, { fetchFn: mockFetchPdf(html, 'text/html'), lookupFn: lookupOk }),
    ).rejects.toThrow(/WAF|MIME|firma/);
  });

  it('bloquea la descarga si el DNS resuelve a IP privada', async () => {
    const bytes = readFileSync(FIXTURE);
    await expect(
      downloadPdf(url, { fetchFn: mockFetchPdf(bytes), lookupFn: lookupPrivate }),
    ).rejects.toThrow(/privada\/reservada/);
  });

  it('bloquea la redirección a un dominio fuera de la allowlist', async () => {
    const fetchFn = (async () =>
      new Response(null, { status: 302, headers: { location: 'https://example.com/malicioso.pdf' } })) as unknown as typeof fetch;
    await expect(downloadPdf(url, { fetchFn, lookupFn: lookupOk })).rejects.toThrow(/allowlist/);
  });

  it('bloquea PDF que supera 20 MB', async () => {
    const big = Buffer.alloc(21 * 1024 * 1024, 0);
    big.write('%PDF-', 0);
    await expect(
      downloadPdf(url, { fetchFn: mockFetchPdf(big), lookupFn: lookupOk, maxBytes: 20 * 1024 * 1024 }),
    ).rejects.toThrow(/supera el máximo/);
  });
});

describe('extractPdfText (pdfjs-dist)', () => {
  it('extrae texto del pliego real (Badajoz PSS/2026/0000130740)', async () => {
    const bytes = readFileSync(FIXTURE);
    const result = await extractPdfText(bytes);
    // pdfjs cuenta 52 páginas; `file` dice 10 (lee el /Count del árbol de
    // páginas, que no refleja las 52 páginas reales del documento).
    expect(result.numPages).toBe(52);
    expect(result.sinTexto).toBe(false);
    expect(result.pages).toHaveLength(52);
    expect(result.pages[0].page).toBe(1);
    const todo = result.pages.map((p) => p.text).join(' ');
    expect(todo.toLowerCase()).toContain('climatizaci');
    // 52 páginas reales con pdfjs: ~1,5 s solo, pero >5 s con la suite en
    // paralelo en VM de CPU compartida (timeout de vitest: 5 s por defecto).
  }, 30_000);

  it('PDF en blanco sin texto → sinTexto=true (requiere_OCR)', async () => {
    const result = await extractPdfText(pdfBlanco());
    expect(result.numPages).toBe(1);
    expect(result.sinTexto).toBe(true);
  });

  it('respeta el límite de páginas', async () => {
    const bytes = readFileSync(FIXTURE);
    const result = await extractPdfText(bytes, { maxPages: 2 });
    expect(result.pages).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });
});
