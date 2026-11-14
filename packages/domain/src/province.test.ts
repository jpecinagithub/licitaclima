// Tests de corrección de provincia (Fase C).
import { describe, expect, it } from 'vitest';
import { provinciaDesdeNuts, provinciaEnTexto, resolverProvincia } from './province.js';

describe('provinciaDesdeNuts (NUTS-2021)', () => {
  it('resuelve NUTS3 a provincia', () => {
    expect(provinciaDesdeNuts('ES300')).toBe('Madrid');
    expect(provinciaDesdeNuts('ES111')).toBe('A Coruña');
    expect(provinciaDesdeNuts('ES514')).toBe('Tarragona');
    expect(provinciaDesdeNuts('ES703')).toBe('Las Palmas');
    expect(provinciaDesdeNuts('ES709')).toBe('Santa Cruz de Tenerife');
    expect(provinciaDesdeNuts('ES531')).toBe('Illes Balears');
    expect(provinciaDesdeNuts('ES630')).toBe('Ceuta');
  });

  it('resuelve NUTS2 uniprovinciales', () => {
    expect(provinciaDesdeNuts('ES53')).toBe('Illes Balears');
    expect(provinciaDesdeNuts('ES13')).toBe('Cantabria');
    expect(provinciaDesdeNuts('ES23')).toBe('La Rioja');
    expect(provinciaDesdeNuts('ES62')).toBe('Murcia');
  });

  it('NO resuelve NUTS2 pluriprovinciales ni códigos genéricos (nunca inventar)', () => {
    for (const nuts of ['ES', 'ESZZZ', 'ES51', 'ES61', 'ES70', 'ES11', 'ES41', 'ES52']) {
      expect(provinciaDesdeNuts(nuts)).toBeNull();
    }
  });
});

describe('resolverProvincia (título > NUTS > órgano)', () => {
  it('caso Paradores: el título corrige la sede (Madrid) por la ejecución (Salamanca)', () => {
    const r = resolverProvincia({
      titulo: 'Obras para la climatización de la cocina del Parador de Turismo de Salamanca',
      nuts: 'ES300',
      nombreFeed: 'Madrid',
    });
    expect(r.provincia).toBe('Salamanca');
    expect(r.provinciaPorVerificar).toBe(true);
    expect(r.fuente).toBe('titulo');
    expect(r.conflicto).toMatch(/Salamanca/);
  });

  it('caso Paradores Granada: igual con Granada', () => {
    const r = resolverProvincia({
      titulo: 'Trabajos de sustitución de los equipos de refrigeración del Parador de Turismo de Granada',
      nuts: 'ES300',
    });
    expect(r.provincia).toBe('Granada');
    expect(r.provinciaPorVerificar).toBe(true);
  });

  it('sin contradicción: NUTS manda cuando el título no nombra provincia', () => {
    const r = resolverProvincia({
      titulo: 'Mantenimiento de las instalaciones de climatización del hospital',
      nuts: 'ES418',
    });
    expect(r.provincia).toBe('Valladolid');
    expect(r.provinciaPorVerificar).toBe(false);
    expect(r.fuente).toBe('nuts');
  });

  it('sin NUTS usable y sin provincia en el título: null, no inventada', () => {
    const r = resolverProvincia({
      titulo: 'Mantenimiento de instalaciones de climatización de edificios',
      nuts: 'ES',
    });
    expect(r.provincia).toBeNull();
    expect(r.fuente).toBe('ninguna');
  });

  it('el título aporta provincia aunque el NUTS no resuelva', () => {
    const r = resolverProvincia({
      titulo: 'Climatización del centro de salud de Betanzos (A Coruña)',
      nuts: 'ESZZZ',
    });
    expect(r.provincia).toBe('A Coruña');
  });
});

describe('provinciaEnTexto', () => {
  it('detecta provincias con tildes y variantes', () => {
    expect(provinciaEnTexto('obra en Cáceres')).toBe('Cáceres');
    expect(provinciaEnTexto('parador de Salamanca')).toBe('Salamanca');
    expect(provinciaEnTexto('centro en Santa Cruz de Tenerife')).toBe('Santa Cruz de Tenerife');
    expect(provinciaEnTexto('sin lugar')).toBeNull();
  });
});
