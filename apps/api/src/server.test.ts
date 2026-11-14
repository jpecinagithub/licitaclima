import { describe, expect, it } from 'vitest';
import { buildServer } from './server.js';

describe('health', () => {
  it('GET /health/live responde ok', async () => {
    const app = buildServer();
    const res = await app.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('JSON no válido → 400, no 500', async () => {
    const app = buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/request-link',
      headers: { 'content-type': 'application/json' },
      payload: '{no-json',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation_error');
  });

  it('DELETE sin cuerpo con Content-Type json → 400, no 500', async () => {
    const app = buildServer();
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/favorites/00000000-0000-0000-0000-000000000000',
      headers: { 'content-type': 'application/json' },
    });
    // El parser rechaza el cuerpo vacío declarado como JSON antes de la
    // autenticación: 400 validation_error, nunca 500. El cliente web ya no
    // envía ese header sin cuerpo (ver apps/web/src/lib/api.ts); con sesión
    // y favorito existente el DELETE devuelve 204 (opportunities.test.ts).
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('validation_error');
  });
});
