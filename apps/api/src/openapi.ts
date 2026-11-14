import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  adminLoginSchema,
  adminReauthSchema,
  companyProfileSchema,
  consumeLinkSchema,
  requestLinkSchema,
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
        'API de LicitaClima (Fase B): autenticación por magic link, sesiones, perfil de empresa. ' +
        'Dinero en EUR (numeric), instantes en UTC, español de España.',
    },
    servers: [{ url: 'http://localhost:3001', description: 'Desarrollo local' }],
    tags: [
      { name: 'auth', description: 'Magic link, sesiones y administración' },
      { name: 'profile', description: 'Perfil de empresa' },
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
    },
    components: {
      securitySchemes: {
        sessionCookie: { type: 'apiKey', in: 'cookie', name: 'lc_session' },
      },
    },
  };
}
