/**
 * Errores estructurados: toda respuesta de error es
 * `{ "error": { "code": "...", "message": "..." } }`.
 * Los mensajes son genéricos en 401/404 para no filtrar existencia de recursos.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const badRequest = (message = 'Petición no válida.', code = 'validation_error') =>
  new ApiError(400, code, message);
export const unauthorized = (message = 'No autenticado.') =>
  new ApiError(401, 'unauthorized', message);
export const forbidden = (message = 'No autorizado.') =>
  new ApiError(403, 'forbidden', message);
export const notFound = (message = 'No encontrado.') =>
  new ApiError(404, 'not_found', message);
export const conflict = (message = 'Conflicto.', code = 'conflict') =>
  new ApiError(409, code, message);
export const gone = (message = 'El enlace ha caducado o ya fue usado.') =>
  new ApiError(410, 'invalid_link', message);
export const unavailable = (message = 'Base de datos no disponible.') =>
  new ApiError(503, 'db_unavailable', message);

/** Serializa un error a la forma pública. Nunca incluye stack ni detalles internos. */
export function toErrorBody(err: unknown): { status: number; body: { error: { code: string; message: string } } } {
  if (err instanceof ApiError) {
    return { status: err.status, body: { error: { code: err.code, message: err.message } } };
  }
  return {
    status: 500,
    body: { error: { code: 'internal', message: 'Error interno del servidor.' } },
  };
}
