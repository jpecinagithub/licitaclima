// Tipos de las vistas de administración. Todos los campos son anulables:
// si el API aún no devuelve un dato, la UI muestra N/D, nunca una cifra inventada.
export interface AdminSummaryData {
  mrrSinImpuestosEur: number | null;
  clientesActivos: number | null;
  altasPeriodo: number | null;
  bajasPeriodo: number | null;
  analisisPeriodo: number | null;
  excepcionesAbiertas: number | null;
  periodo: string | null;
}

export interface FunnelData {
  canal: string;
  visitas: number | null;
  muestras: number | null;
  correosVerificados: number | null;
  perfilesCompletos: number | null;
  checkouts: number | null;
  pagos: number | null;
}

export interface FinancesData {
  ingresosSinImpuestosEur: number | null;
  reembolsosEur: number | null;
  comisionesStripeEur: number | null;
  costeIaEur: number | null;
  costeCorreoEur: number | null;
  gastoPublicidadEur: number | null;
  contribucionEstimadaEur: number | null;
  periodo: string | null;
  notaLtv: string | null;
}

export interface AdminCustomer {
  id: string;
  email: string;
  plan: string;
  estadoSuscripcion: string;
  analisisUsados: number | null;
  analisisLimite: number | null;
  incidenciasAbiertas: number | null;
  ultimaActividad: string | null;
}

export interface QualityData {
  requisitosSinEvidencia: number | null;
  contradicciones: number | null;
  muestrasRevisionPendientes: number | null;
  feedbackRecibido: number | null;
  muestras: { id: string; expediente: string; hallazgo: string; fecha: string | null }[];
}

export interface SourcesData {
  fuente: string;
  ultimaEjecucionOk: string | null;
  frescuraMinutos: number | null;
  errores24h: number | null;
  latenciaMs: number | null;
  trabajosEnCola: number | null;
  reintentosPendientes: number | null;
}

export interface CommsData {
  enviosPeriodo: number | null;
  rebotes: number | null;
  quejas: number | null;
  bajas: number | null;
  enCola: number | null;
  periodo: string | null;
}

export interface AdminSupportData {
  porPrioridad: { prioridad: string; abiertos: number | null }[];
  slaIncumplido: number | null;
  escalados: number | null;
  tiempoMedioRespuestaHoras: number | null;
}

export interface AdminSettingsData {
  version: number | null;
  fuentes: string[];
  modelos: { proveedor: string; modelo: string; precioConfigurado: boolean }[];
  limites: { analisisMes: number | null; consultasChat: number | null; provincias: number | null };
  planes: { id: string; precioEur: number | null }[];
  plantillas: string[];
  actualizadoPor: string | null;
  actualizadoEn: string | null;
}

export interface PausesData {
  captacion: boolean;
  campanas: boolean;
  nuevosAnalisis: boolean;
  enviosNoEsenciales: boolean;
}

export type PauseKey = keyof PausesData;

export const PAUSE_LABELS: { key: PauseKey; label: string; descripcion: string }[] = [
  { key: 'captacion', label: 'Pausar captación', descripcion: 'Detiene la captación de nuevos leads. No bloquea el acceso ni la cancelación.' },
  { key: 'campanas', label: 'Pausar campañas', descripcion: 'Detiene las campañas publicitarias y comerciales. Nunca aumenta el presupuesto.' },
  { key: 'nuevosAnalisis', label: 'Pausar nuevos análisis', descripcion: 'No se inician análisis nuevos. Los análisis en curso terminan.' },
  { key: 'enviosNoEsenciales', label: 'Pausar envíos no esenciales', descripcion: 'Detiene marketing y resúmenes. Las comunicaciones de cuenta y seguridad siguen enviándose.' },
];
