// LicitaClima — análisis de encaje (matriz por requisito) + publicación (Fase C).
//
// Matriz compatible / incompatible / desconocido / no_aplica, con evidencia
// del pliego y dato de perfil usado. Reglas duras:
//   - un requisito OBLIGATORIO incompatible bloquea la recomendación positiva;
//   - desconocido ≠ cumplido (nunca se da por cumplido lo que no consta);
//   - el score es un recuento explicable, NO una probabilidad de ganar.
// El perfil son datos DECLARADOS por la empresa, no verificados.

import { MatchMatrixSchema, type Extraction, type MatchMatrix, type MatchRow } from '@licitaclima/domain';
import { normalizarTexto } from '@licitaclima/integrations';
import type { CompanyProfile } from '@licitaclima/domain';
import type { WorkerStore } from '../db.js';

function parseRangoTamano(texto: string | null): { min: number | null; max: number | null } | null {
  if (!texto) return null;
  const numeros = [...texto.matchAll(/(\d[\d.]*)/g)].map((m) => Number(m[1].replace(/\./g, '')));
  if (numeros.length === 0) return null;
  if (numeros.length === 1) return { min: null, max: numeros[0] };
  return { min: Math.min(...numeros), max: Math.max(...numeros) };
}

/** Construye la matriz de encaje a partir de la extracción y el perfil. */
export function construirMatriz(input: {
  tenderId: string;
  extraction: Extraction;
  provincia: string | null;
  profile: CompanyProfile | null;
}): MatchMatrix {
  const { extraction, profile } = input;
  const filas: MatchRow[] = [];

  // Territorio (obligatorio): la provincia de ejecución debe estar en el perfil.
  if (profile) {
    const enProvincias = input.provincia !== null && profile.provincias.includes(input.provincia);
    filas.push({
      requisitoId: 'territorio',
      categoria: 'otro',
      descripcion: `Ejecución en ${input.provincia ?? 'provincia desconocida'} (provincias de servicio: ${profile.provincias.join(', ') || 'ninguna'})`,
      obligatorio: true,
      veredicto: input.provincia === null ? 'desconocido' : enProvincias ? 'compatible' : 'incompatible',
      evidencia: null,
      datoPerfilUsado: `provincias: ${profile.provincias.join(', ')}`,
      nota: input.provincia === null ? 'provincia de ejecución sin resolver en el feed' : null,
    });

    // Actividad: ¿el objeto menciona la actividad declarada?
    const palabrasActividad = normalizarTexto(profile.actividad).split(' ').filter((w) => w.length > 3);
    const objetoNorm = normalizarTexto(extraction.objeto);
    const coincideActividad = palabrasActividad.some((p) => objetoNorm.includes(p));
    filas.push({
      requisitoId: 'actividad',
      categoria: 'otro',
      descripcion: `Actividad declarada: ${profile.actividad}`,
      obligatorio: false,
      veredicto: coincideActividad ? 'compatible' : 'desconocido',
      evidencia: null,
      datoPerfilUsado: `actividad: ${profile.actividad}`,
      nota: coincideActividad ? null : 'el objeto no menciona literalmente la actividad declarada; revisar manualmente',
    });

    // Tamaño orientativo del contrato (no bloqueante).
    const rango = parseRangoTamano(profile.tamanoContratosOrientativo);
    const importe = extraction.importes.presupuestoBaseSinIva ?? extraction.importes.valorEstimado;
    if (rango && importe) {
      const valor = Number(importe);
      const dentro = (rango.min === null || valor >= rango.min) && (rango.max === null || valor <= rango.max);
      filas.push({
        requisitoId: 'tamano',
        categoria: 'otro',
        descripcion: `Importe ${valor} € frente a tamaño orientativo declarado (${profile.tamanoContratosOrientativo})`,
        obligatorio: false,
        veredicto: dentro ? 'compatible' : 'incompatible',
        evidencia: null,
        datoPerfilUsado: `tamanoContratosOrientativo: ${profile.tamanoContratosOrientativo}`,
        nota: dentro ? null : 'importe fuera del tamaño orientativo declarado',
      });
    }
  }

  // Requisitos del pliego: con evidencia → se compara con el perfil; sin
  // evidencia → desconocido (nunca cumplido por defecto).
  for (const req of extraction.requisitos) {
    if (req.categoria === 'certificacion' && profile) {
      const fragmento = req.evidencia ? normalizarTexto(req.evidencia.fragment) : '';
      const certificacionCoincide = profile.certificacionesDeclaradas.some(
        (c) => fragmento.includes(normalizarTexto(c)) || normalizarTexto(c).length > 3 && fragmento.includes(normalizarTexto(c).slice(0, 12)),
      );
      filas.push({
        requisitoId: req.id,
        categoria: req.categoria,
        descripcion: req.descripcion,
        obligatorio: req.obligatorio,
        veredicto: !req.evidencia ? 'desconocido' : certificacionCoincide ? 'compatible' : 'desconocido',
        evidencia: req.evidencia,
        datoPerfilUsado: `certificacionesDeclaradas: ${profile.certificacionesDeclaradas.join(', ') || 'ninguna'}`,
        nota: !req.evidencia ? req.motivoAusencia : certificacionCoincide ? null : 'la certificación exigida no aparece entre las declaradas; revisar el pliego',
      });
      continue;
    }
    filas.push({
      requisitoId: req.id,
      categoria: req.categoria,
      descripcion: req.descripcion,
      obligatorio: req.obligatorio,
      veredicto: !req.evidencia ? 'desconocido' : 'compatible',
      evidencia: req.evidencia,
      datoPerfilUsado: null,
      nota: !req.evidencia ? req.motivoAusencia : 'consta en el pliego con evidencia',
    });
  }

  const bloqueadoPor = filas
    .filter((f) => f.obligatorio && f.veredicto === 'incompatible')
    .map((f) => f.requisitoId);
  const resumen = {
    compatibles: filas.filter((f) => f.veredicto === 'compatible').length,
    incompatibles: filas.filter((f) => f.veredicto === 'incompatible').length,
    desconocidos: filas.filter((f) => f.veredicto === 'desconocido').length,
    noAplica: filas.filter((f) => f.veredicto === 'no_aplica').length,
  };
  const recomendacion =
    bloqueadoPor.length > 0
      ? 'negativa'
      : resumen.incompatibles === 0 && resumen.desconocidos === 0
        ? 'positiva'
        : 'revisar';
  return MatchMatrixSchema.parse({
    tenderId: input.tenderId,
    extractionVersion: 'determinista-v1',
    filas,
    bloqueadoPor,
    recomendacion,
    resumen,
    advertenciaScore: 'El score es un recuento explicable de encaje, NO una probabilidad de ganar.',
  });
}

