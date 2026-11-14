// LicitaClima — extracción determinista v1 (Fase C). SIN LLM.
//
// Campos CODICE del Atom + búsqueda por reglas en el texto del PDF.
// Cada requisito lleva evidencia (documento, hash, página, fragmento) o queda
// como ausente (null + motivo). La evidencia inexistente BLOQUEA la
// publicación: el job pone revision_requerida.
//
// El texto del PDF es DATO, nunca instrucción: los fragmentos que parecen
// instrucciones se registran en `instruccionesDetectadas` y no se ejecutan.
// Nada de lo que diga un pliego puede cambiar el comportamiento del worker,
// llamar a herramientas ni acceder a secretos (no hay ninguna vía de código
// que interprete el texto como instrucción).

import { ExtractionSchema, type Extraction, type Requirement } from '@licitaclima/domain';
import { extractPdfText, normalizarTexto } from '@licitaclima/integrations';
import type { PdfPageText } from '@licitaclima/integrations';
import type { WorkerStore } from '../db.js';
import type { DocumentStorage } from './documents.js';

/** Patrones de prompt injection dentro de documentos (se detectan, no se obedecen). */
export const INJECTION_PATTERNS: ReadonlyArray<RegExp> = [
  /ignora (tus|las|todas las) instrucciones/i,
  /olvida (tus|las) instrucciones/i,
  /act[uú]a como (un|una|el|la|tu)/i,
  /eres ahora (un|una|el|la)/i,
  /revela (tu|la|el) (clave|contrase[a-z]*|secreto|system prompt)/i,
  /system prompt/i,
  /ejecuta (el|este) c[oó]digo/i,
  /env[ií]a (los|las|tus) (datos|claves|credenciales)/i,
];

export function detectarInstrucciones(texto: string): string[] {
  const halladas: string[] = [];
  for (const pattern of INJECTION_PATTERNS) {
    const m = texto.match(pattern);
    if (m && m.index !== undefined) {
      halladas.push(texto.slice(Math.max(0, m.index - 60), m.index + 140).replace(/\s+/g, ' ').trim());
    }
  }
  return halladas;
}

/** Reglas de requisitos: patrón en el texto del pliego → categoría. */
const REGLAS_REQUISITOS: ReadonlyArray<{
  id: string;
  categoria: Requirement['categoria'];
  descripcion: string;
  obligatorio: boolean;
  patrones: RegExp[];
}> = [
  {
    id: 'solvencia-tecnica',
    categoria: 'solvencia_tecnica',
    descripcion: 'Solvencia técnica o profesional exigida',
    obligatorio: true,
    patrones: [/solvencia t[eé]cnica/i, /solvencia profesional/i, /medios t[eé]cnicos/i],
  },
  {
    id: 'solvencia-economica',
    categoria: 'solvencia_economica',
    descripcion: 'Solvencia económica y financiera exigida',
    obligatorio: true,
    patrones: [/solvencia econ[óo]mica/i, /solvencia financiera/i, /volumen anual de negocios/i],
  },
  {
    id: 'certificacion',
    categoria: 'certificacion',
    descripcion: 'Certificaciones exigidas (p. ej. ISO, clasificación del contratista)',
    obligatorio: false,
    patrones: [/certificad[oa]/i, /ISO 9001/i, /ISO 14001/i, /clasificaci[óo]n del contratista/i],
  },
  {
    id: 'garantia',
    categoria: 'garantia',
    descripcion: 'Garantía provisional o definitiva',
    obligatorio: true,
    patrones: [/garant[íi]a definitiva/i, /garant[íi]a provisional/i],
  },
  {
    id: 'criterios-adjudicacion',
    categoria: 'criterio_adjudicacion',
    descripcion: 'Criterios de adjudicación y pesos',
    obligatorio: false,
    patrones: [/criterios? de adjudicaci[óo]n/i, /criterios? de valoraci[óo]n/i],
  },
  {
    id: 'documentacion',
    categoria: 'documentacion',
    descripcion: 'Documentación a presentar con la oferta',
    obligatorio: true,
    patrones: [/documentaci[óo]n a presentar/i, /documentaci[óo]n exigida/i, /documentaci[óo]n requerida/i],
  },
  {
    id: 'visita-obligatoria',
    categoria: 'visita_obligatoria',
    descripcion: 'Visita obligatoria al lugar de ejecución',
    obligatorio: false,
    patrones: [/visita obligatoria/i],
  },
  {
    id: 'condiciones-pago',
    categoria: 'condiciones_pago',
    descripcion: 'Condiciones y plazos de pago',
    obligatorio: false,
    patrones: [/forma de pago/i, /plazo de pago/i, /condiciones de pago/i],
  },
];

