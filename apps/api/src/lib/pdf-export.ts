// LicitaClima — exportación PDF de un análisis (block/api-lectura).
//
// pdfkit (fuentes estándar Helvetica, sin dependencias de sistema). El PDF
// incluye objeto, organismo, expediente, importes diferenciados, requisitos
// con documento/página/fragmento, y marca claramente en cabecera y pie:
// «Extracción determinista v1 (sin LLM)». Nada de lo que aquí aparece es
// asesoramiento jurídico ni garantía de aptitud.

import PDFDocument from 'pdfkit';

export interface PdfRequisito {
  descripcion: string;
  veredicto: string;
  obligatorio: boolean;
  evidencia: { documento: string; pagina: number | null; fragmento: string } | null;
  datoPerfilUsado: string | null;
  nota: string | null;
}

export interface AnalysisPdfInput {
  expediente: string;
  organo: string;
  objeto: string;
  estado: string;
  provincia: string | null;
  urlOficial: string;
  plazo: string | null;
  importes: {
    valorEstimadoEur: number | null;
    presupuestoBaseSinIvaEur: number | null;
    presupuestoBaseConIvaEur: number | null;
  };
  recomendacion: string | null;
  provider: string | null;
  requisitos: PdfRequisito[];
}

const MARCA = 'Extracción determinista v1 (sin LLM)';

/**
 * Las fuentes estándar de PDF (WinAnsi) no cubren todo Unicode: se conservan
 * los caracteres habituales en español y se elimina el resto, en vez de
 * dejar que pdfkit lo sustituya de forma silenciosa.
 */
export function sanitizePdfText(texto: string): string {
  return texto
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\u0020-\u007E\u00A0-\u00FF\u20AC\u2013\u2014\u201A\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u0152\u0153\u0160\u0161\u0178\u017D\u017E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

function importe(valor: number | null): string {
  return valor === null ? 'No consta' : eur.format(valor);
}

/** Genera el PDF completo en memoria (Buffer). */
export function buildAnalysisPdf(input: AnalysisPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 56, bottom: 56, left: 56, right: 56 },
      // Sin comprimir los flujos de contenido: el texto queda legible y
      // verificable directamente en el PDF (también facilita copiarlo).
      compress: false,
      info: {
        Title: `Análisis — ${input.expediente}`,
        Author: 'LicitaClima',
        Subject: 'Análisis de licitación con evidencias (extracción determinista v1, sin LLM)',
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const s = sanitizePdfText;
    const ancho = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    const titulo = (texto: string, size = 13) => {
      doc.moveDown(0.6).font('Helvetica-Bold').fontSize(size).fillColor('#111111').text(s(texto), { width: ancho });
      doc.moveDown(0.2);
    };
    const parrafo = (texto: string, size = 10) => {
      doc.font('Helvetica').fontSize(size).fillColor('#222222').text(s(texto), { width: ancho });
    };
    const linea = (etiqueta: string, valor: string) => {
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#111111')
        .text(`${s(etiqueta)}: `, { continued: true })
        .font('Helvetica')
        .fillColor('#222222')
        .text(s(valor));
    };

    // Cabecera.
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#111111').text('Análisis de licitación', { width: ancho });
    doc.font('Helvetica').fontSize(10).fillColor('#555555').text('LicitaClima — resumen con evidencias del pliego', { width: ancho });
    doc.moveDown(0.4);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#7a3b00').text(s(MARCA), { width: ancho });
    parrafo('Este análisis se ha generado por extracción determinista de los pliegos descargados, sin modelo de lenguaje. Cada requisito indica su evidencia o su ausencia; lo que no consta no se da por cumplido.');
    doc.moveDown(0.4);

    titulo('Expediente');
    linea('Objeto', input.objeto);
    linea('Organismo', input.organo);
    linea('Expediente', input.expediente);
    linea('Estado', input.estado);
    linea('Provincia', input.provincia ?? 'No consta');
    linea('Plazo', input.plazo ?? 'No consta');
    linea('Anuncio oficial', input.urlOficial);

    titulo('Importes (EUR, diferenciados)');
    linea('Valor estimado', importe(input.importes.valorEstimadoEur));
    linea('Presupuesto base sin IVA', importe(input.importes.presupuestoBaseSinIvaEur));
    linea('Presupuesto base con IVA', importe(input.importes.presupuestoBaseConIvaEur));

    titulo('Encaje con tu perfil');
    parrafo(
      input.recomendacion
        ? `Recomendación: ${input.recomendacion}. El encaje es un recuento explicable de requisitos, no una probabilidad de ganar ni una certificación de aptitud.`
        : 'Encaje pendiente de cálculo.',
    );
    if (input.provider) parrafo(`Proveedor del análisis: ${input.provider}.`);

    titulo('Requisitos');
    if (input.requisitos.length === 0) {
      parrafo('Sin requisitos extraídos de los documentos.');
    }
    for (const req of input.requisitos) {
      doc.moveDown(0.4);
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#111111')
        .text(s(`${req.obligatorio ? '[Obligatorio] ' : ''}${req.descripcion}`), { width: ancho });
      doc.font('Helvetica').fontSize(10).fillColor('#222222').text(s(`Veredicto: ${req.veredicto}`), { width: ancho });
      if (req.evidencia) {
        doc
          .font('Helvetica')
          .fontSize(9)
          .fillColor('#333333')
          .text(
            s(
              `Evidencia: ${req.evidencia.documento}${req.evidencia.pagina !== null ? `, pág. ${req.evidencia.pagina}` : ''} — «${req.evidencia.fragmento}»`,
            ),
            { width: ancho },
          );
      } else {
        doc.font('Helvetica-Oblique').fontSize(9).fillColor('#555555').text(s('Sin evidencia en los documentos.'), { width: ancho });
        if (req.nota) parrafo(`Motivo: ${req.nota}`, 9);
      }
      if (req.datoPerfilUsado) parrafo(`Dato de perfil usado: ${req.datoPerfilUsado}`, 9);
    }

    // Pie en cada página (con el documento ya completo).
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#777777')
        .text(s(`${MARCA} — LicitaClima. No es asesoramiento jurídico. — Pág. ${i + 1}/${range.count}`), doc.page.margins.left, doc.page.height - 40, {
          width: ancho,
          align: 'center',
        });
    }
    doc.end();
  });
}
