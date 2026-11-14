import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  adminLoginSchema,
  adminReauthSchema,
  adminSettingsSchema,
  analysisQuestionSchema,
  companyProfileSchema,
  consentSchema,
  consumeLinkSchema,
  emailWebhookSchema,
  leadSchema,
  notificationPreferencesSchema,
  personalStatusBodySchema,
  requestLinkSchema,
  supportMessageSchema,
  supportTicketSchema,
  supportTicketStatusSchema,
  usageReserveSchema,
  usageSettleSchema,
  verifyLinkSchema,
} from './lib/schemas.js';

/**
 * OpenAPI 3.1 generado desde los esquemas Zod de src/lib/schemas.ts.
 * Generador: `zod-to-json-schema` (sin @fastify/swagger: el documento se
 * construye desde la misma fuente que valida la entrada, así no deriva).
 * Regenerar con: `pnpm --filter @licitaclima/api exec tsx src/openapi-gen.ts`
 * También se sirve en vivo en GET /api/v1/openapi.json.
 */
export function buildOpenApiDocument() {
  const json = (schema: Parameters<typeof zodToJsonSchema>[0]) =>
    zodToJsonSchema(schema, { target: 'openApi3' });
  const errorBody = {
    type: 'object',
    required: ['error'],
    properties: {
      error: {
        type: 'object',
        required: ['code', 'message'],
        properties: { code: { type: 'string' }, message: { type: 'string' } },
      },
    },
  };
  const genericMessage = {
    type: 'object',
    properties: { ok: { type: 'boolean' }, message: { type: 'string' } },
  };
  return {
    openapi: '3.1.0',
    info: {
      title: 'LicitaClima API',
      version: '0.1.0',
      description:
        'API de LicitaClima (Fases B+D + API de lectura): autenticación por magic link, sesiones, perfil de empresa, ' +
        'facturación Stripe (solo test), cuotas, soporte, notificaciones, panel admin, oportunidades, análisis ' +
        'personalizados con evidencias, chat determinista sin LLM, favoritos, leads y endpoints públicos. ' +
        'Dinero en EUR (numeric), instantes en UTC, español de España. ' +
        'Stripe y correo sin configurar quedan PENDIENTE (checkout 503, outbox sin envío).',
    },
    servers: [{ url: 'http://localhost:3001', description: 'Desarrollo local' }],
    tags: [
      { name: 'auth', description: 'Magic link, sesiones y administración' },
      { name: 'profile', description: 'Perfil de empresa' },
      { name: 'billing', description: 'Suscripción Stripe (solo test), checkout, portal, webhook' },
      { name: 'usage', description: 'Cuota del periodo de suscripción (análisis y chat)' },
      { name: 'support', description: 'Tickets de soporte vinculados a la organización' },
      { name: 'notifications', description: 'Notificaciones, preferencias, consentimientos y baja' },
      { name: 'admin', description: 'Panel de administración (resumen, finanzas, clientes, auditoría)' },
      { name: 'opportunities', description: 'Oportunidades públicas (núcleo + limítrofe) y análisis personalizados' },
      { name: 'analyses', description: 'Análisis personalizados, PDF y chat determinista con citas' },
      { name: 'favorites', description: 'Favoritos y estado personal por organización' },
      { name: 'leads', description: 'Captación pública (muestra)' },
      { name: 'public', description: 'Cobertura y muestra pública, sin registro' },
    ],
    paths: {
      '/auth/request-link': {
        post: {
          tags: ['auth'],
          summary: 'Solicitar enlace mágico de acceso',
          description:
            'Siempre responde 200 con el mismo mensaje (anti-enumeración). El token dura 15 minutos y es de un solo uso.',
          requestBody: { required: true, content: { 'application/json': { schema: json(requestLinkSchema) } } },
          responses: {
            '200': { description: 'Solicitud registrada.', content: { 'application/json': { schema: genericMessage } } },
            '400': { description: 'Petición no válida.', content: { 'application/json': { schema: errorBody } } },
            '429': { description: 'Demasiadas solicitudes.', content: { 'application/json': { schema: errorBody } } },
          },
        },
      },
      '/auth/verify-link': {
        get: {
          tags: ['auth'],
          summary: 'Verificar un enlace sin consumirlo (página intermedia)',
          description: 'GET nunca consume el token. El consumo es POST /auth/consume-link.',
          parameters: [{ name: 'token', in: 'query', required: true, schema: { type: 'string' } }],
          responses: {
            '200': {
              description: 'Estado del enlace.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { valid: { type: 'boolean' }, emailMasked: { type: ['string', 'null'] } },
                  },
                },
              },
            },
          },
        },
      },
      '/auth/consume-link': {
        post: {
          tags: ['auth'],
          summary: 'Consumir el enlace y abrir sesión',
          description: 'Consumo atómico (un solo uso). Crea usuario y organización en el primer acceso. Devuelve cookie de sesión HttpOnly.',
          requestBody: { required: true, content: { 'application/json': { schema: json(consumeLinkSchema) } } },
          responses: {
            '200': { description: 'Sesión abierta.' },
            '410': { description: 'Enlace caducado, reutilizado o inexistente.', content: { 'application/json': { schema: errorBody } } },
          },
        },
      },
      '/auth/logout': {
        post: {
          tags: ['auth'],
          summary: 'Cerrar sesión (revoca la sesión)',
          responses: { '200': { description: 'Sesión cerrada.', content: { 'application/json': { schema: genericMessage } } } },
        },
      },
      '/auth/admin/login': {
        post: {
          tags: ['auth'],
          summary: 'Login de administrador (contraseña + TOTP)',
          requestBody: { required: true, content: { 'application/json': { schema: json(adminLoginSchema) } } },
          responses: {
            '200': { description: 'Sesión de administrador abierta.' },
            '401': { description: 'Credenciales no válidas.', content: { 'application/json': { schema: errorBody } } },
          },
        },
      },
      '/auth/admin/reauth': {
        post: {
          tags: ['auth'],
          summary: 'Reautenticación MFA para acciones sensibles',
          requestBody: { required: true, content: { 'application/json': { schema: json(adminReauthSchema) } } },
          responses: {
            '200': { description: 'MFA verificado.', content: { 'application/json': { schema: genericMessage } } },
            '401': { description: 'Credenciales no válidas.', content: { 'application/json': { schema: errorBody } } },
            '403': { description: 'Se requiere rol de administrador.', content: { 'application/json': { schema: errorBody } } },
          },
        },
      },
      '/me': {
        get: {
          tags: ['auth'],
          summary: 'Usuario y organización de la sesión',
          responses: {
            '200': { description: 'Sesión válida.' },
            '401': { description: 'No autenticado.', content: { 'application/json': { schema: errorBody } } },
          },
        },
      },
      '/company-profile': {
        get: {
          tags: ['profile'],
          summary: 'Leer el perfil de empresa de la organización',
          responses: {
            '200': { description: 'Perfil vigente.' },
            '401': { description: 'No autenticado.', content: { 'application/json': { schema: errorBody } } },
            '404': { description: 'Sin perfil todavía.', content: { 'application/json': { schema: errorBody } } },
          },
        },
        patch: {
          tags: ['profile'],
          summary: 'Crear o actualizar el perfil (versionado)',
          description:
            'Cada PATCH crea una versión en profile_versions y marca el recálculo de encaje como pendiente (worker, Fase C). Máximo 3 provincias.',
          requestBody: { required: true, content: { 'application/json': { schema: json(companyProfileSchema) } } },
          responses: {
            '200': { description: 'Perfil guardado.' },
            '400': { description: 'Perfil no válido.', content: { 'application/json': { schema: errorBody } } },
            '401': { description: 'No autenticado.', content: { 'application/json': { schema: errorBody } } },
          },
        },
      },
      '/billing/subscription': {
        get: {
          tags: ['billing'],
          summary: 'Suscripción, plan, cuota y estado de Stripe',
          responses: {
            '200': { description: 'Suscripción vigente (free si no hay pago).' },
            '401': { description: 'No autenticado.', content: { 'application/json': { schema: errorBody } } },
          },
        },
      },
      '/billing/checkout': {
        post: {
          tags: ['billing'],
          summary: 'Crear Checkout Session de Stripe (solo test)',
          description:
            'Sin claves Stripe responde 503 stripe_not_configured. El acceso NO se activa por la URL de éxito: solo por webhook verificado.',
          responses: {
            '200': { description: 'Sesión creada (url).' },
            '409': { description: 'Ya hay una suscripción activa.', content: { 'application/json': { schema: errorBody } } },
            '503': { description: 'Stripe no configurado.', content: { 'application/json': { schema: errorBody } } },
          },
        },
      },
      '/billing/portal': {
        post: {
          tags: ['billing'],
          summary: 'Sesión del portal de cliente de Stripe',
          responses: {
            '200': { description: 'Sesión creada (url).' },
            '503': { description: 'Stripe no configurado.', content: { 'application/json': { schema: errorBody } } },
          },
        },
      },
      '/billing/cancel': {
        post: {
          tags: ['billing'],
          summary: 'Cancelar al final del periodo pagado',
          description: 'Mantiene el acceso hasta el final del periodo pagado.',
          responses: {
            '200': { description: 'Cancelación registrada.' },
            '409': { description: 'No hay suscripción activa.', content: { 'application/json': { schema: errorBody } } },
          },
        },
      },
      '/webhooks/stripe': {
        post: {
          tags: ['billing'],
          summary: 'Webhook de Stripe (firma verificada con raw body)',
          description: 'Persiste el evento (event_id único) y encola su procesado; el worker lo aplica.',
          responses: {
            '200': { description: 'Evento recibido.' },
            '400': { description: 'Firma no válida.', content: { 'application/json': { schema: errorBody } } },
          },
        },
      },
      '/usage': {
        get: {
          tags: ['usage'],
          summary: 'Cuota del periodo de suscripción',
          responses: { '200': { description: 'Uso de análisis y chat del periodo vigente.' } },
        },
      },
      '/usage/reserve': {
        post: {
          tags: ['usage'],
          summary: 'Reservar una unidad de cuota (atómica, idempotente)',
          description: 'Revisitar un análisis o una rectificación del mismo expediente no consume.',
          requestBody: { required: true, content: { 'application/json': { schema: json(usageReserveSchema) } } },
          responses: {
            '200': { description: 'Reserva realizada (o reutilización sin consumo).' },
            '409': { description: 'Cuota agotada o en pausa.', content: { 'application/json': { schema: errorBody } } },
          },
        },
      },
      '/usage/confirm': {
        post: {
          tags: ['usage'],
          summary: 'Confirmar la entrega (no consume extra)',
          requestBody: { required: true, content: { 'application/json': { schema: json(usageSettleSchema) } } },
          responses: { '200': { description: 'Confirmación registrada.' } },
        },
      },
      '/usage/release': {
        post: {
          tags: ['usage'],
          summary: 'Liberar la unidad reservada (fallo)',
          requestBody: { required: true, content: { 'application/json': { schema: json(usageSettleSchema) } } },
          responses: { '200': { description: 'Liberación registrada.' } },
        },
      },
      '/support/tickets': {
        get: {
          tags: ['support'],
          summary: 'Listar mis tickets de soporte',
          responses: { '200': { description: 'Tickets de la organización.' } },
        },
        post: {
          tags: ['support'],
          summary: 'Crear un ticket de soporte',
          description: 'El agente nunca promete compensaciones ni modifica datos sensibles desde texto libre.',
          requestBody: { required: true, content: { 'application/json': { schema: json(supportTicketSchema) } } },
          responses: { '201': { description: 'Ticket creado.' } },
        },
      },
      '/support/tickets/{id}': {
        get: {
          tags: ['support'],
          summary: 'Ver un ticket con su conversación',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Ticket y mensajes.' },
            '404': { description: 'No encontrado.', content: { 'application/json': { schema: errorBody } } },
          },
        },
        patch: {
          tags: ['support'],
          summary: 'Resolver o cerrar mi ticket',
          requestBody: { required: true, content: { 'application/json': { schema: json(supportTicketStatusSchema) } } },
          responses: { '200': { description: 'Ticket actualizado.' } },
        },
      },
      '/support/tickets/{id}/messages': {
        post: {
          tags: ['support'],
          summary: 'Añadir un mensaje al ticket',
          requestBody: { required: true, content: { 'application/json': { schema: json(supportMessageSchema) } } },
          responses: { '201': { description: 'Mensaje añadido.' } },
        },
      },
      '/notifications': {
        get: {
          tags: ['notifications'],
          summary: 'Notificaciones de la organización',
          responses: { '200': { description: 'Notificaciones y no leídas.' } },
        },
      },
      '/notification-preferences': {
        get: {
          tags: ['notifications'],
          summary: 'Preferencias de avisos',
          responses: { '200': { description: 'Preferencias vigentes.' } },
        },
        patch: {
          tags: ['notifications'],
          summary: 'Actualizar preferencias (desactivar alertas no cancela la suscripción)',
          requestBody: { required: true, content: { 'application/json': { schema: json(notificationPreferencesSchema) } } },
          responses: { '200': { description: 'Preferencias guardadas.' } },
        },
      },
      '/consents': {
        get: {
          tags: ['notifications'],
          summary: 'Consentimientos vigentes por propósito',
          responses: { '200': { description: 'Último consentimiento por propósito.' } },
        },
        post: {
          tags: ['notifications'],
          summary: 'Registrar un consentimiento (con versión del texto)',
          description: 'Boletines y marketing exigen doble confirmación.',
          requestBody: { required: true, content: { 'application/json': { schema: json(consentSchema) } } },
          responses: { '201': { description: 'Consentimiento registrado.' } },
        },
      },
      '/notifications/unsubscribe': {
        get: {
          tags: ['notifications'],
          summary: 'Baja de marketing por enlace firmado',
          description: 'La baja no cancela comunicaciones de cuenta ni la suscripción.',
          parameters: [{ name: 'token', in: 'query', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Baja registrada.' } },
        },
      },
      '/webhooks/email': {
        post: {
          tags: ['notifications'],
          summary: 'Webhook del proveedor de correo (entregas, rebotes, quejas)',
          description: 'Sin proveedor configurado responde 503. Los rebotes/quejas crean supresión automática.',
          requestBody: { required: true, content: { 'application/json': { schema: json(emailWebhookSchema) } } },
          responses: { '200': { description: 'Evento registrado.' } },
        },
      },
      '/admin/summary': {
        get: {
          tags: ['admin'],
          summary: 'Resumen: clientes activos, MRR, altas, bajas, uso y excepciones',
          responses: { '200': { description: 'Resumen del panel.' }, '403': { description: 'Se requiere rol de administrador.', content: { 'application/json': { schema: errorBody } } } },
        },
      },
      '/admin/funnel': {
        get: {
          tags: ['admin'],
          summary: 'Embudo por canal (datos ausentes como N/D)',
          responses: { '200': { description: 'Embudo.' } },
        },
      },
      '/admin/finance': {
        get: {
          tags: ['admin'],
          summary: 'Finanzas: MRR sin impuestos, reembolsos, contribución estimada',
          description: 'No se confunde margen con beneficio neto; LTV solo como estimación.',
          responses: { '200': { description: 'Finanzas.' } },
        },
      },
      '/admin/customers': {
        get: {
          tags: ['admin'],
          summary: 'Clientes: plan, cuota, incidencias y estado',
          responses: { '200': { description: 'Clientes.' } },
        },
      },
      '/admin/quality': {
        get: {
          tags: ['admin'],
          summary: 'Calidad: requisitos sin evidencia, fallos, bloqueos',
          responses: { '200': { description: 'Calidad.' } },
        },
      },
      '/admin/sources': {
        get: {
          tags: ['admin'],
          summary: 'Fuentes y operaciones: última ejecución, cola y reintentos',
          responses: { '200': { description: 'Fuentes y operaciones.' } },
        },
      },
      '/admin/comms': {
        get: {
          tags: ['admin'],
          summary: 'Comunicaciones: envíos, rebotes, quejas, bajas y cola',
          responses: { '200': { description: 'Comunicaciones.' } },
        },
      },
      '/admin/support': {
        get: {
          tags: ['admin'],
          summary: 'Soporte: tickets por prioridad, SLA interno y escalados',
          responses: { '200': { description: 'Soporte.' } },
        },
      },
      '/admin/settings': {
        get: {
          tags: ['admin'],
          summary: 'Configuración versionada y estado de pausas',
          responses: { '200': { description: 'Configuración.' } },
        },
        patch: {
          tags: ['admin'],
          summary: 'Actualizar configuración (requiere reautenticación MFA)',
          description: 'Pausas: pause.capture, pause.campaigns, pause.new_analyses, pause.non_essential_emails. No bloquean acceso ni cancelación.',
          requestBody: { required: true, content: { 'application/json': { schema: json(adminSettingsSchema) } } },
          responses: { '200': { description: 'Configuración guardada.' } },
        },
      },
      '/admin/customers/{id}': {
        get: {
          tags: ['admin'],
          summary: 'Detalle de cliente (acceso auditado)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Cliente, suscripción, cuota y tickets.' } },
        },
      },
      '/admin/health': {
        get: {
          tags: ['admin'],
          summary: 'Salud de integraciones (stripe/email/llm)',
          responses: { '200': { description: 'Estado por integración (pending = PENDIENTE).' } },
        },
      },
      '/admin/support/tickets/{id}/messages': {
        post: {
          tags: ['admin'],
          summary: 'Respuesta del administrador en un ticket',
          description: 'La respuesta no promete compensaciones ni modifica datos sensibles desde texto libre.',
          requestBody: { required: true, content: { 'application/json': { schema: json(supportMessageSchema) } } },
          responses: { '201': { description: 'Mensaje añadido.' } },
        },
      },
      '/admin/support/tickets/{id}/status': {
        post: {
          tags: ['admin'],
          summary: 'Cambiar el estado de un ticket (admin)',
          requestBody: { required: true, content: { 'application/json': { schema: json(supportTicketStatusSchema) } } },
          responses: { '200': { description: 'Estado actualizado.' } },
        },
      },
      '/notifications/{id}/read': {
        patch: {
          tags: ['notifications'],
          summary: 'Marcar una notificación como leída',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Notificación marcada.' } },
        },
      },
      '/notifications/unsubscribe-link': {
        get: {
          tags: ['notifications'],
          summary: 'Generar el enlace de baja firmado',
          responses: { '200': { description: 'Token de baja.' } },
        },
      },
      '/notifications/outbox': {
        get: {
          tags: ['notifications'],
          summary: 'Outbox propio (estado de envíos)',
          responses: { '200': { description: 'Envíos encolados de la organización.' } },
        },
      },
      '/admin/audit': {
        get: {
          tags: ['admin'],
          summary: 'Auditoría: actor, acción, objeto y fecha',
          responses: { '200': { description: 'Registros de auditoría.' } },
        },
      },
      '/company-profile/versions': {
        get: {
          tags: ['profile'],
          summary: 'Historial de versiones del perfil de empresa',
          responses: { '200': { description: 'Versiones, de la más reciente a la más antigua.' } },
        },
      },
      '/opportunities': {
        get: {
          tags: ['opportunities'],
          summary: 'Lista filtrable de oportunidades (solo núcleo + limítrofe)',
          description:
            'Por defecto solo convocatorias abiertas (estado PUB). Los marginales no se listan. Filtros: provincia, estado, clase, texto, estadoPersonal, favorito. Paginación: page, limit (máx. 100). Orden: publicacion_desc (defecto), plazo_asc, importe_desc, importe_asc.',
          parameters: [
            { name: 'provincia', in: 'query', schema: { type: 'string' } },
            { name: 'estado', in: 'query', schema: { type: 'string', default: 'PUB' } },
            { name: 'clase', in: 'query', schema: { type: 'string', enum: ['nucleo', 'limitrofe'] } },
            { name: 'texto', in: 'query', schema: { type: 'string' } },
            { name: 'estadoPersonal', in: 'query', schema: { type: 'string', enum: ['pendiente', 'estudiar', 'descartada', 'presentada'] } },
            { name: 'favorito', in: 'query', schema: { type: 'string', enum: ['true', 'false'] } },
            { name: 'orden', in: 'query', schema: { type: 'string', enum: ['publicacion_desc', 'plazo_asc', 'importe_desc', 'importe_asc'] } },
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            '200': { description: 'Oportunidades + total.' },
            '400': { description: 'Filtro no válido.', content: { 'application/json': { schema: errorBody } } },
          },
        },
      },
      '/opportunities/{id}': {
        get: {
          tags: ['opportunities'],
          summary: 'Ficha de oportunidad con fuentes, lotes, documentos y requisitos',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Ficha completa.' },
            '404': { description: 'No encontrada (o marginal, que no se lista).', content: { 'application/json': { schema: errorBody } } },
          },
        },
      },
      '/opportunities/{id}/analyses': {
        post: {
          tags: ['opportunities'],
          summary: 'Solicitar análisis personalizado (reserva cuota, 202 + job_id)',
          description:
            'Reserva 1 unidad de análisis de forma atómica. Revisitar un análisis terminado o una rectificación del mismo expediente NO consume. El trabajo lo ejecuta el worker (job personalized-analyze).',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '202': { description: 'Análisis encolado (pending) o ya en curso.' },
            '200': { description: 'Análisis ya terminado: se reutiliza sin consumir.' },
            '404': { description: 'Oportunidad no encontrada.', content: { 'application/json': { schema: errorBody } } },
            '409': { description: 'Cuota agotada, sin acceso o nuevos análisis en pausa.', content: { 'application/json': { schema: errorBody } } },
          },
        },
      },
      '/opportunities/{id}/status': {
        patch: {
          tags: ['opportunities'],
          summary: 'Estado personal (pendiente/estudiar/descartada/presentada)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: json(personalStatusBodySchema) } } },
          responses: { '200': { description: 'Estado guardado.' } },
        },
      },
      '/analyses/{id}': {
        get: {
          tags: ['analyses'],
          summary: 'Análisis completo con evidencias',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'Estado + resultado con evidencias cuando está listo.' },
            '404': { description: 'No encontrado.', content: { 'application/json': { schema: errorBody } } },
          },
        },
      },
      '/analyses/{id}/pdf': {
        get: {
          tags: ['analyses'],
          summary: 'Exportación PDF del análisis (extracción determinista v1, sin LLM)',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            '200': { description: 'PDF del análisis.' },
            '404': { description: 'No encontrado.', content: { 'application/json': { schema: errorBody } } },
            '409': { description: 'El análisis aún no está terminado.', content: { 'application/json': { schema: errorBody } } },
          },
        },
      },
      '/analyses/{id}/questions': {
        get: {
          tags: ['analyses'],
          summary: 'Historial de preguntas del análisis',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Mensajes de la conversación del expediente.' } },
        },
        post: {
          tags: ['analyses'],
          summary: 'Pregunta de chat contextual (determinista, con citas; consume cuota)',
          description:
            'SIN LLM: la respuesta se busca en los fragmentos extraídos del expediente. Con citas (documento, página, fragmento) o «Sin evidencia en los documentos». Consume 1 consulta de chat por pregunta.',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: json(analysisQuestionSchema) } } },
          responses: {
            '201': { description: 'Respuesta con citas o sin evidencia.' },
            '409': { description: 'Cuota de chat agotada o análisis no terminado.', content: { 'application/json': { schema: errorBody } } },
          },
        },
      },
      '/favorites/{id}': {
        post: {
          tags: ['favorites'],
          summary: 'Marcar favorito',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Favorito guardado.' } },
        },
        delete: {
          tags: ['favorites'],
          summary: 'Quitar favorito',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '204': { description: 'Favorito eliminado.' } },
        },
      },
      '/leads': {
        post: {
          tags: ['leads'],
          summary: 'Guardar lead de la muestra (público, rate limit)',
          description:
            'Crea o actualiza el lead y registra el consentimiento de marketing solo si se marca. Sin envío de correo (outbox pendiente).',
          requestBody: { required: true, content: { 'application/json': { schema: json(leadSchema) } } },
          responses: {
            '200': { description: 'Lead guardado.' },
            '429': { description: 'Demasiadas solicitudes.', content: { 'application/json': { schema: errorBody } } },
          },
        },
      },
      '/public/coverage': {
        get: {
          tags: ['public'],
          summary: 'Cobertura pública: fuentes y última sincronización real',
          description: 'Fuentes oficiales 643 y 1044 + última sincronización exitosa real (ingestion_runs) y conteos reales. Sin afirmar cobertura exhaustiva.',
          responses: { '200': { description: 'Fuentes, conteos y última sincronización.' } },
        },
      },
      '/public/sample': {
        get: {
          tags: ['public'],
          summary: 'Muestra pública de oportunidades reales (sin registro)',
          description: 'Oportunidades PUB de núcleo reales, limitadas (limit, máx. 10). Nunca se fabrican oportunidades.',
          parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 5 } }],
          responses: { '200': { description: 'Muestra real.' } },
        },
      },
    },
    components: {
      securitySchemes: {
        sessionCookie: { type: 'apiKey', in: 'cookie', name: 'lc_session' },
      },
    },
  };
}
