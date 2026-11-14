// Cliente HTTP del API versionada /api/v1.
//
// REGISTRO DE ENDPOINTS QUE EL UI ASUME (Fase B/D — prompt maestro §8).
// El coordinador debe cruzar esta lista con lo que implemente el backend:
// si un endpoint falta, la UI muestra «Pendiente» / N/D, nunca datos inventados.
// Ninguna de estas rutas está verificada contra un backend en marcha a día de hoy:
// apps/api es aún un esqueleto (server.ts) y el API real lo construye otro bloque.
import type {
  AdminCustomer,
  CommsData,
  FinancesData,
  FunnelData,
  PausesData,
  QualityData,
  SourcesData,
  AdminSettingsData,
  AdminSummaryData,
  AdminSupportData,
} from './admin.js';
import type {
  Analysis,
  AppNotification,
  AuditEntry,
  ChatMessage,
  CompanyProfile,
  Me,
  Opportunity,
  PersonalStatus,
  Subscription,
  Usage,
} from './types.js';

export interface EndpointSpec {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  para: string;
}

/** Lista exacta de endpoints que consume este frontend. */
export const API_ENDPOINTS: EndpointSpec[] = [
  { method: 'POST', path: '/auth/request-link', para: 'Solicitar magic link (cliente)' },
  { method: 'POST', path: '/auth/consume-link', para: 'Consumir magic link (confirmación POST)' },
  { method: 'POST', path: '/auth/logout', para: 'Cerrar sesión' },
  { method: 'GET', path: '/me', para: 'Sesión actual y suscripción' },
  { method: 'GET', path: '/company-profile', para: 'Perfil de empresa + versión' },
  { method: 'PATCH', path: '/company-profile', para: 'Actualizar perfil (versionado, recalcula encaje)' },
  { method: 'GET', path: '/company-profile/versions', para: 'Historial de versiones del perfil' },
  { method: 'GET', path: '/opportunities', para: 'Lista filtrable de oportunidades (provincia, estado, clase, texto)' },
  { method: 'GET', path: '/opportunities/:id', para: 'Ficha de oportunidad con fuentes y requisitos' },
  { method: 'POST', path: '/opportunities/:id/analyses', para: 'Solicitar análisis personalizado (reserva cuota, 202 + job_id)' },
  { method: 'GET', path: '/analyses/:id', para: 'Análisis completo con evidencias' },
  { method: 'GET', path: '/analyses/:id/pdf', para: 'Exportación PDF del análisis' },
  { method: 'POST', path: '/analyses/:id/questions', para: 'Pregunta de chat contextual (con citas; consume cuota)' },
  { method: 'GET', path: '/analyses/:id/questions', para: 'Historial de preguntas del análisis' },
  { method: 'POST', path: '/favorites/:id', para: 'Marcar favorito' },
  { method: 'DELETE', path: '/favorites/:id', para: 'Quitar favorito' },
  { method: 'PATCH', path: '/opportunities/:id/status', para: 'Estado personal (pendiente/estudiar/descartada/presentada)' },
  { method: 'GET', path: '/notifications', para: 'Historial de avisos' },
  { method: 'PATCH', path: '/notification-preferences', para: 'Preferencias de avisos (resumen SEMANAL + alertas)' },
  { method: 'GET', path: '/notification-preferences', para: 'Leer preferencias de avisos' },
  { method: 'GET', path: '/usage', para: 'Uso del plan (análisis de 10, consultas de 100)' },
  { method: 'POST', path: '/billing/checkout', para: 'Crear sesión de Stripe Checkout (test)' },
  { method: 'POST', path: '/billing/portal', para: 'Abrir Stripe Customer Portal' },
  { method: 'GET', path: '/billing/subscription', para: 'Suscripción vigente' },
  { method: 'POST', path: '/leads', para: 'Muestra: guardar correo verificado + aviso gratuito solicitado' },
  { method: 'POST', path: '/support/tickets', para: 'Crear ticket de soporte' },
  { method: 'GET', path: '/support/tickets', para: 'Listar tickets propios' },
  { method: 'POST', path: '/consents', para: 'Registrar consentimiento (versión del texto + fecha)' },
  { method: 'GET', path: '/public/coverage', para: 'Cobertura pública: fuentes y última sincronización' },
  { method: 'GET', path: '/public/sample', para: 'Muestra pública de oportunidad real' },
  // Admin (/admin/*) — requieren rol owner/admin en servidor.
  { method: 'GET', path: '/admin/summary', para: 'Resumen admin (MRR sin impuestos, clientes, altas, bajas, uso, excepciones)' },
  { method: 'GET', path: '/admin/funnel', para: 'Embudo por canal' },
  { method: 'GET', path: '/admin/finances', para: 'Finanzas (ingresos sin impuestos, reembolsos, comisiones, costes, contribución)' },
  { method: 'GET', path: '/admin/customers', para: 'Clientes (perfil, plan, cuota, incidencias, estado)' },
  { method: 'GET', path: '/admin/quality', para: 'Calidad (requisitos sin evidencia, contradicciones, muestras, feedback)' },
  { method: 'GET', path: '/admin/sources', para: 'Fuentes y operaciones (última ejecución, frescura, errores, cola, reintentos)' },
  { method: 'GET', path: '/admin/communications', para: 'Comunicaciones (envíos, rebotes, quejas, bajas, cola)' },
  { method: 'GET', path: '/admin/support', para: 'Soporte admin (tickets por prioridad, SLA)' },
  { method: 'GET', path: '/admin/settings', para: 'Configuración versionada (fuentes, modelos, límites, planes, plantillas)' },
  { method: 'GET', path: '/admin/audit', para: 'Auditoría (actor, acción, objeto, fecha)' },
  { method: 'POST', path: '/admin/pauses', para: 'Pausar/reanudar captación, campañas, nuevos análisis o envíos no esenciales' },
  { method: 'GET', path: '/admin/pauses', para: 'Estado actual de las pausas' },
];

