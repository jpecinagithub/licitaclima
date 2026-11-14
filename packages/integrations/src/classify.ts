// LicitaClima — clasificación del nicho estricto (Fase C).
//
// Regla EXACTA de Fase A (data-feasibility.md §5 + §6.1), reutilizada en el
// pull de 30 días (volume-30d.md §1.1) para que los números sean comparables:
//   nicho = palabra clave (9, en el título) O CPV de nicho (5).
//   Núcleo / limítrofe / marginal = preclasificación por reglas de
//   scripts/aggregate_30d.py `preclass()` (Fase A §6.4).
// Solo núcleo + limítrofe se publican como oportunidades; los marginales van
// a revisión (packages/config: NICHO.publishClasses). La lista es solo en
// español por comparabilidad con Fase A: los títulos en catalán/gallego/vasco
// solo entran por CPV (volume-30d.md §1.2). NO ampliar sin decisión de Jon.

import { NICHO } from '@licitaclima/config';
import { normalizarTexto } from './province.js';

export type ClaseNicho = 'nucleo' | 'limitrofe' | 'marginal';

export const CPV_NICHO: ReadonlyArray<string> = NICHO.cpv;
export const PALABRAS_CLAVE_NICHO: ReadonlyArray<string> = NICHO.keywords;

export interface ClasificacionNicho {
  /** true si el expediente pertenece al nicho (palabra clave O CPV). */
  esNicho: boolean;
  palabrasClave: string[];
  cpvNicho: string[];
  /** Preclasificación por reglas (revisión manual aparte, no automática). */
  clase: ClaseNicho;
  motivoClase: string;
  /** true si solo entra por CPV (título sin palabra clave): candidato a revisar. */
  soloCpv: boolean;
}

const CPV_COMBUSTIBLE = new Set(['09134000', '09134100', '09134200', '09133000']);

/** Palabras clave del nicho presentes en el título (normalizado, sin tildes). */
export function palabrasClaveEnTitulo(titulo: string): string[] {
  const t = normalizarTexto(titulo);
  return PALABRAS_CLAVE_NICHO.filter((k) => t.includes(normalizarTexto(k)));
}

/** CPV de nicho presentes (se comparan los 8 primeros dígitos). */
export function cpvNichoPresentes(cpv: string[]): string[] {
  return cpv
    .map((c) => (c ?? '').replace(/\D/g, '').slice(0, 8))
    .filter((c) => CPV_NICHO.includes(c));
}

/**
 * Preclasificación núcleo/limítrofe/marginal — port fiel de
 * scripts/aggregate_30d.py `preclass()`. Es una regla, no una revisión
 * humana: los casos límite quedan para revisión manual (motivo_manual en el
 * seed) y los marginales no se publican.
 */
export function preclasificar(titulo: string, cpv: string[]): { clase: ClaseNicho; motivo: string } {
  const t = normalizarTexto(titulo);
  const c = new Set(cpv.map((x) => (x ?? '').replace(/\D/g, '').slice(0, 8)));

  if (
    t.includes('gasoleo') ||
    t.includes('gasoil') ||
    t.includes('combustible') ||
    [...c].some((x) => CPV_COMBUSTIBLE.has(x))
  ) {
    return { clase: 'marginal', motivo: 'combustible/gasóleo' };
  }
  if (
    t.includes('biomasa') ||
    t.includes('pellet') ||
    t.includes('astilla') ||
    t.includes('lena') ||
    c.has('09111400')
  ) {
    return { clase: 'marginal', motivo: 'biomasa/leña' };
  }
  if (
    (t.includes('mantenimiento integral') ||
      t.includes('gestion integral') ||
      t.includes('mantenimiento de edificios') ||
      t.includes('facility') ||
      c.has('79993000') ||
      c.has('50700000')) &&
    !t.includes('climatizacion')
  ) {
    return {
      clase: 'marginal',
      motivo:
        'mantenimiento/gestión integral genérica (climatización no es el objeto principal)',
    };
  }
  if (
    t.includes('camara frigorifica') ||
    t.includes('camara fria') ||
    t.includes('cuarto frio') ||
    t.includes('frio industrial')
  ) {
    return { clase: 'limitrofe', motivo: 'frío industrial / cámaras' };
  }
  if (
    t.includes('eficiencia energetica') ||
    t.includes('mejora energetica') ||
    t.includes('rehabilitacion energetica') ||
    t.includes('ahorro energetico')
  ) {
    return { clase: 'limitrofe', motivo: 'eficiencia energética (climatización como parte)' };
  }
  return { clase: 'nucleo', motivo: '' };
}

export function clasificarNicho(titulo: string, cpv: string[]): ClasificacionNicho {
  const palabrasClave = palabrasClaveEnTitulo(titulo);
  const cpvNicho = cpvNichoPresentes(cpv);
  const esNicho = palabrasClave.length > 0 || cpvNicho.length > 0;
  if (!esNicho) {
    return { esNicho: false, palabrasClave, cpvNicho, clase: 'marginal', motivoClase: 'fuera del nicho', soloCpv: false };
  }
  const { clase, motivo } = preclasificar(titulo, cpv);
  return {
    esNicho: true,
    palabrasClave,
    cpvNicho,
    clase,
    motivoClase: motivo,
    soloCpv: palabrasClave.length === 0,
  };
}

/** ¿Se publica como oportunidad? Solo núcleo + limítrofe (marginal → revisión). */
export function esPublicable(clase: ClaseNicho): boolean {
  return (NICHO.publishClasses as readonly string[]).includes(clase);
}
