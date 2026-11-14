import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { auditLogs, companyProfiles, profileVersions } from '@licitaclima/db';
import type { RouteOptions } from './auth.js';
import { requireDb } from './auth.js';
import { authenticate, requireOrg } from '../lib/tenant.js';
import { checkCsrf } from '../lib/csrf.js';
import { badRequest, notFound } from '../lib/errors.js';
import { companyProfileSchema, type CompanyProfileInput } from '../lib/schemas.js';

type ProfileRow = typeof companyProfiles.$inferSelect;

function toJson(row: ProfileRow) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    actividad: row.actividad,
    provincias: row.provincias,
    radioKm: row.radioKm,
    tamanoContratosOrientativo: row.tamanoContratosOrientativo,
    capacidadOperativa: row.capacidadOperativa,
    experiencia: row.experiencia,
    certificacionesDeclaradas: row.certificacionesDeclaradas,
    preferencias: row.preferencias,
    version: row.version,
    matchesRecalcPending: row.matchesRecalcPending,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function snapshot(row: ProfileRow) {
  return {
    actividad: row.actividad,
    provincias: row.provincias,
    radioKm: row.radioKm,
    tamanoContratosOrientativo: row.tamanoContratosOrientativo,
    capacidadOperativa: row.capacidadOperativa,
    experiencia: row.experiencia,
    certificacionesDeclaradas: row.certificacionesDeclaradas,
    preferencias: row.preferencias,
  };
}

export const profileRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const db = opts.db;

  app.get('/company-profile', async (request, reply) => {
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const [row] = await requireDb(db)
      .select()
      .from(companyProfiles)
      .where(eq(companyProfiles.organizationId, organizationId))
      .limit(1);
    if (!row) throw notFound('Aún no hay perfil de empresa. Crea uno con PATCH /company-profile.');
    return reply.send(toJson(row));
  });

  app.patch('/company-profile', async (request, reply) => {
    checkCsrf(request);
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const parsed = companyProfileSchema.safeParse(request.body);
    if (!parsed.success) {
      throw badRequest(parsed.error.issues[0]?.message ?? 'Perfil no válido.');
    }
    const input: CompanyProfileInput = parsed.data;
    const values = {
      actividad: input.actividad,
      provincias: input.provincias,
      radioKm: input.radioKm ?? null,
      tamanoContratosOrientativo: input.tamanoContratosOrientativo ?? null,
      capacidadOperativa: input.capacidadOperativa ?? null,
      experiencia: input.experiencia ?? null,
      certificacionesDeclaradas: input.certificacionesDeclaradas ?? [],
      preferencias: input.preferencias ?? null,
    };
    const updated = await requireDb(db).transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(companyProfiles)
        .where(eq(companyProfiles.organizationId, organizationId))
        .limit(1);
      let row: ProfileRow;
      if (!existing) {
        [row] = await tx
          .insert(companyProfiles)
          .values({ organizationId, ...values, version: 1, matchesRecalcPending: true })
          .returning();
      } else {
        const version = existing.version + 1;
        [row] = await tx
          .update(companyProfiles)
          .set({ ...values, version, matchesRecalcPending: true, updatedAt: new Date() })
          .where(eq(companyProfiles.id, existing.id))
          .returning();
      }
      await tx.insert(profileVersions).values({
        organizationId,
        profileId: row.id,
        version: row.version,
        data: snapshot(row),
        changedByUserId: ctx.user.id,
        changeReason: existing ? 'actualizacion_perfil' : 'creacion_perfil',
      });
      await tx.insert(auditLogs).values({
        organizationId,
        actorUserId: ctx.user.id,
        actorType: 'user',
        action: 'company_profile.updated',
        objectType: 'company_profile',
        objectId: row.id,
        details: { version: row.version },
      });
      return row;
    });
    return reply.send({
      ...toJson(updated),
      note: 'Perfil guardado. El recálculo de encaje con las licitaciones queda pendiente y lo ejecutará el worker (Fase C).',
    });
  });
};