const BASE = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    let detail = `El servicio devolvió ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      detail = body.error ?? body.message ?? detail;
    } catch {
      // cuerpo no JSON: se conserva el mensaje genérico
    }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}

export const apiGet = <T>(path: string): Promise<T> => request<T>(path);
export const apiPost = <T>(path: string, body?: unknown): Promise<T> =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
export const apiPatch = <T>(path: string, body: unknown): Promise<T> =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
export const apiDelete = <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' });

// --- Llamadas tipadas que usa el panel cliente ---

export const getMe = () => apiGet<Me>('/me');
export const getProfile = () => apiGet<CompanyProfile>('/company-profile');
export const updateProfile = (patch: Partial<CompanyProfile>) =>
  apiPatch<CompanyProfile>('/company-profile', patch);
export const getProfileVersions = () => apiGet<CompanyProfile[]>('/company-profile/versions');
export const getOpportunities = (q: URLSearchParams) =>
  apiGet<{ items: Opportunity[]; total: number }>(`/opportunities?${q.toString()}`);
export const getOpportunity = (id: string) => apiGet<Opportunity>(`/opportunities/${id}`);
export const requestAnalysis = (id: string) =>
  apiPost<{ jobId: string; analysisId?: string }>(`/opportunities/${id}/analyses`, {});
export const getAnalysis = (id: string) => apiGet<Analysis>(`/analyses/${id}`);
export const getAnalysisQuestions = (id: string) => apiGet<ChatMessage[]>(`/analyses/${id}/questions`);
export const askAnalysisQuestion = (id: string, texto: string) =>
  apiPost<ChatMessage>(`/analyses/${id}/questions`, { texto });
export const setFavorite = (id: string, fav: boolean) =>
  fav ? apiPost(`/favorites/${id}`, {}) : apiDelete(`/favorites/${id}`);
export const setPersonalStatus = (id: string, estado: PersonalStatus) =>
  apiPatch(`/opportunities/${id}/status`, { estado });
export const getNotifications = () => apiGet<AppNotification[]>('/notifications');
export const getUsage = () => apiGet<Usage>('/usage');
export const getSubscription = () => apiGet<Subscription>('/billing/subscription');
export const requestCheckout = () => apiPost<{ url: string }>('/billing/checkout', {});
export const openBillingPortal = () => apiPost<{ url: string }>('/billing/portal', {});
export const requestMagicLink = (email: string) =>
  apiPost<{ ok: boolean }>('/auth/request-link', { email });
export const submitLead = (body: { email: string; actividad: string; provincia: string; consentimientoMarketing: boolean }) =>
  apiPost<{ ok: boolean }>('/leads', body);
export const createSupportTicket = (body: { asunto: string; mensaje: string; prioridad: string }) =>
  apiPost<{ id: string }>('/support/tickets', body);
export const getSupportTickets = () =>
  apiGet<{ id: string; asunto: string; estado: string; prioridad: string; createdAt: string }[]>(
    '/support/tickets',
  );

export interface NotificationPreferences {
  resumen: 'semanal';
  alertas: boolean;
  alertasNuevasOportunidades: boolean;
  alertasRectificaciones: boolean;
  emailResumen: boolean;
}
export const getNotificationPreferences = () =>
  apiGet<NotificationPreferences>('/notification-preferences');
export const updateNotificationPreferences = (prefs: NotificationPreferences) =>
  apiPatch<NotificationPreferences>('/notification-preferences', prefs);

// --- Admin (/admin/*) — requieren rol owner/admin en servidor ---
export const getAdminSummary = () => apiGet<AdminSummaryData>('/admin/summary');
export const getAdminFunnel = () => apiGet<FunnelData[]>('/admin/funnel');
export const getAdminFinances = () => apiGet<FinancesData>('/admin/finances');
export const getAdminCustomers = () => apiGet<AdminCustomer[]>('/admin/customers');
export const getAdminQuality = () => apiGet<QualityData>('/admin/quality');
export const getAdminSources = () => apiGet<SourcesData[]>('/admin/sources');
export const getAdminComms = () => apiGet<CommsData>('/admin/communications');
export const getAdminSupport = () => apiGet<AdminSupportData>('/admin/support');
export const getAdminSettings = () => apiGet<AdminSettingsData>('/admin/settings');
export const getAdminAudit = () => apiGet<AuditEntry[]>('/admin/audit');
export const getPauses = () => apiGet<PausesData>('/admin/pauses');
export const setPause = (key: keyof PausesData, value: boolean) =>
  apiPost<PausesData>('/admin/pauses', { [key]: value });