function buscarEnPaginas(paginas: PdfPageText[], patrones: RegExp[]): { page: number; fragment: string } | null {
  for (const pagina of paginas) {
    for (const patron of patrones) {
      const m = pagina.text.match(patron);
      if (m && m.index !== undefined) {
        const inicio = Math.max(0, m.index - 80);
        const fragmento = pagina.text.slice(inicio, m.index + 220).replace(/\s+/g, ' ').trim();
        return { page: pagina.page, fragment: fragmento };
      }
    }
  }
  return null;
}

/** Validador: el fragmento debe pertenecer al texto del documento que cita. */
export function fragmentoPerteneceAlTexto(fragmento: string, paginas: PdfPageText[]): boolean {
  const normalizado = normalizarTexto(fragmento);
  if (normalizado.length < 10) return false;
  return paginas.some((p) => normalizarTexto(p.text).includes(normalizado.slice(0, 120)));
}

/**
 * Construye la extracción determinista a partir del expediente (Atom) y del
 * texto de sus pliegos. No usa LLM y no inventa nada: lo que no consta es
 * null + motivo.
 */
export function extraerDeterminista(input: {
  tenderId: string;
  expediente: string;
  objeto: string;
  organismo: string;
  estado: string;
  valorEstimado: string | null;
  presupuestoBaseSinIva: string | null;
  presupuestoBaseConIva: string | null;
  duracion: string | null;
  localizacion: string | null;
  plazoFecha: string | null;
  plazoHora: string | null;
  plazoSoloFecha: boolean;
  documentos: Array<{ documentId: string; documentHash: string; paginas: PdfPageText[] }>;
}): Extraction {
  const todasLasPaginas = input.documentos.flatMap((d) => d.paginas);
  const textoCompleto = todasLasPaginas.map((p) => p.text).join('\n');
  const instruccionesDetectadas = detectarInstrucciones(textoCompleto);

  const requisitos: Requirement[] = REGLAS_REQUISITOS.map((regla) => {
    let evidencia: Requirement['evidencia'] = null;
    for (const doc of input.documentos) {
      const hallazgo = buscarEnPaginas(doc.paginas, regla.patrones);
      if (hallazgo) {
        evidencia = {
          documentId: doc.documentId,
          documentHash: doc.documentHash,
          page: hallazgo.page,
          fragment: hallazgo.fragment,
        };
        break;
      }
    }
    return {
      id: regla.id,
      categoria: regla.categoria,
      descripcion: regla.descripcion,
      obligatorio: regla.obligatorio,
      evidencia,
      motivoAusencia: evidencia ? null : 'no consta en los pliegos descargados',
    };
  });

  const extraccion = {
    version: 'determinista-v1' as const,
    metodo: 'determinista-v1 (sin LLM)' as const,
    tenderId: input.tenderId,
    expediente: input.expediente,
    objeto: input.objeto,
    organismo: input.organismo,
    estado: input.estado as Extraction['estado'],
    importes: {
      valorEstimado: input.valorEstimado,
      presupuestoBaseSinIva: input.presupuestoBaseSinIva,
      presupuestoBaseConIva: input.presupuestoBaseConIva,
    },
    duracion: input.duracion,
    localizacion: input.localizacion,
    plazo: {
      fecha: input.plazoFecha,
      hora: input.plazoHora,
      plazoSoloFecha: input.plazoSoloFecha,
    },
    requisitos,
    conflictos: [],
    instruccionesDetectadas,
    extraidoEn: new Date().toISOString(),
  };
  return ExtractionSchema.parse(extraccion);
}

export interface ExtractResult {
  tenderId: string;
  requisitosConEvidencia: number;
  requisitosSinEvidencia: number;
  obligatoriosSinEvidencia: number;
  instruccionesDetectadas: number;
  nextPipeline: string;
}

