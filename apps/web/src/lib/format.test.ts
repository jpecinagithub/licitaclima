import { describe, expect, it } from 'vitest';
import { diasHastaPlazo, formatEur, formatFecha, formatInstante } from './format.js';

describe('format', () => {
  it('formatEur devuelve N/D sin dato y euros con dato', () => {
    expect(formatEur(null)).toBe('N/D');
    expect(formatEur(undefined)).toBe('N/D');
    expect(formatEur(49)).toMatch(/49/);
    expect(formatEur(42884.99)).toMatch(/42\.884,99/);
  });

  it('formatFecha no inventa hora y devuelve N/D sin fecha', () => {
    expect(formatFecha(null)).toBe('N/D');
    expect(formatFecha('2026-11-24')).toMatch(/2026/);
    expect(formatFecha('2026-11-24')).toMatch(/nov/);
  });

  it('formatInstante formatea un instante UTC en Europe/Madrid', () => {
    expect(formatInstante(null)).toBe('N/D');
    expect(formatInstante('2026-11-13T17:26:16+01:00')).toMatch(/2026/);
  });

  it('diasHastaPlazo devuelve null sin plazo', () => {
    expect(diasHastaPlazo(null)).toBeNull();
    expect(diasHastaPlazo(undefined)).toBeNull();
  });
});
