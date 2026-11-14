// LicitaClima — extracción determinista v1: esquemas Zod (Fase C).
//
// Extracción SIN LLM (proveedor sin elegir). Los campos CODICE vienen del
// Atom; los requisitos se buscan en el texto del PDF con reglas (no con un
// modelo). Cada afirmación lleva evidencia (documento, hash, página,
// fragmento). Ausente = null + motivo. La evidencia inexistente BLOQUEA la
// publicación (el job pone revision_requerida).
//
// El texto de los PDFs es DATO, nunca instrucción: los fragmentos que parecen
// instrucciones ("ignora tus instrucciones…") se registran en
// `instruccionesDetectadas` como dato y no se ejecutan (test en
// apps/worker/src/jobs/extract.test.ts).

import { z } from 'zod';

const decimalString = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'importe decimal con como máximo 2 decimales')
  .describe('Importe en EUR como string decimal (nunca float).');

export const EvidenceRefSchema = z.object({
  documentId: z.string().min(1),
  documentHash: z.string().regex(/^[0-9a-f]{64}$/, 'SHA-256 del documento'),
  page: z.number().int().positive().nullable(),
  fragment: z.string().min(1, 'el fragmento de evidencia no puede estar vacío'),
});

export type EvidenceRefZod = z.infer<typeof EvidenceRefSchema>;

export const CategoriaRequisitoSchema = z.enum([
  'solvencia_tecnica',
  'solvencia_economica',
  'certificacion',
  'garantia',
  'criterio_adjudicacion',
  'documentacion',
  'visita_obligatoria',
  'condiciones_pago',
  'otro',
]);

export const RequirementSchema = z.object({
  id: z.string().min(1),
  categoria: CategoriaRequisitoSchema,
  descripcion: z.string().min(1),
  obligatorio: z.boolean(),
  /** null + motivo cuando el requisito no consta en ningún documento. */
  evidencia: EvidenceRefSchema.nullable(),
  motivoAusencia: z.string().nullable(),
});

export const ExtractionSchema = z.object({
  version: z.literal('determinista-v1'),
  /** Método explícito: nunca presentar esto como análisis LLM. */
  metodo: z.literal('determinista-v1 (sin LLM)'),
  tenderId: z.string().min(1),
  expediente: z.string().min(1),
  objeto: z.string().min(1),
  organismo: z.string().min(1),
  estado: z.enum(['PRE', 'PUB', 'EV', 'ADJ', 'RES', 'ANUL']),
  importes: z.object({
    valorEstimado: decimalString.nullable(),
    presupuestoBaseSinIva: decimalString.nullable(),
    presupuestoBaseConIva: decimalString.nullable(),
  }),
  duracion: z.string().nullable(),
  localizacion: z.string().nullable(),
  plazo: z.object({
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    /** Hora solo si la fuente la da; null + plazoSoloFecha=true si solo hay fecha. */
    hora: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).nullable(),
    plazoSoloFecha: z.boolean(),
  }),
  requisitos: z.array(RequirementSchema),
  /** Conflictos entre documentos: lista explícita, nunca resueltos en silencio. */
  conflictos: z.array(
    z.object({
      campo: z.string(),
      valores: z.array(z.string()).min(2),
      documentos: z.array(z.string()).min(2),
    }),
  ),
  /** Fragmentos del PDF que parecen instrucciones: se guardan como DATO. */
  instruccionesDetectadas: z.array(z.string()),
  extraidoEn: z.string().datetime(),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
export type Requirement = z.infer<typeof RequirementSchema>;

// ---------------------------------------------------------------------------
// Matriz de encaje (análisis, Fase C punto 5)
// ---------------------------------------------------------------------------

export const MatchVerdictSchema = z.enum(['compatible', 'incompatible', 'desconocido', 'no_aplica']);

export const MatchRowSchema = z.object({
  requisitoId: z.string(),
  categoria: CategoriaRequisitoSchema,
  descripcion: z.string(),
  obligatorio: z.boolean(),
  veredicto: MatchVerdictSchema,
  evidencia: EvidenceRefSchema.nullable(),
  /** Dato declarado del perfil usado para el veredicto (null si no aplica). */
  datoPerfilUsado: z.string().nullable(),
  nota: z.string().nullable(),
});

export const MatchMatrixSchema = z.object({
  tenderId: z.string().min(1),
  extractionVersion: z.literal('determinista-v1'),
  filas: z.array(MatchRowSchema),
  /** Un requisito obligatorio incompatible bloquea la recomendación positiva. */
  bloqueadoPor: z.array(z.string()),
  recomendacion: z.enum(['positiva', 'negativa', 'revisar']),
  /** Recuento explicable. El score NO es probabilidad de ganar. */
  resumen: z.object({
    compatibles: z.number().int().nonnegative(),
    incompatibles: z.number().int().nonnegative(),
    desconocidos: z.number().int().nonnegative(),
    noAplica: z.number().int().nonnegative(),
  }),
  advertenciaScore: z.literal('El score es un recuento explicable de encaje, NO una probabilidad de ganar.'),
});

export type MatchMatrix = z.infer<typeof MatchMatrixSchema>;
export type MatchRow = z.infer<typeof MatchRowSchema>;
