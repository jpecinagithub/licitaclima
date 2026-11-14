import { describe, expect, it } from 'vitest';
import { buildServer } from './server.js';

describe('health', () => {
  it('GET /health/live responde ok', async () => {
    const app = buildServer();
    const res = await app.inject({ method: 'GET', url: '/health/live' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});
