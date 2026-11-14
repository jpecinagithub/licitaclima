import Fastify, { type FastifyError, type FastifyReply, type FastifyRequest } from 'fastify';
import { pathToFileURL } from 'node:url';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { createDb, createPool, type Db } from '@licitaclima/db';
import { emailProviderStatus, stripeStatus } from '@licitaclima/integrations';
import { registerRoutes } from './routes/index.js';
import { toErrorBody } from './lib/errors.js';

export interface BuildServerOptions {
  /** BD inyectada (tests). Si no se pasa, se crea desde DATABASE_URL. */
  db?: Db;
  pool?: ReturnType<typeof createPool>;
}

export function buildServer(opts: BuildServerOptions = {}) {
  const app = Fastify({ logger: true });
  let db = opts.db;
  let pool = opts.pool;
  if (!db && process.env.DATABASE_URL) {
    pool = createPool(process.env.DATABASE_URL);
    db = createDb(pool);
  }
  // Sesiones opacas en cookie (sin firmar: el token se valida por su hash en BD).
  app.register(cookie);
  // CORS restringido: solo el frontend propio, con credenciales (cookies).
  app.register(cors, { origin: process.env.WEB_PUBLIC_URL ?? 'http://localhost:5173', credentials: true });
  // Rate limit global generoso; las rutas sensibles tienen límites propios.
  app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  // Errores estructurados {error:{code,message}} en toda la API.
  app.setErrorHandler((err: FastifyError, _request: FastifyRequest, reply: FastifyReply) => {
    if (err.validation) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Petición no válida.' } });
    }
    // Errores del parser de contenido de Fastify (JSON no válido, cuerpo
    // vacío, etc.): son errores 400 del cliente, no 500 internos.
    const fastifyCode = (err as { code?: unknown }).code;
    if (typeof fastifyCode === 'string' && fastifyCode.startsWith('FST_ERR_CTP_')) {
      return reply.code(400).send({ error: { code: 'validation_error', message: 'Petición no válida.' } });
    }
    // El rate limit de Fastify no es un ApiError: sin esto llegaría como 500
    // «Error interno» en vez del 429 que documenta el OpenAPI.
    if (err.statusCode === 429) {
      return reply
        .code(429)
        .send({ error: { code: 'rate_limited', message: 'Demasiadas solicitudes. Inténtalo más tarde.' } });
    }
    const { status, body } = toErrorBody(err);
    if (status >= 500) app.log.error(err instanceof Error ? err : new Error('unknown error'));
    return reply.code(status).send(body);
  });
  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async () => {
    let dbStatus: string = db ? 'pending' : 'unconfigured';
    if (db) {
      try {
        await db.execute('select 1');
        dbStatus = 'ok';
      } catch {
        dbStatus = 'error';
      }
    }
    // stripe/email 'pending' = PENDIENTE de configuración, no operativos.
    return {
      status: dbStatus === 'ok' || dbStatus === 'unconfigured' ? 'ok' : 'degraded',
      db: dbStatus,
      llm: 'none',
      stripe: stripeStatus(),
      email: emailProviderStatus(),
    };
  });
  app.get('/api/v1/health', async () => ({ status: 'ok', version: '0.1.0' }));
  registerRoutes(app, db);
  app.addHook('onClose', async () => {
    if (pool) await pool.end();
  });
  return app;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = buildServer();
  const port = Number(process.env.API_PORT ?? 3001);
  app.listen({ port, host: '0.0.0.0' }).then(() => app.log.info(`LicitaClima API en :${port}`));
}
