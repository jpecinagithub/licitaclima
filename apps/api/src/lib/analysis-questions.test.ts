// Tests unitarios de la respuesta determinista a preguntas (sin LLM, sin BD).
import { describe, expect, it } from 'vitest';
import {
  SIN_EVIDENCIA_TEXTO,
  answerDeterministically,
  terminosPregunta,
} from '../lib/analysis-questions.js';

const PAGINAS = [
  {
    documento: 'pliego.pdf',
    pagina: 2,
    texto:
      'La solvencia técnica exige acreditar experiencia en climatización: haber ejecutado al menos tres instalaciones de aire acondicionado en los últimos cinco años, con certificados de buena ejecución.',
  },
  {
    documento: 'pliego.pdf',
    pagina: 5,
    texto:
      'La garantía definitiva será del 5 por ciento del precio de adjudicación, sin IVA, y deberá constituirse antes de la formalización del contrato.',
  },
  {
    documento: 'anexo.pdf',
    pagina: 1,
    texto: 'El plazo de presentación de ofertas termina el 3 de diciembre de 2026 a las 14:00 horas.',
  },
];

describe('answerDeterministically (sin LLM)', () => {
  it('responde con citas cuando hay evidencia en los fragmentos', () => {
    const r = answerDeterministically('¿Qué solvencia técnica se exige?', PAGINAS);
    expect(r.sinEvidencia).toBe(false);
    expect(r.citas.length).toBeGreaterThan(0);
    expect(r.citas[0]?.documento).toBe('pliego.pdf');
    expect(r.citas[0]?.pagina).toBe(2);
    expect(r.citas[0]?.fragmento).toContain('solvencia técnica');
    expect(r.texto).toContain('pliego.pdf');
  });

  it('responde "Sin evidencia en los documentos" cuando no hay coincidencia', () => {
    const r = answerDeterministically('¿Cuál es la política de dividendos de la empresa?', PAGINAS);
    expect(r.sinEvidencia).toBe(true);
    expect(r.citas).toEqual([]);
    expect(r.texto).toBe(SIN_EVIDENCIA_TEXTO);
  });

  it('sin páginas extraídas no inventa respuesta', () => {
    const r = answerDeterministically('¿Qué garantía se exige?', []);
    expect(r.sinEvidencia).toBe(true);
    expect(r.texto).toBe(SIN_EVIDENCIA_TEXTO);
  });

  it('los saludos usan una respuesta general acotada, sin citas ni afirmaciones del pliego', () => {
    const r = answerDeterministically('Hola, ¿qué puedes hacer?', PAGINAS);
    expect(r.sinEvidencia).toBe(false);
    expect(r.citas).toEqual([]);
    expect(r.texto).toContain('documentos de este expediente');
  });

  it('las stopwords no cuentan como términos de búsqueda', () => {
    expect(terminosPregunta('¿Qué dice el pliego sobre la garantía?')).toEqual(['garantia']);
    expect(terminosPregunta('¿Qué?')).toEqual([]);
  });

  it('cita hasta 3 páginas, ordenadas por número de términos encontrados', () => {
    const r = answerDeterministically('garantía definitiva precio adjudicación', PAGINAS);
    expect(r.sinEvidencia).toBe(false);
    expect(r.citas.length).toBeLessThanOrEqual(3);
    expect(r.citas[0]?.pagina).toBe(5);
  });
});
