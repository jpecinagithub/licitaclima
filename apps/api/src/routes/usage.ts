// LicitaClima — cuota (Fase D, prompt §5).
// Reserva al iniciar, confirma al entregar, libera si falla. Revisitar un
// análisis o una rectificación oficial del mismo expediente NO consume:
// si `referenceId` es el expediente de un análisis ya terminado, la reserva
// se omite y se devuelve el análisis existente.
import type { FastifyPluginAsync } from 'fastify';
import type { RouteOptions } from './auth.js';
import { requireDb } from './auth.js';
import { authenticate, requireOrg } from '../lib/tenant.js';
import { checkCsrf } from '../lib/csrf.js';
import { badRequest } from '../lib/errors.js';
import { usageReserveSchema, usageSettleSchema } from '../lib/schemas.js';
import { confirmQuota, getQuotaStatus, releaseQuota, reserveQuota, shouldConsumeForAnalysis } from '../lib/quotas.js';

export const usageRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const db = opts.db;

  app.get('/usage', async (request, reply) => {
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const quota = await getQuotaStatus(requireDb(db), organizationId);
    return reply.send({
      subscriptionStatus: quota.subscriptionStatus,
      hasAccess: quota.hasAccess,
      periodStart: quota.periodStart.toISOString(),
      periodEnd: quota.periodEnd.toISOString(),
      analyses: quota.analyses,
      chat: quota.chat,
    });
  });

  app.post('/usage/reserve', async (request, reply) => {
    checkCsrf(request);
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const parsed = usageReserveSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Petición no válida.');
    const d = requireDb(db);
    // Revisita / rectificación: no consume.
    if (parsed.data.kind === 'personalized_analysis' && parsed.data.referenceId) {
      const reuse = await shouldConsumeForAnalysis(d, {
        organizationId,
        tenderId: parsed.data.referenceId,
      });
      if (!reuse.consume) {
        const quota = await getQuotaStatus(d, organizationId);
        return reply.send({
          consumed: false,
          reason: reuse.reason,
          existingAnalysisId: reuse.existingAnalysisId,
          remaining: quota.analyses.remaining,
        });
      }
    }
    const result = await reserveQuota(d, {
      organizationId,
      kind: parsed.data.kind,
      referenceId: parsed.data.referenceId ?? null,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    return reply.send({ consumed: true, ...result, remaining: result.remaining });
  });

  app.post('/usage/confirm', async (request, reply) => {
    checkCsrf(request);
    const ctx = await authenticate(request, requireDb(db));
    requireOrg(ctx);
    const parsed = usageSettleSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Petición no válida.');
    const confirmed = await confirmQuota(requireDb(db), parsed.data.reserveIdempotencyKey);
    return reply.send({ ok: true, confirmed });
  });

  app.post('/usage/release', async (request, reply) => {
    checkCsrf(request);
    const ctx = await authenticate(request, requireDb(db));
    requireOrg(ctx);
    const parsed = usageSettleSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Petición no válida.');
    const released = await releaseQuota(requireDb(db), parsed.data.reserveIdempotencyKey);
    return reply.send({ ok: true, released });
  });
};
