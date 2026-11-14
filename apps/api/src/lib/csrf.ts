import type { FastifyRequest } from 'fastify';
import { forbidden } from './errors.js';

function allowedOrigins(): string[] {
  const raw = [
    process.env.WEB_PUBLIC_URL ?? 'http://localhost:5173',
    process.env.API_PUBLIC_URL ?? 'http://localhost:3001',
    ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : []),
  ];
  return raw.map((o) => o.trim().replace(/\/$/, '')).filter(Boolean);
}

/**
 * Protección CSRF/Origin en mutaciones (con cookie SameSite=Lax).
 * - Si viene Origin, debe estar en la allowlist (exacto).
 * - Si no viene Origin pero sí Referer, su origen debe estar en la allowlist.
 * - Sin Origin ni Referer (clientes no-navegador, curl, tests) se permite:
 *   no hay cookie de navegador que robar en ese caso.
 */
export function checkCsrf(request: FastifyRequest): void {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
  const allowed = allowedOrigins();
  const origin = request.headers.origin;
  if (origin) {
    if (!allowed.includes(origin.replace(/\/$/, ''))) {
      throw forbidden('Origen no permitido.');
    }
    return;
  }
  const referer = request.headers.referer;
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (!allowed.includes(refererOrigin)) throw forbidden('Origen no permitido.');
    } catch (err) {
      if (err instanceof Error && err.message === 'Origen no permitido.') throw err;
      throw forbidden('Origen no permitido.');
    }
  }
}
