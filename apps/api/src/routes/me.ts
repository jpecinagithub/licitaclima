import type { FastifyPluginAsync } from 'fastify';
import type { RouteOptions } from './auth.js';
import { authenticate } from '../lib/tenant.js';
import { requireDb } from './auth.js';

export const meRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  app.get('/me', async (request, reply) => {
    const ctx = await authenticate(request, requireDb(opts.db));
    return reply.send({
      user: {
        id: ctx.user.id,
        email: ctx.user.email,
        displayName: ctx.user.displayName,
        role: ctx.user.role,
      },
      organization: ctx.organizationId
        ? { id: ctx.organizationId, membershipRole: ctx.membershipRole }
        : null,
      isAdmin: ctx.isAdmin,
    });
  });
};
