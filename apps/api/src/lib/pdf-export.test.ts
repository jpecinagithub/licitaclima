// Tests unitarios de la exportación PDF del análisis (sin BD).
import { describe, expect, it } from 'vitest';
import { buildAnalysisPdf } from './pdf-export.js';

/**
 * pdfkit 0.20 escribe el texto de los flujos de contenido como cadenas
 * hexadecimales (WinAnsi), no como texto literal: para verificar el contenido
 * hay que decodificarlas. Las cadenas del diccionario Info van en UTF-16BE
 * (con BOM), así que se ignoran las que empiezan por FEFF.
 */
export function extractPdfText(input: string | Buffer): string {
  const s = typeof input === 'string' ? input : input.toString('latin1');
  const out: string[] = [];
  for (const m of s.matchAll(/<([0-9A-Fa-f\s]+)>/g)) {
    const hex = m[1]!.replace(/\s+/g, '');
    if (hex.length === 0 || hex.length % 2 !== 0) continue;
    if (hex.toUpperCase().startsWith('FEFF')) continue;
    out.push(Buffer.from(hex, 'hex').toString('latin1'));
  }
  return out.join('');
}

describe('buildAnalysisPdf', () => {
  it('genera un PDF válido con la marca de extracción determinista y las evidencias', async () => {
    const pdf = await buildAnalysisPdf({
      expediente: '9124/2026',
      organo: 'Ayuntamiento de Test',
      objeto: 'Mantenimiento e instalación de climatización',
      estado: 'PUB',
      provincia: 'Asturias',
      urlOficial: 'https://example.es/licitacion',
      plazo: '2026-12-03',
      importes: {
        valorEstimadoEur: 100000,
        presupuestoBaseSinIvaEur: 90000,
        presupuestoBaseConIvaEur: 108900,
      },
      recomendacion: 'revisar',
      provider: 'determinista-v1 (sin LLM)',
      requisitos: [
        {
          descripcion: 'Solvencia técnica o profesional exigida',
          veredicto: 'compatible',
          obligatorio: true,
          evidencia: {
            documento: 'pliego.pdf',
            pagina: 2,
            fragmento: 'solvencia técnica: experiencia en climatización',
          },
          datoPerfilUsado: 'certificacionesDeclaradas: ISO 9001',
          nota: null,
        },
        {
          descripcion: 'Garantía provisional o definitiva',
          veredicto: 'desconocido',
          obligatorio: true,
          evidencia: null,
          datoPerfilUsado: null,
          nota: 'no consta en los pliegos descargados',
        },
      ],
    });
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
    const texto = extractPdfText(pdf);
    expect(texto).toContain('9124/2026');
    expect(texto).toContain('Extracción determinista v1 (sin LLM)');
    expect(texto).toContain('Solvencia técnica');
  });

  it('sin requisitos genera igualmente un PDF válido', async () => {
    const pdf = await buildAnalysisPdf({
      expediente: 'X/1',
      organo: 'Org',
      objeto: 'Objeto',
      estado: 'PUB',
      provincia: null,
      urlOficial: 'https://example.es',
      plazo: null,
      importes: { valorEstimadoEur: null, presupuestoBaseSinIvaEur: null, presupuestoBaseConIvaEur: null },
      recomendacion: null,
      provider: 'determinista-v1 (sin LLM)',
      requisitos: [],
    });
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(extractPdfText(pdf)).toContain('No consta');
  });
});
