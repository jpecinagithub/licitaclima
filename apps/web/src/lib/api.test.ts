import { describe, expect, it, vi } from 'vitest';
import { API_ENDPOINTS, apiGet } from './api.js';

describe('registro de endpoints del API (Fase B/D)', () => {
  it('incluye los endpoints orientativos del prompt maestro §8', () => {
    const paths = API_ENDPOINTS.map((e) => `${e.method} ${e.path}`);
    for (const esperado of [
      'POST /auth/request-link',
      'POST /auth/consume-link',
      'GET /me',
      'GET /company-profile',
      'PATCH /company-profile',
      'GET /opportunities',
      'GET /opportunities/:id',
      'POST /opportunities/:id/analyses',
      'GET /analyses/:id',
      'POST /analyses/:id/questions',
      'POST /favorites/:id',
      'GET /notifications',
      'PATCH /notification-preferences',
      'GET /usage',
      'POST /billing/checkout',
      'POST /billing/portal',
      'GET /admin/summary',
      'GET /admin/funnel',
      'GET /admin/finances',
      'GET /admin/customers',
      'GET /admin/quality',
      'GET /admin/sources',
      'GET /admin/communications',
      'GET /admin/support',
      'GET /admin/settings',
      'GET /admin/audit',
      'POST /admin/pauses',
    ]) {
      expect(paths).toContain(esperado);
    }
  });

  it('no hay endpoints duplicados', () => {
    const keys = API_ENDPOINTS.map((e) => `${e.method} ${e.path}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('apiGet llama a /api/v1 con credenciales incluidas', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await apiGet('/me');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/me',
      expect.objectContaining({ credentials: 'include' }),
    );
    vi.unstubAllGlobals();
  });
});
