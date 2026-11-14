import Fastify from 'fastify';
import { pathToFileURL } from 'node:url';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';

export function buildServer() {
  const app = Fastify({ logger: true });
  app.register(cookie, { secret: process.env.SESSION_SECRET ?? 'dev-only-secret-cambiar-en-produccion' });
  app.register(cors, { origin: process.env.WEB_PUBLIC_URL ?? 'http://localhost:5173', credentials: true });
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async () => ({ status: 'ok', db: 'pending', llm: 'none', stripe: 'pending', email: 'pending' }));
  app.get('/api/v1/health', async () => ({ status: 'ok', version: '0.1.0' }));
  return app;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = buildServer();
  const port = Number(process.env.API_PORT ?? 3001);
  app.listen({ port, host: '0.0.0.0' }).then(() => app.log.info(`LicitaClima API en :${port}`));
}
