// LicitaClima — panel de administración (Fase D+E, prompt §12).
// - Todo acceso admin queda auditado (audit_logs: actor, acción, objeto, fecha).
// - Finanzas: MRR SIN impuestos; no se confunde margen con beneficio neto;
//   LTV solo como estimación y null con muestra insuficiente (<10 clientes de pago).
// - Embudo: los datos ausentes se muestran como N/D (value null, available false).
// - Botones de pausa en system_settings (pausar captación/campañas/nuevos
//   análisis/envíos no esenciales) SIN bloquear acceso ni cancelación.
// - Reembolsos y disputas se registran y escalan; no hay reembolso automático.
// - SLA interno de soporte: primera respuesta en 48 h.
import type { FastifyPluginAsync } from 'fastify';
import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '@licitaclima/db';
import {
  auditLogs,
  companyProfiles,
  consentEvents,
  emailEvents,
  emailOutbox,
  genericAnalyses,
  ingestionRuns,
  jobs,
  leads,
  matches,
  messages,
  notificationPreferences,
  organizations,
  personalizedAnalyses,
  plans,
  requirementEvidence,
  sources,
  stripeEvents,
  subscriptions,
  supportTickets,
  systemSettings,

} from '@licitaclima/db';
import { PLAN } from '@licitaclima/config';
import { emailProviderStatus, stripeStatus } from '@licitaclima/integrations';
import type { RouteOptions } from './auth.js';
import { requireDb } from './auth.js';
import { authenticate, requireAdmin, requireRecentMfa, type SessionContext } from '../lib/tenant.js';
import { checkCsrf } from '../lib/csrf.js';
import { badRequest, notFound } from '../lib/errors.js';
import { adminSettingsSchema, supportMessageSchema, supportTicketStatusSchema } from '../lib/schemas.js';
import { getQuotaStatus } from '../lib/quotas.js';

const SLA_FIRST_RESPONSE_HOURS = 48;
const LTV_MIN_PAYING_CUSTOMERS = 10;

async function auditAdmin(
  db: Db,
  ctx: SessionContext,
  action: string,
  objectType: string,
  objectId: string | null,
  details?: Record<string, unknown>,
) {
  await db.insert(auditLogs).values({
    organizationId: null,
    actorUserId: ctx.user.id,
    actorType: 'admin',
    action,
    objectType,
    objectId,
    details: details ?? null,
  });
}

async function requireAdminCtx(request: import('fastify').FastifyRequest, db: Db): Promise<SessionContext> {
  const ctx = requireAdmin(await authenticate(request, db));
  return ctx;
}

const PAUSE_KEYS = ['pause.capture', 'pause.campaigns', 'pause.new_analyses', 'pause.non_essential_emails'] as const;
const LIMIT_KEYS = ['limits.max_analyses', 'limits.max_chat'] as const;

function settingValue(key: string, rows: Array<typeof systemSettings.$inferSelect>): unknown {
  const row = rows.find((r) => r.key === key);
  return row?.value ?? null;
}

