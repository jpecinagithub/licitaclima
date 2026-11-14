import type { FastifyInstance } from 'fastify';
import type { Db } from '@licitaclima/db';
import { authRoutes } from './auth.js';
import { meRoutes } from './me.js';
import { profileRoutes } from './profile.js';
import { buildOpenApiDocument } from '../openapi.js';

/** Registra todas las rutas /api/v1 (Fase B). Síncrono: no se hace await de
 *  app.register fuera del ciclo de arranque de Fastify (bloquearía ready()). */
export function registerRoutes(app: FastifyInstance, db: Db | undefined): void {
  app.register(authRoutes, { prefix: '/api/v1', db });
  app.register(meRoutes, { prefix: '/api/v1', db });
  app.register(profileRoutes, { prefix: '/api/v1', db });
  app.get('/api/v1/openapi.json', async (_request, reply) => {
    return reply.send(buildOpenApiDocument());
  });
}
