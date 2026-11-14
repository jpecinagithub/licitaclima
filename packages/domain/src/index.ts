// LicitaClima — tipos de dominio. Dinero siempre como string decimal (nunca float).
export * from './extraction.js';
export type Money = { amount: string; currency: 'EUR' };
export type TenderStatus = 'PRE' | 'PUB' | 'EV' | 'ADJ' | 'RES' | 'ANUL';
export type NicheClass = 'nucleo' | 'limitrofe' | 'marginal';
export type PipelineState =
  | 'descubierto' | 'normalizado' | 'prefiltrado' | 'documentos_pendientes'
  | 'extraido' | 'analizado' | 'validado' | 'publicado'
  | 'sin_documentos' | 'requiere_OCR' | 'fuente_no_disponible' | 'revision_requerida' | 'fallido';
export type MatchVerdict = 'compatible' | 'incompatible' | 'desconocido' | 'no_aplica';
export type PersonalState = 'pendiente' | 'estudiar' | 'descartada' | 'presentada';
export type SubscriptionStatus = 'free' | 'active' | 'past_due' | 'canceled_at_period_end' | 'ended';

export interface EvidenceRef {
  documentId: string;
  documentHash: string;
  page: number | null;
  fragment: string;
}

export interface RequirementEvidence {
  requirement: string;
  verdict: MatchVerdict;
  evidence: EvidenceRef | null;
  profileDatumUsed: string | null;
  note: string | null;
}

export interface TenderAmounts {
  valorEstimado: Money | null;
  presupuestoBaseSinIva: Money | null;
  presupuestoBaseConIva: Money | null;
}

export interface TenderCore {
  id: string;
  source: 'feed643' | 'feed1044';
  sourceId: string;
  expediente: string;
  organo: string;
  objeto: string;
  estado: TenderStatus;
  amounts: TenderAmounts;
  duracion: string | null;
  provincia: string | null;
  provinciaPorVerificar: boolean;
  nuts: string | null;
  plazo: string | null; // ISO con hora cuando la fuente la da; null si solo hay fecha (nunca inventar hora)
  plazoSoloFecha: boolean;
  cpv: string[];
  claseNicho: NicheClass;
  urlOficial: string;
  pipeline: PipelineState;
  updatedAt: string;
}

export interface CompanyProfile {
  actividad: string;
  provincias: string[];
  radioKm: number | null;
  tamanoContratosOrientativo: string | null;
  capacidadOperativa: string | null;
  experiencia: string | null;
  certificacionesDeclaradas: string[];
  preferencias: string | null;
}
export * from './classify.js';
export * from './province.js';