export async function runExtract(
  store: WorkerStore,
  storage: DocumentStorage,
  opts: {
    tenderId: string;
    extractFn?: typeof extractPdfText;
  },
): Promise<ExtractResult> {
  const extractFn = opts.extractFn ?? extractPdfText;
  const tender = await store.getTender(opts.tenderId);
  if (!tender) throw new Error(`expediente desconocido: ${opts.tenderId}`);
  const docs = await store.getDocumentsForTender(tender.id);
  if (docs.length === 0) {
    await store.setPipeline(tender.id, 'sin_documentos');
    return { tenderId: tender.id, requisitosConEvidencia: 0, requisitosSinEvidencia: 0, obligatoriosSinEvidencia: 0, instruccionesDetectadas: 0, nextPipeline: 'sin_documentos' };
  }

  const documentos: Array<{ documentId: string; documentHash: string; paginas: PdfPageText[] }> = [];
  for (const doc of docs) {
    const bytes = await storage.load(doc.sha256);
    if (!bytes) continue; // documento registrado pero sin bytes (p. ej. tras restaurar): se re-descarga en el job documents
    const text = await extractFn(bytes);
    documentos.push({ documentId: doc.id, documentHash: doc.sha256, paginas: text.pages });
    // Texto extraído por página, con numeración original (Fase B: extracted_pages).
    await store.saveExtractedPages(doc.id, text.pages);
  }
  if (documentos.length === 0) {
    await store.setPipeline(tender.id, 'documentos_pendientes');
    await store.enqueueJob('documents', { tenderId: tender.id });
    return { tenderId: tender.id, requisitosConEvidencia: 0, requisitosSinEvidencia: 0, obligatoriosSinEvidencia: 0, instruccionesDetectadas: 0, nextPipeline: 'documentos_pendientes' };
  }

  const extraccion = extraerDeterminista({
    tenderId: tender.id,
    expediente: tender.expediente,
    objeto: tender.objeto,
    organismo: tender.organo,
    estado: tender.estado,
    valorEstimado: tender.valorEstimado,
    presupuestoBaseSinIva: tender.presupuestoBaseSinIva,
    presupuestoBaseConIva: tender.presupuestoBaseConIva,
    duracion: tender.duracion,
    localizacion: tender.provincia,
    plazoFecha: tender.plazoFecha,
    plazoHora: tender.plazoHora,
    plazoSoloFecha: tender.plazoSoloFecha,
    documentos,
  });

  // Validador: cada fragmento citado debe pertenecer al texto de su documento.
  for (const req of extraccion.requisitos) {
    if (!req.evidencia) continue;
    const doc = documentos.find((d) => d.documentHash === req.evidencia?.documentHash);
    if (!doc || !fragmentoPerteneceAlTexto(req.evidencia.fragment, doc.paginas)) {
      throw new Error(`evidencia inválida en requisito ${req.id}: el fragmento no pertenece al documento citado`);
    }
  }

  const conEvidencia = extraccion.requisitos.filter((r) => r.evidencia).length;
  const obligatoriosSinEvidencia = extraccion.requisitos.filter((r) => r.obligatorio && !r.evidencia).length;
  await store.saveExtraction(tender.id, 'determinista-v1', extraccion, 'extraido');

  // La evidencia inexistente BLOQUEA la publicación.
  if (obligatoriosSinEvidencia > 0) {
    await store.setPipeline(tender.id, 'revision_requerida');
    return {
      tenderId: tender.id,
      requisitosConEvidencia: conEvidencia,
      requisitosSinEvidencia: extraccion.requisitos.length - conEvidencia,
      obligatoriosSinEvidencia,
      instruccionesDetectadas: extraccion.instruccionesDetectadas.length,
      nextPipeline: 'revision_requerida',
    };
  }
  await store.setPipeline(tender.id, 'extraido');
  await store.enqueueJob('analyze', { tenderId: tender.id });
  return {
    tenderId: tender.id,
    requisitosConEvidencia: conEvidencia,
    requisitosSinEvidencia: extraccion.requisitos.length - conEvidencia,
    obligatoriosSinEvidencia: 0,
    instruccionesDetectadas: extraccion.instruccionesDetectadas.length,
    nextPipeline: 'extraido',
  };
}
