// LicitaClima — captación pública: leads de la muestra (block/api-lectura).
//
// POST /leads: público, con rate limit (10/15 min por IP). Crea o actualiza
// el lead (actividad, provincia) y registra el consentimiento de marketing
// SOLO si se marca (texto versionado `marketing-v1`, con fecha). Sin enviar
// correo: el outbox y el envío siguen PENDIENTES (Fase D). Sin tratar la IP
// como identidad única.

import type { FastifyPluginAsync } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { consentEvents, leads } from '@licitaclima/db';
import type { RouteOptions } from './auth.js';
import { requireDb } from './auth.js';
import { badRequest } from '../lib/errors.js';
import { leadSchema } from '../lib/schemas.js';

export const leadsRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const db = opts.db;

  app.post(
    '/leads',
    { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
    async (request, reply) => {
      const parsed = leadSchema.safeParse(request.body);
      if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Datos no válidos.');
      const d = requireDb(db);
      const { email, actividad, provincia, consentimientoMarketing } = parsed.data;
      await d
        .insert(leads)
        .values({ email, activity: actividad, province: provincia, source: 'muestra_web' })
        .onConflictDoUpdate({
          target: leads.email,
          set: { activity: actividad, province: provincia, updatedAt: new Date() },
        });
      if (consentimientoMarketing) {
        const [existing] = await d
          .select({ id: consentEvents.id })
          .from(consentEvents)
          .where(
            and(
              eq(consentEvents.email, email),
              eq(consentEvents.purpose, 'marketing'),
              eq(consentEvents.granted, true),
              eq(consentEvents.textVersion, 'marketing-v1'),
            ),
          )
          .limit(1);
        if (!existing) {
          await d.insert(consentEvents).values({
            organizationId: null,
            userId: null,
            email,
            purpose: 'marketing',
            granted: true,
            textVersion: 'marketing-v1',
            source: 'lead_form_muestra',
          });
        }
      }
      return reply.send({ ok: true });
    },
  );
}
