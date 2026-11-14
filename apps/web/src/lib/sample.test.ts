import { describe, expect, it } from 'vitest';
import { PLAN } from '@licitaclima/config';
import {
  APERTURAS_POR_PROVINCIA,
  COVERAGE,
  SAMPLE_OPPORTUNITIES,
} from './sample.js';

describe('plan (config versionada, única fuente)', () => {
  it('el plan único es 49 €/mes + impuestos con los límites del prompt maestro §1', () => {
    expect(PLAN.priceEurExclTax).toBe(49);
    expect(PLAN.currency).toBe('EUR');
    expect(PLAN.maxUsers).toBe(1);
    expect(PLAN.maxCompanyProfiles).toBe(1);
    expect(PLAN.maxProvinces).toBe(3);
    expect(PLAN.maxPersonalizedAnalysesPerPeriod).toBe(10);
    expect(PLAN.maxChatQuestionsPerPeriod).toBe(100);
    expect(PLAN.digest).toBe('weekly'); // resumen SEMANAL, nunca diario
  });
});

describe('muestra pública (datos REALES del pull de 30 días)', () => {
  it('todas las oportunidades de muestra son PUB de clase núcleo', () => {
    expect(SAMPLE_OPPORTUNITIES.length).toBeGreaterThanOrEqual(5);
    for (const o of SAMPLE_OPPORTUNITIES) {
      expect(o.estado).toBe('PUB');
      expect(o.clase).toBe('núcleo');
      expect(o.urlOficial).toMatch(/^https:\/\//);
      expect(o.expediente).toBeTruthy();
      expect(o.titulo).toBeTruthy();
    }
  });

  it('el expediente destacado de Badajoz conserva sus valores reales', () => {
    const badajoz = SAMPLE_OPPORTUNITIES.find((o) => o.expediente === 'PSS/2026/0000130740');
    expect(badajoz).toBeDefined();
    expect(badajoz?.provincia).toBe('Badajoz');
    expect(badajoz?.plazo).toBe('2026-11-24');
    expect(badajoz?.valorEstimadoEur).toBe(42884.99);
    expect(badajoz?.presupuestoBaseSinIvaEur).toBe(35737.49);
    expect(badajoz?.presupuestoBaseConIvaEur).toBe(43242.36);
    expect(badajoz?.cpv).toEqual(['50720000', '50730000']);
    expect(badajoz?.nDocumentos).toBe(5);
  });

  it('la cobertura reproduce las cifras del pull de 30 días', () => {
    expect(COVERAGE.aperturasNucleo).toBe(147);
    expect(COVERAGE.aperturasNucleoAmplio).toBe(156);
    expect(COVERAGE.aperturasPub).toBe(196);
    expect(COVERAGE.nichoUnico).toBe(913);
    expect(COVERAGE.expedientesUnicos).toBe(57648);
    const sumaProvincias = APERTURAS_POR_PROVINCIA.reduce((a, r) => a + r.aperturas, 0);
    expect(sumaProvincias).toBe(156);
    expect(APERTURAS_POR_PROVINCIA.find((r) => r.provincia === 'Madrid')?.aperturas).toBe(21);
  });
});