export const adminRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const db = opts.db;

  app.get('/admin/summary', async (request, reply) => {
    const ctx = await requireAdminCtx(request, requireDb(db));
    const d = requireDb(db);
    await auditAdmin(d, ctx, 'admin.summary.viewed', 'admin_dashboard', null);
    const [active] = await d
      .select({ n: count() })
      .from(subscriptions)
      .where(sql`${subscriptions.status} in ('active', 'canceled_at_period_end')`);
    const [planRow] = await d.select().from(plans).where(eq(plans.active, true)).limit(1);
    const price = planRow ? Number(planRow.priceAmount) : PLAN.priceEurExclTax;
    const activeCount = Number(active?.n ?? 0);
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [created30d] = await d
      .select({ n: count() })
      .from(subscriptions)
      .where(gte(subscriptions.createdAt, since30d));
    const [ended30d] = await d
      .select({ n: count() })
      .from(subscriptions)
      .where(and(eq(subscriptions.status, 'ended'), gte(subscriptions.updatedAt, since30d)));
    const [openTickets] = await d
      .select({ n: count() })
      .from(supportTickets)
      .where(eq(supportTickets.status, 'open'));
    const [pendingOutbox] = await d
      .select({ n: count() })
      .from(emailOutbox)
      .where(eq(emailOutbox.status, 'pending'));
    const [failedJobs] = await d
      .select({ n: count() })
      .from(jobs)
      .where(eq(jobs.status, 'failed'));
    const ended = Number(ended30d?.n ?? 0);
    const denominator = activeCount + ended;
    return reply.send({
      activeCustomers: activeCount,
      mrrEurExclTax: activeCount * price,
      newSubscriptions30d: Number(created30d?.n ?? 0),
      churn30d: {
        ended,
        denominator,
        rate: denominator > 0 ? ended / denominator : null,
        note: 'Periodo 30 días; denominador = activos + bajas del periodo.',
      },
      openTickets: Number(openTickets?.n ?? 0),
      pendingOutbox: Number(pendingOutbox?.n ?? 0),
      failedJobs: Number(failedJobs?.n ?? 0),
    });
  });

  app.get('/admin/funnel', async (request, reply) => {
    const ctx = await requireAdminCtx(request, requireDb(db));
    const d = requireDb(db);
    await auditAdmin(d, ctx, 'admin.funnel.viewed', 'admin_dashboard', null);
    const [leadRows] = await d.select({ n: count() }).from(leads);
    const [verifiedRows] = await d
      .select({ n: count() })
      .from(leads)
      .where(sql`${leads.verifiedAt} is not null`);
    const [profileRows] = await d.select({ n: count() }).from(companyProfiles);
    const [checkoutRows] = await d
      .select({ n: count() })
      .from(stripeEvents)
      .where(eq(stripeEvents.type, 'checkout.session.completed'));
    const [paidRows] = await d
      .select({ n: count() })
      .from(stripeEvents)
      .where(eq(stripeEvents.type, 'invoice.paid'));
    const step = (value: number | null) => ({ value, available: value !== null });
    return reply.send({
      funnel: {
        // Sin analítica web configurada: visitas = N/D, no un 0 inventado.
        visits: step(null),
        samples: step(null),
        leads: step(Number(leadRows?.n ?? 0)),
        verifiedEmails: step(Number(verifiedRows?.n ?? 0)),
        completedProfiles: step(Number(profileRows?.n ?? 0)),
        checkouts: step(Number(checkoutRows?.n ?? 0)),
        payments: step(Number(paidRows?.n ?? 0)),
      },
      note: 'Visitas y muestras: N/D hasta configurar analítica (sin inventar cifras).',
    });
  });

  app.get('/admin/finance', async (request, reply) => {
    const ctx = await requireAdminCtx(request, requireDb(db));
    const d = requireDb(db);
    await auditAdmin(d, ctx, 'admin.finance.viewed', 'admin_dashboard', null);
    const [active] = await d
      .select({ n: count() })
      .from(subscriptions)
      .where(sql`${subscriptions.status} in ('active', 'canceled_at_period_end')`);
    const [planRow] = await d.select().from(plans).where(eq(plans.active, true)).limit(1);
    const price = planRow ? Number(planRow.priceAmount) : PLAN.priceEurExclTax;
    const activeCount = Number(active?.n ?? 0);
    const mrr = activeCount * price;
    const refundEvents = await d
      .select()
      .from(stripeEvents)
      .where(eq(stripeEvents.type, 'charge.refunded'));
    let refundsEur = 0;
    for (const e of refundEvents) {
      const obj = (e.payload as { data?: { object?: { amount_refunded?: number } } })?.data?.object;
      refundsEur += (obj?.amount_refunded ?? 0) / 100;
    }
    const [disputes] = await d
      .select({ n: count() })
      .from(stripeEvents)
      .where(eq(stripeEvents.type, 'charge.dispute.created'));
    return reply.send({
      mrrEurExclTax: mrr,
      refundsEur,
      refundsCount: refundEvents.length,
      disputesCount: Number(disputes?.n ?? 0),
      // Las comisiones de Stripe NO se codifican como constantes históricas:
      // sin datos de Stripe configurado, N/D.
      stripeFeesEur: null,
      stripeFeesNote: 'N/D: sin Stripe configurado; las comisiones se conciliarán desde Stripe, no desde tarifas memorizadas.',
      costs: {
        llmEur: null,
        emailEur: null,
        adsEur: null,
        note: 'N/D: costes por proveedor pendientes de facturación real.',
      },
      contributionEstimateEur: mrr - refundsEur,
      contributionNote: 'Contribución estimada (MRR sin impuestos menos reembolsos). NO es beneficio neto: faltan comisiones, costes de IA/correo y gastos operativos.',
      ltvEur: null,
      ltvNote:
        activeCount < LTV_MIN_PAYING_CUSTOMERS
          ? `Muestra insuficiente (${activeCount} clientes de pago): el LTV es solo una estimación y no se muestra como dato fiable.`
          : 'LTV estimado (sin cálculo fiable con la muestra actual).',
      payingCustomers: activeCount,
    });
  });

  app.get('/admin/customers', async (request, reply) => {
    const ctx = await requireAdminCtx(request, requireDb(db));
    const d = requireDb(db);
    await auditAdmin(d, ctx, 'admin.customers.viewed', 'admin_dashboard', null);
    const orgs = await d.select().from(organizations).orderBy(desc(organizations.createdAt)).limit(100);
    const customers = [];
    for (const org of orgs) {
      const [sub] = await d.select().from(subscriptions).where(eq(subscriptions.organizationId, org.id)).limit(1);
      const quota = await getQuotaStatus(d, org.id);
      const [open] = await d
        .select({ n: count() })
        .from(supportTickets)
        .where(and(eq(supportTickets.organizationId, org.id), eq(supportTickets.status, 'open')));
      customers.push({
        organizationId: org.id,
        name: org.name,
        slug: org.slug,
        status: org.status,
        subscriptionStatus: sub?.status ?? 'free',
        analysesUsed: quota.analyses.used,
        analysesLimit: quota.analyses.limit,
        chatUsed: quota.chat.used,
        chatLimit: quota.chat.limit,
        openTickets: Number(open?.n ?? 0),
      });
    }
    return reply.send({ customers });
  });

  app.get('/admin/customers/:id', async (request, reply) => {
    const ctx = await requireAdminCtx(request, requireDb(db));
    const d = requireDb(db);
    const orgId = (request.params as { id: string }).id;
    const [org] = await d.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) throw notFound('Organización no encontrada.');
    // Acceso a datos privados de un cliente: queda auditado.
    await auditAdmin(d, ctx, 'admin.customer.viewed', 'organization', org.id, { name: org.name });
    const [sub] = await d.select().from(subscriptions).where(eq(subscriptions.organizationId, org.id)).limit(1);
    const quota = await getQuotaStatus(d, org.id);
    const [profile] = await d
      .select()
      .from(companyProfiles)
      .where(eq(companyProfiles.organizationId, org.id))
      .limit(1);
    const tickets = await d
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.organizationId, org.id))
      .orderBy(desc(supportTickets.createdAt))
      .limit(20);
    const prefs = await d
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.organizationId, org.id))
      .limit(1);
    return reply.send({
      organization: { id: org.id, name: org.name, slug: org.slug, status: org.status },
      subscriptionStatus: sub?.status ?? 'free',
      quota,
      profile: profile
        ? { actividad: profile.actividad, provincias: profile.provincias, version: profile.version }
        : null,
      notificationPreferences: prefs[0]
        ? { serviceAlerts: prefs[0].serviceAlerts, weeklyDigest: prefs[0].weeklyDigest }
        : { serviceAlerts: true, weeklyDigest: true },
      tickets: tickets.map((t) => ({ id: t.id, subject: t.subject, status: t.status, priority: t.priority })),
    });
  });

  app.get('/admin/quality', async (request, reply) => {
    const ctx = await requireAdminCtx(request, requireDb(db));
    const d = requireDb(db);
    await auditAdmin(d, ctx, 'admin.quality.viewed', 'admin_dashboard', null);
    const analysesByStatus = await d
      .select({ status: genericAnalyses.status, n: count() })
      .from(genericAnalyses)
      .groupBy(genericAnalyses.status);
    const [noEvidence] = await d
      .select({ n: count() })
      .from(requirementEvidence)
      .where(sql`${requirementEvidence.evidence} is null`);
    const [failedPersonal] = await d
      .select({ n: count() })
      .from(personalizedAnalyses)
      .where(eq(personalizedAnalyses.status, 'failed'));
    const [blocking] = await d
      .select({ n: count() })
      .from(matches)
      .where(eq(matches.blocking, true));
    return reply.send({
      genericAnalysesByStatus: analysesByStatus.map((r) => ({ status: r.status, count: Number(r.n) })),
      requirementsWithoutEvidence: Number(noEvidence?.n ?? 0),
      failedPersonalizedAnalyses: Number(failedPersonal?.n ?? 0),
      blockingMatches: Number(blocking?.n ?? 0),
      note: 'La revisión humana por muestreo no está implementada: ningún segundo modelo sustituye la auditoría humana.',
    });
  });

  app.get('/admin/sources', async (request, reply) => {
    const ctx = await requireAdminCtx(request, requireDb(db));
    const d = requireDb(db);
    await auditAdmin(d, ctx, 'admin.sources.viewed', 'admin_dashboard', null);
    const allSources = await d.select().from(sources);
    const runs = await d.select().from(ingestionRuns).orderBy(desc(ingestionRuns.createdAt)).limit(20);
    const jobsByStatus = await d.select({ status: jobs.status, n: count() }).from(jobs).groupBy(jobs.status);
    return reply.send({
      sources: allSources.map((s) => {
        const last = runs.find((r) => r.sourceId === s.id);
        return {
          id: s.id,
          key: s.key,
          name: s.name,
          url: s.url,
          lastRunAt: last?.startedAt.toISOString() ?? null,
          lastRunStatus: last?.status ?? null,
        };
      }),
      recentRuns: runs.slice(0, 5).map((r) => ({
        id: r.id,
        sourceId: r.sourceId,
        status: r.status,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
        entriesNew: r.entriesNew,
        entriesSeen: r.entriesSeen,
      })),
      jobsByStatus: jobsByStatus.map((r) => ({ status: r.status, count: Number(r.n) })),
    });
  });

  app.get('/admin/comms', async (request, reply) => {
    const ctx = await requireAdminCtx(request, requireDb(db));
    const d = requireDb(db);
    await auditAdmin(d, ctx, 'admin.comms.viewed', 'admin_dashboard', null);
    const outboxByStatus = await d
      .select({ status: emailOutbox.status, n: count() })
      .from(emailOutbox)
      .groupBy(emailOutbox.status);
    const eventsByType = await d
      .select({ eventType: emailEvents.eventType, n: count() })
      .from(emailEvents)
      .groupBy(emailEvents.eventType);
    const [suppressions] = await d.select({ n: count() }).from(emailOutbox).where(eq(emailOutbox.status, 'suppressed'));
    const consentsByPurpose = await d
      .select({ purpose: consentEvents.purpose, granted: consentEvents.granted, n: count() })
      .from(consentEvents)
      .groupBy(consentEvents.purpose, consentEvents.granted);
    return reply.send({
      outboxByStatus: outboxByStatus.map((r) => ({ status: r.status, count: Number(r.n) })),
      emailEventsByType: eventsByType.map((r) => ({ eventType: r.eventType, count: Number(r.n) })),
      suppressedOutbox: Number(suppressions?.n ?? 0),
      consents: consentsByPurpose.map((r) => ({ purpose: r.purpose, granted: r.granted, count: Number(r.n) })),
      emailProvider: emailProviderStatus(),
    });
  });

  app.get('/admin/support', async (request, reply) => {
    const ctx = await requireAdminCtx(request, requireDb(db));
    const d = requireDb(db);
    await auditAdmin(d, ctx, 'admin.support.viewed', 'admin_dashboard', null);
    const byStatus = await d
      .select({ status: supportTickets.status, n: count() })
      .from(supportTickets)
      .groupBy(supportTickets.status);
    const byPriority = await d
      .select({ priority: supportTickets.priority, n: count() })
      .from(supportTickets)
      .groupBy(supportTickets.priority);
    const slaCutoff = new Date(Date.now() - SLA_FIRST_RESPONSE_HOURS * 60 * 60 * 1000);
    const [slaBreaches] = await d
      .select({ n: count() })
      .from(supportTickets)
      .where(and(eq(supportTickets.status, 'open'), sql`${supportTickets.createdAt} < ${slaCutoff}`));
    const [urgent] = await d
      .select({ n: count() })
      .from(supportTickets)
      .where(and(eq(supportTickets.priority, 'urgent'), eq(supportTickets.status, 'open')));
    return reply.send({
      byStatus: byStatus.map((r) => ({ status: r.status, count: Number(r.n) })),
      byPriority: byPriority.map((r) => ({ priority: r.priority, count: Number(r.n) })),
      slaFirstResponseHours: SLA_FIRST_RESPONSE_HOURS,
      slaBreachesOpen: Number(slaBreaches?.n ?? 0),
      urgentOpen: Number(urgent?.n ?? 0),
    });
  });

  app.get('/admin/settings', async (request, reply) => {
    const ctx = await requireAdminCtx(request, requireDb(db));
    const d = requireDb(db);
    await auditAdmin(d, ctx, 'admin.settings.viewed', 'admin_dashboard', null);
    const rows = await d.select().from(systemSettings);
    const pauses: Record<string, boolean> = {};
    for (const key of PAUSE_KEYS) {
      pauses[key] = (settingValue(key, rows) as { paused?: boolean } | null)?.paused === true;
    }
    return reply.send({
      pauses,
      limits: {
        maxAnalyses: (settingValue('limits.max_analyses', rows) as { value?: number } | null)?.value ?? PLAN.maxPersonalizedAnalysesPerPeriod,
        maxChat: (settingValue('limits.max_chat', rows) as { value?: number } | null)?.value ?? PLAN.maxChatQuestionsPerPeriod,
      },
      plan: {
        id: PLAN.id,
        priceEurExclTax: PLAN.priceEurExclTax,
        graceDaysAfterFailedRenewal: PLAN.graceDaysAfterFailedRenewal,
      },
      stripe: stripeStatus(),
      email: emailProviderStatus(),
      note: 'Las pausas no bloquean acceso, cancelación ni operaciones de seguridad.',
    });
  });

  app.patch('/admin/settings', async (request, reply) => {
    checkCsrf(request);
    const ctx = requireRecentMfa(await requireAdminCtx(request, requireDb(db)));
    const parsed = adminSettingsSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Petición no válida.');
    const { key, value } = parsed.data;
    const isPause = (PAUSE_KEYS as readonly string[]).includes(key);
    const isLimit = (LIMIT_KEYS as readonly string[]).includes(key);
    if (!isPause && !isLimit) throw badRequest(`Clave de configuración no permitida: ${key}`);
    if (isPause) {
      const v = value as { paused?: unknown };
      if (typeof v !== 'object' || v === null || typeof v.paused !== 'boolean') {
        throw badRequest('El valor de una pausa debe ser { paused: boolean }.');
      }
    }
    if (isLimit) {
      const v = value as { value?: unknown };
      if (typeof v !== 'object' || v === null || typeof v.value !== 'number' || !Number.isInteger(v.value) || (v.value as number) < 1 || (v.value as number) > 1000) {
        throw badRequest('El valor de un límite debe ser { value: entero entre 1 y 1000 }.');
      }
    }
    const d = requireDb(db);
    const [row] = await d
      .insert(systemSettings)
      .values({ key, value: value as Record<string, unknown>, updatedByUserId: ctx.user.id })
      .onConflictDoUpdate({
        target: systemSettings.key,
        set: { value: value as Record<string, unknown>, updatedByUserId: ctx.user.id, updatedAt: new Date() },
      })
      .returning();
    await auditAdmin(d, ctx, 'admin.settings.updated', 'system_settings', row.id, { key, value });
    return reply.send({ key: row.key, value: row.value });
  });

  app.get('/admin/audit', async (request, reply) => {
    const ctx = await requireAdminCtx(request, requireDb(db));
    const d = requireDb(db);
    await auditAdmin(d, ctx, 'admin.audit.viewed', 'admin_dashboard', null);
    const q = (request.query ?? {}) as Record<string, unknown>;
    const limit = Math.min(100, Math.max(1, Number(q.limit ?? 50) || 50));
    const action = typeof q.action === 'string' ? q.action : null;
    const rows = action
      ? await d.select().from(auditLogs).where(eq(auditLogs.action, action)).orderBy(desc(auditLogs.createdAt)).limit(limit)
      : await d.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
    return reply.send({
      audit: rows.map((r) => ({
        id: r.id,
        actorUserId: r.actorUserId,
        actorType: r.actorType,
        action: r.action,
        objectType: r.objectType,
        objectId: r.objectId,
        details: r.details,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  });

  app.get('/admin/health', async (request, reply) => {
    const ctx = await requireAdminCtx(request, requireDb(db));
    const d = requireDb(db);
    await auditAdmin(d, ctx, 'admin.health.viewed', 'admin_dashboard', null);
    let dbStatus = 'ok';
    try {
      await d.execute('select 1');
    } catch {
      dbStatus = 'error';
    }
    return reply.send({
      db: dbStatus,
      stripe: stripeStatus(),
      email: emailProviderStatus(),
      llm: 'none',
      note: 'stripe/email en pending = PENDIENTE de configuración, no operativos.',
    });
  });

  app.post('/admin/support/tickets/:id/messages', async (request, reply) => {
    checkCsrf(request);
    const ctx = await requireAdminCtx(request, requireDb(db));
    const parsed = supportMessageSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Petición no válida.');
    const d = requireDb(db);
    const ticketId = (request.params as { id: string }).id;
    const [ticket] = await d.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
    if (!ticket) throw notFound('Ticket no encontrado.');
    if (!ticket.conversationId) throw badRequest('El ticket no tiene conversación asociada.');
    // REGLA: la respuesta del agente no promete compensaciones ni modifica
    // datos sensibles desde texto libre. El mensaje se registra como texto
    // manual del administrador (con auditoría) y NO dispara ninguna acción
    // automática: no hay efecto ligado al contenido del mensaje.
    const [msg] = await d
      .insert(messages)
      .values({
        conversationId: ticket.conversationId,
        organizationId: ticket.organizationId,
        role: 'assistant',
        content: parsed.data.message,
      })
      .returning();
    await d
      .update(supportTickets)
      .set({ status: 'pending', updatedAt: new Date() })
      .where(eq(supportTickets.id, ticket.id));
    await auditAdmin(d, ctx, 'admin.support.replied', 'support_ticket', ticket.id);
    return reply.code(201).send({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
    });
  });

  app.post('/admin/support/tickets/:id/status', async (request, reply) => {
    checkCsrf(request);
    const ctx = await requireAdminCtx(request, requireDb(db));
    const parsed = supportTicketStatusSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? 'Petición no válida.');
    const d = requireDb(db);
    const ticketId = (request.params as { id: string }).id;
    const [ticket] = await d.select().from(supportTickets).where(eq(supportTickets.id, ticketId)).limit(1);
    if (!ticket) throw notFound('Ticket no encontrado.');
    const [updated] = await d
      .update(supportTickets)
      .set({ status: parsed.data.status, updatedAt: new Date() })
      .where(eq(supportTickets.id, ticket.id))
      .returning();
    await auditAdmin(d, ctx, 'admin.support.status_changed', 'support_ticket', ticket.id, {
      status: parsed.data.status,
    });
    return reply.send({
      id: updated.id,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
    });
  });
};
