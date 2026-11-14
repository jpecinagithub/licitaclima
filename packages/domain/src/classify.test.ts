// Tests de clasificación del nicho estricto (Fase C, regla de Fase A).
import { describe, expect, it } from 'vitest';
import { clasificarNicho, esPublicable, preclasificar } from './classify.js';

describe('clasificarNicho (palabra clave O CPV)', () => {
  it('detecta por palabra clave', () => {
    const r = clasificarNicho('Mantenimiento de las instalaciones de climatización del hospital', []);
    expect(r.esNicho).toBe(true);
    expect(r.palabrasClave).toContain('climatizacion');
    expect(r.clase).toBe('nucleo');
  });

  it('detecta solo por CPV (45 % del nicho en Fase A)', () => {
    const r = clasificarNicho('Mantenimiento integral IMDEA', ['45331000-6']);
    expect(r.esNicho).toBe(true);
    expect(r.soloCpv).toBe(true);
  });

  it('fuera del nicho: ni palabra ni CPV', () => {
    const r = clasificarNicho('Suministro de material de oficina', ['30192000-1']);
    expect(r.esNicho).toBe(false);
  });

  it('CPV con 8 dígitos: 42512000, 42500000, 50730000, 50720000', () => {
    for (const cpv of ['42512000-8', '42500000-1', '50730000-1', '50720000-8']) {
      expect(clasificarNicho('Servicio genérico', [cpv]).esNicho).toBe(true);
    }
  });
});

describe('preclasificar (Fase A §6.4)', () => {
  it('marginal: gasóleo / combustible (por palabra o por CPV 09134xxx)', () => {
    expect(preclasificar('Suministro de gasóleo tipo B para calefacción', []).clase).toBe('marginal');
    expect(preclasificar('Suministro de combustible para calefacción', []).clase).toBe('marginal');
    expect(preclasificar('Suministro de energía', ['09134100-7']).clase).toBe('marginal');
    // OJO: el gas natural NO lo caza la regla de Fase A (queda para revisión
    // manual: 4 casos en el pull de 30 días, volume-30d.md §1.2).
    expect(preclasificar('Suministro de gas natural para calefacción', []).clase).toBe('nucleo');
  });

  it('marginal: biomasa', () => {
    expect(preclasificar('Mantenimiento de instalaciones de biomasa en colegios', []).clase).toBe('marginal');
  });

  it('marginal: mantenimiento integral genérico sin "climatización" en el título', () => {
    expect(preclasificar('Mantenimiento integral de edificios municipales', []).clase).toBe('marginal');
    // …pero si el objeto SON las instalaciones térmicas, es núcleo
    expect(
      preclasificar('Mantenimiento integral de las instalaciones térmicas del ayuntamiento', []).clase,
    ).toBe('marginal'); // la regla no distingue: queda para revisión manual (caso Amorebieta)
  });

  it('limítrofe: eficiencia energética y frío industrial', () => {
    expect(preclasificar('Obras de mejora de eficiencia energética en edificios', []).clase).toBe('limitrofe');
    expect(preclasificar('Instalación de cámara frigorífica en cocina', []).clase).toBe('limitrofe');
    // Nota: 'cámaras frigoríficas' en plural NO lo caza la regla (igual que el
    // original Python): Paradores Granada (2026-0667) quedó en núcleo en el
    // pull de 30 días. La revisión manual corrige estos casos.
    expect(preclasificar('Sustitución de equipos de refrigeración de las cámaras frigoríficas', []).clase).toBe('nucleo');
  });

  it('núcleo: climatización clara', () => {
    expect(preclasificar('Instalación de climatización en centros cívicos', []).clase).toBe('nucleo');
  });
});

describe('esPublicable', () => {
  it('solo núcleo y limítrofe; marginal va a revisión', () => {
    expect(esPublicable('nucleo')).toBe(true);
    expect(esPublicable('limitrofe')).toBe(true);
    expect(esPublicable('marginal')).toBe(false);
  });
});
