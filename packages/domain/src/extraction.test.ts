// Tests del esquema Zod de extracción determinista (Fase C).
import { describe, expect, it } from 'vitest';
import { ExtractionSchema, MatchMatrixSchema } from './extraction.js';

const HASH = 'a'.repeat(64);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extraccionValida(): any {
  // `any` intencionado: los tests mutan el objeto a valores inválidos a propósito.
  return {
    version: 'determinista-v1',
    metodo: 'determinista-v1 (sin LLM)',
    tenderId: 't-1',
    expediente: '2026-0666',
    objeto: 'Obras para la climatización de la cocina del Parador de Salamanca',
    organismo: 'Paradores de Turismo de España, S.M.E., S.A.',
    estado: 'PUB',
    importes: { valorEstimado: '115500', presupuestoBaseSinIva: '105000', presupuestoBaseConIva: '127050' },
    duracion: null,
    localizacion: 'Salamanca',
    plazo: { fecha: '2026-12-03', hora: '14:00:00', plazoSoloFecha: false },
    requisitos: [
      {
        id: 'solvencia-tecnica',
        categoria: 'solvencia_tecnica',
        descripcion: 'Solvencia técnica o profesional exigida',
        obligatorio: true,
        evidencia: { documentId: 'd-1', documentHash: HASH, page: 3, fragment: 'solvencia técnica: experiencia en obras similares' },
        motivoAusencia: null,
      },
      {
        id: 'garantia',
        categoria: 'garantia',
        descripcion: 'Garantía provisional o definitiva',
        obligatorio: true,
        evidencia: null,
        motivoAusencia: 'no consta en los pliegos descargados',
      },
    ],
    conflictos: [],
    instruccionesDetectadas: [],
    extraidoEn: new Date().toISOString(),
  };
}

describe('ExtractionSchema', () => {
  it('acepta una extracción válida con ausente = null + motivo', () => {
    const parsed = ExtractionSchema.parse(extraccionValida());
    expect(parsed.requisitos[1].evidencia).toBeNull();
    expect(parsed.requisitos[1].motivoAusencia).toBe('no consta en los pliegos descargados');
    expect(parsed.metodo).toBe('determinista-v1 (sin LLM)');
  });

  it('rechaza importes como número (siempre string decimal)', () => {
    const mala = extraccionValida();
    (mala.importes as unknown as Record<string, unknown>)['valorEstimado'] = 115500;
    expect(() => ExtractionSchema.parse(mala)).toThrow();
  });

  it('rechaza evidencia con hash que no es SHA-256', () => {
    const mala = extraccionValida();
    const evidencia = mala.requisitos[0].evidencia as unknown as { documentHash: string };
    evidencia.documentHash = 'abc';
    expect(() => ExtractionSchema.parse(mala)).toThrow();
  });

  it('rechaza evidencia con fragmento vacío', () => {
    const mala = extraccionValida();
    const evidencia = mala.requisitos[0].evidencia as unknown as { fragment: string };
    evidencia.fragment = '';
    expect(() => ExtractionSchema.parse(mala)).toThrow();
  });

  it('plazo solo con fecha: hora null + plazoSoloFecha=true (nunca hora inventada)', () => {
    const soloFecha = extraccionValida();
    soloFecha.plazo = { fecha: '2026-12-03', hora: null, plazoSoloFecha: true };
    expect(ExtractionSchema.parse(soloFecha).plazo.hora).toBeNull();
  });

  it('rechaza otro método (nunca presentar la extracción como análisis LLM)', () => {
    const mala = extraccionValida();
    (mala as unknown as Record<string, unknown>)['metodo'] = 'llm-gpt-4';
    expect(() => ExtractionSchema.parse(mala)).toThrow();
  });
});

describe('MatchMatrixSchema', () => {
  it('exige la advertencia de que el score no es probabilidad de ganar', () => {
    const matriz = {
      tenderId: 't-1',
      extractionVersion: 'determinista-v1',
      filas: [],
      bloqueadoPor: [],
      recomendacion: 'positiva',
      resumen: { compatibles: 0, incompatibles: 0, desconocidos: 0, noAplica: 0 },
      advertenciaScore: 'El score es un recuento explicable de encaje, NO una probabilidad de ganar.',
    };
    expect(MatchMatrixSchema.parse(matriz).recomendacion).toBe('positiva');
    const sinAdvertencia = { ...matriz, advertenciaScore: 'probabilidad de ganar: 90 %' };
    expect(() => MatchMatrixSchema.parse(sinAdvertencia)).toThrow();
  });
});
