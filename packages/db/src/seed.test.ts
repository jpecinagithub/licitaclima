// Tests del seed (Fase C): transformación de los 913 expedientes reales.
// No tocan la BD: la siembra real contra PostgreSQL se verifica en vivo
// (docs/fase-c.md) y con el test de integración de pg-store.
import { describe, expect, it } from 'vitest';
import { expedienteSeed, loadNicheRows, pipelineInicialSeed } from './seed.js';
import { resolverProvincia } from '@licitaclima/integrations';

describe('seed: datos reales del pull de 30 días', () => {
  it('carga los 913 expedientes de nicho', () => {
    const rows = loadNicheRows();
    expect(rows).toHaveLength(913);
  });

  it('distribución por clase_final: núcleo 709, limítrofe 42, marginal 162', () => {
    const rows = loadNicheRows();
    const porClase = new Map<string, number>();
    for (const r of rows) porClase.set(r.clase_final, (porClase.get(r.clase_final) ?? 0) + 1);
    expect(porClase.get('núcleo')).toBe(709);
    expect(porClase.get('limítrofe')).toBe(42);
    expect(porClase.get('marginal')).toBe(162);
  });

  it('aperturas PUB de núcleo: 147 (el umbral de Fase A)', () => {
    const rows = loadNicheRows();
    const aperturasNucleo = rows.filter((r) => r.status_final === 'PUB' && r.clase_final === 'núcleo');
    expect(aperturasNucleo).toHaveLength(147);
    const aperturas = rows.filter((r) => r.status_final === 'PUB');
    expect(aperturas).toHaveLength(196);
  });

  it('caso Paradores 2026-0666: el seed resuelve Salamanca (no Madrid)', () => {
    const rows = loadNicheRows();
    const parador = rows.find((r) => r.expediente === '2026-0666');
    expect(parador).toBeDefined();
    expect(parador?.nuts).toBe('ES300');
    const resuelta = resolverProvincia({ titulo: parador!.title, nuts: parador!.nuts, nombreFeed: parador!.prov });
    expect(resuelta.provincia).toBe('Salamanca');
    expect(resuelta.provinciaPorVerificar).toBe(true);
  });

  it('toda fila trae procedencia: expediente, órgano, título, estado y URL oficial', () => {
    const rows = loadNicheRows();
    for (const r of rows) {
      expect(expedienteSeed(r)).toBeTruthy();
      expect(r.org).toBeTruthy();
      expect(r.title).toBeTruthy();
      expect(r.status_final).toMatch(/^(PRE|PUB|EV|ADJ|RES|ANUL)$/);
      expect(r.link).toMatch(/^https:\/\//);
    }
  });

  it('1 fila sin expediente en el feed (Navarra PRE): identificador derivado trazable', () => {
    const rows = loadNicheRows();
    const sinExpediente = rows.filter((r) => !r.expediente);
    expect(sinExpediente).toHaveLength(1);
    expect(sinExpediente[0].org).toMatch(/NAVARRA|INFRAESTRUCTURAS/i);
    const derivado = expedienteSeed(sinExpediente[0]);
    expect(derivado).toMatch(/^SIN-EXPEDIENTE-[0-9a-f]{12}$/);
    // Determinista: el mismo enlace da el mismo identificador.
    expect(expedienteSeed(sinExpediente[0])).toBe(derivado);
  });

  it('pipelineInicialSeed: marginal → revision_requerida; no-PUB → validado; PUB núcleo → descubierto', () => {
    expect(pipelineInicialSeed('marginal', 'PUB')).toBe('revision_requerida');
    expect(pipelineInicialSeed('nucleo', 'RES')).toBe('validado');
    expect(pipelineInicialSeed('nucleo', 'PUB')).toBe('descubierto');
    expect(pipelineInicialSeed('limitrofe', 'PUB')).toBe('descubierto');
  });
});
