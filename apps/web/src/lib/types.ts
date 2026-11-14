// LicitaClima — tipos del cliente web.
// Estos tipos describen lo que el UI espera de /api/v1 (Fase B/D).
// Mientras un endpoint no exista, la UI muestra «Pendiente» o N/D, nunca cifras inventadas.

export type TenderStatus = 'PUB' | 'EV' | 'RES' | 'ADJ' | 'PRE' | 'ANUL';
export type TenderClass = 'núcleo' | 'limítrofe' | 'marginal';
export type FitStatus = 'compatible' | 'incompatible' | 'desconocido' | 'no_aplica';
export type PersonalStatus = 'pendiente' | 'estudiar' | 'descartada' | 'presentada';
export type AnalysisState =
  | 'descubierto'
  | 'normalizado'
  | 'prefiltrado'
  | 'documentos_pendientes'
  | 'extraído'
  | 'analizado'
  | 'validado'
  | 'publicado'
  | 'sin_documentos'
  | 'requiere_OCR'
  | 'fuente_no_disponible'
  | 'revisión_requerida'
  | 'fallido';

export interface Opportunity {
  id: string;
  expediente: string;
  organo: string;
  titulo: string;
  urlOficial: string;
  fuente: '643' | '1044';
  estado: TenderStatus;
  clase: TenderClass;
  provincia: string | null;
  fechaPublicacion: string | null; // ISO, UTC
  fechaModificacion: string | null;
  plazo: string | null; // fecha (YYYY-MM-DD) sin hora inventada
  plazoHora: string | null;
  valorEstimadoEur: number | null;
  presupuestoBaseSinIvaEur: number | null;
  presupuestoBaseConIvaEur: number | null;
  cpv: string[];
  nDocumentos: number;
  nLotes: number;
  encaje?: { score: number | null; motivo: string; bloqueante: boolean };
}

export interface RequirementEvidence {
  requisito: string;
  estado: FitStatus;
  evidencia: { documento: string; pagina: number | null; fragmento: string } | null;
  datoPerfilUsado: string | null;
  motivoSinEvidencia: string | null;
}

export interface Analysis {
  id: string;
  tenderId: string;
  expediente: string;
  estado: AnalysisState;
  version: number;
  resumen: string | null;
  requisitos: RequirementEvidence[];
  importes: {
    valorEstimadoEur: number | null;
    presupuestoBaseSinIvaEur: number | null;
    presupuestoBaseConIvaEur: number | null;
  };
  conflictos: string[];
  camposAusentes: { campo: string; motivo: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  texto: string;
  citas: { documento: string; pagina: number | null; fragmento: string }[];
  sinEvidencia: boolean;
  createdAt: string;
}

export interface CompanyProfile {
  id: string;
  actividad: string[];
  provincias: string[];
  radioKm: number | null;
  tamanoContratoOrientativoEur: { min: number | null; max: number | null };
  capacidadOperativa: string | null;
  experiencia: string | null;
  certificaciones: string[];
  preferencias: string | null;
  version: number;
  updatedAt: string;
}

export interface Usage {
  periodo: { inicio: string; fin: string };
  analisis: { consumidos: number; limite: number };
  consultasChat: { consumidas: number; limite: number };
}

export interface Subscription {
  estado: 'free' | 'active' | 'past_due' | 'canceled_at_period_end' | 'ended' | 'pendiente';
  planId: string;
  periodoFin: string | null;
  proximaFacturaEur: number | null;
}

export interface AppNotification {
  id: string;
  tipo: 'nueva_oportunidad' | 'cambio' | 'rectificacion' | 'sistema';
  titulo: string;
  cuerpo: string;
  tenderId: string | null;
  leida: boolean;
  createdAt: string;
}

export interface Me {
  email: string;
  organizacionId: string;
  perfilCompleto: boolean;
  suscripcion: Subscription;
}

export interface AdminSummary {
  mrrSinImpuestosEur: number | null;
  clientesActivos: number | null;
  altasPeriodo: number | null;
  bajasPeriodo: number | null;
  analisisPeriodo: number | null;
  excepcionesAbiertas: number | null;
  periodo: string | null;
}

export interface AuditEntry {
  id: string;
  actor: string;
  accion: string;
  objeto: string;
  fecha: string;
}
