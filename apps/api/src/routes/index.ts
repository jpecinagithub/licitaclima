import type { FastifyInstance } from 'fastify';
import type { Db } from '@licitaclima/db';
import { authRoutes } from './auth.js';
import { meRoutes } from './me.js';
import { profileRoutes } from './profile.js';
import { billingRoutes } from './billing.js';
import { usageRoutes } from './usage.js';
import { supportRoutes } from './support.js';
import { adminRoutes } from './admin.js';
import { notificationsRoutes } from './notifications.js';
import { opportunitiesRoutes } from './opportunities.js';
import { analysesRoutes } from './analyses.js';
import { favoritesRoutes } from './favorites.js';
import { leadsRoutes } from './leads.js';
import { publicRoutes } from './public.js';
import { buildOpenApiDocument } from '../openapi.js';

/** Registra todas las rutas /api/v1 (Fase B + Fase D + API de lectura). Síncrono: no se hace await de
 *  app.register fuera del ciclo de arranque de Fastify (bloquearía ready()). */
export function registerRoutes(app: FastifyInstance, db: Db | undefined): void {
  app.register(authRoutes, { prefix: '/api/v1', db });
  app.register(meRoutes, { prefix: '/api/v1', db });
  app.register(profileRoutes, { prefix: '/api/v1', db });
  app.register(billingRoutes, { prefix: '/api/v1', db });
  app.register(usageRoutes, { prefix: '/api/v1', db });
  app.register(supportRoutes, { prefix: '/api/v1', db });
  app.register(adminRoutes, { prefix: '/api/v1', db });
  app.register(notificationsRoutes, { prefix: '/api/v1', db });
  app.register(opportunitiesRoutes, { prefix: '/api/v1', db });
  app.register(analysesRoutes, { prefix: '/api/v1', db });
  app.register(favoritesRoutes, { prefix: '/api/v1', db });
  app.register(leadsRoutes, { prefix: '/api/v1', db });
  app.register(publicRoutes, { prefix: '/api/v1', db });
  app.get('/api/v1/openapi.json', async (_request, reply) => {
    return reply.send(buildOpenApiDocument());
  });
}
