// LicitaClima — favoritos por organización (block/api-lectura).
//
// POST /favorites/:id: marca favorito (crea la fila con estado 'pendiente'
// si no existe; si ya existe, conserva su estado personal).
// DELETE /favorites/:id: quita favorito (idempotente, 204).
// El estado personal vive en la misma tabla (PATCH /opportunities/:id/status).

import type { FastifyPluginAsync } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { favorites } from '@licitaclima/db';
import type { RouteOptions } from './auth.js';
import { requireDb } from './auth.js';
import { authenticate, requireOrg } from '../lib/tenant.js';
import { checkCsrf } from '../lib/csrf.js';
import { loadVisibleTender } from '../lib/opportunities.js';

export const favoritesRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const db = opts.db;

  app.post('/favorites/:id', async (request, reply) => {
    checkCsrf(request);
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const d = requireDb(db);
    const tender = await loadVisibleTender(d, (request.params as { id: string }).id);
    const [row] = await d
      .insert(favorites)
      .values({ organizationId, tenderId: tender.id, state: 'pendiente' })
      .onConflictDoNothing()
      .returning();
    if (row) return reply.send({ tenderId: tender.id, estado: row.state, favorito: true });
    const [existing] = await d
      .select()
      .from(favorites)
      .where(
        and(eq(favorites.organizationId, organizationId), eq(favorites.tenderId, tender.id)),
      )
      .limit(1);
    return reply.send({ tenderId: tender.id, estado: existing?.state ?? 'pendiente', favorito: true });
  });

  app.delete('/favorites/:id', async (request, reply) => {
    checkCsrf(request);
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const d = requireDb(db);
    const tenderId = (request.params as { id: string }).id;
    await d
      .delete(favorites)
      .where(and(eq(favorites.organizationId, organizationId), eq(favorites.tenderId, tenderId)));
    return reply.code(204).send();
  });
}