export interface AnalyzeResult {
  tenderId: string;
  recomendacion: string;
  bloqueadoPor: string[];
  nextPipeline: string;
}

export async function runAnalyze(
  store: WorkerStore,
  opts: { tenderId: string; organizationId?: string | null; profile?: CompanyProfile | null },
): Promise<AnalyzeResult> {
  const tender = await store.getTender(opts.tenderId);
  if (!tender) throw new Error(`expediente desconocido: ${opts.tenderId}`);
  const saved = await store.getExtraction(tender.id);
  if (!saved) throw new Error(`sin extracción determinista para ${tender.id}: pasa antes por el job extract`);
  const extraction = saved.payload as Extraction;
  const matriz = construirMatriz({
    tenderId: tender.id,
    extraction,
    provincia: tender.provincia,
    profile: opts.profile ?? null,
  });
  await store.saveMatch(tender.id, opts.organizationId ?? null, matriz, matriz.recomendacion);
  await store.setPipeline(tender.id, 'analizado');
  await store.enqueueJob('publish', { tenderId: tender.id });
  return {
    tenderId: tender.id,
    recomendacion: matriz.recomendacion,
    bloqueadoPor: matriz.bloqueadoPor,
    nextPipeline: 'analizado',
  };
}

/**
 * Publicación: solo núcleo/limítrofe con extracción válida. Los marginales
 * nunca llegan aquí (quedan en revision_requerida en la ingesta). Tras
 * publicar, se encolan las alertas a las organizaciones de esa provincia.
 */
export async function runPublish(
  store: WorkerStore,
  opts: { tenderId: string },
): Promise<{ tenderId: string; published: boolean }> {
  const tender = await store.getTender(opts.tenderId);
  if (!tender) throw new Error(`expediente desconocido: ${opts.tenderId}`);
  if (tender.claseNicho === 'marginal') {
    await store.setPipeline(tender.id, 'revision_requerida');
    return { tenderId: tender.id, published: false };
  }
  if (tender.estado !== 'PUB') {
    // Solo se publican convocatorias abiertas; el resto queda validado.
    await store.setPipeline(tender.id, 'validado');
    return { tenderId: tender.id, published: false };
  }
  await store.setPipeline(tender.id, 'validado');
  await store.setPipeline(tender.id, 'publicado');
  await store.enqueueJob('alerts', { tenderId: tender.id });
  return { tenderId: tender.id, published: true };
}
