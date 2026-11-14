// LicitaClima — notificaciones, consentimientos y baja (Fase D, prompt §11).
// - La baja de marketing NO cancela comunicaciones de cuenta; desactivar
//   alertas NO cancela la suscripción (se comprueba en tests).
// - Doble confirmación para boletines (el alta queda 'pending' hasta que el
//   usuario confirme; aquí se registra el consentimiento y su versión).
// - Baja sencilla por enlace firmado (HMAC, sin token en BD).
// - El webhook de correo distingue aceptado por proveedor de entregado:
//   'sent' en outbox = aceptado; 'delivered' solo llega por email_events.
import type { FastifyPluginAsync } from 'fastify';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Db } from '@licitaclima/db';
import {
  consentEvents,
  emailEvents,
  emailOutbox,
  notificationPreferences,
  notifications,
} from '@licitaclima/db';
import {
  addSuppression,
  latestConsent,
  recordConsent,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from '@licitaclima/integrations';
import type { RouteOptions } from './auth.js';
import { requireDb } from './auth.js';
import { authenticate, requireOrg } from '../lib/tenant.js';
import { checkCsrf } from '../lib/csrf.js';
import { ApiError, badRequest, notFound } from '../lib/errors.js';
import {
  consentSchema,
  emailWebhookSchema,
  notificationPreferencesSchema,
} from '../lib/schemas.js';

function parseBody<T>(schema: { safeParse: (b: unknown) => { success: boolean; data?: T; error?: { issues: Array<{ message?: string }> } } }, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw badRequest(result.error?.issues[0]?.message ?? 'Petición no válida.');
  }
  return result.data as T;
}

export const notificationsRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const db = opts.db;

  app.get('/notifications', async (request, reply) => {
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const d = requireDb(db);
    const rows = await d
      .select()
      .from(notifications)
      .where(eq(notifications.organizationId, organizationId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    const [unread] = await d
      .select({ n: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.organizationId, organizationId), sql`${notifications.readAt} is null`));
    return reply.send({
      notifications: rows.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        tenderId: n.tenderId,
        readAt: n.readAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
      })),
      unread: Number(unread?.n ?? 0),
    });
  });

  app.patch('/notifications/:id/read', async (request, reply) => {
    checkCsrf(request);
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const d = requireDb(db);
    const [updated] = await d
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.id, (request.params as { id: string }).id),
          eq(notifications.organizationId, organizationId),
        ),
      )
      .returning();
    if (!updated) throw notFound('Notificación no encontrada.');
    return reply.send({ ok: true, readAt: updated.readAt?.toISOString() ?? null });
  });

  app.get('/notification-preferences', async (request, reply) => {
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const d = requireDb(db);
    const [row] = await d
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.organizationId, organizationId))
      .limit(1);
    return reply.send({
      serviceAlerts: row?.serviceAlerts ?? true,
      weeklyDigest: row?.weeklyDigest ?? true,
      note: 'Desactivar las alertas no cancela la suscripción.',
    });
  });

  app.patch('/notification-preferences', async (request, reply) => {
    checkCsrf(request);
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const body = parseBody(notificationPreferencesSchema, request.body);
    const d = requireDb(db);
    // Desactivar alertas no cancela la suscripción: solo se guarda la preferencia.
    await recordConsent(d, {
      organizationId,
      userId: ctx.user.id,
      email: ctx.user.email,
      purpose: 'service_alerts',
      granted: body.serviceAlerts,
      textVersion: 'preferencias-v1',
      source: 'notification-preferences',
    });
    const [row] = await d
      .insert(notificationPreferences)
      .values({ organizationId, serviceAlerts: body.serviceAlerts, weeklyDigest: body.weeklyDigest })
      .onConflictDoUpdate({
        target: notificationPreferences.organizationId,
        set: { serviceAlerts: body.serviceAlerts, weeklyDigest: body.weeklyDigest, updatedAt: new Date() },
      })
      .returning();
    return reply.send({
      serviceAlerts: row.serviceAlerts,
      weeklyDigest: row.weeklyDigest,
      note: 'Desactivar las alertas no cancela la suscripción.',
    });
  });

  app.post('/consents', async (request, reply) => {
    checkCsrf(request);
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const body = parseBody(consentSchema, request.body);
    const d = requireDb(db);
    // Doble confirmación para boletines: el alta se registra como solicitada;
    // el envío promocional exige además la confirmación (consentimiento
    // 'newsletter' concedido tras el correo de confirmación).
    const row = await recordConsent(d, {
      organizationId,
      userId: ctx.user.id,
      email: ctx.user.email,
      purpose: body.purpose,
      granted: body.granted,
      textVersion: body.textVersion,
      source: 'web',
    });
    return reply.code(201).send({
      id: row.id,
      purpose: row.purpose,
      granted: row.granted,
      textVersion: row.textVersion,
      createdAt: row.createdAt.toISOString(),
      doubleOptInRequired: body.purpose === 'newsletter' || body.purpose === 'marketing',
    });
  });

  app.get('/consents', async (request, reply) => {
    const ctx = await authenticate(request, requireDb(db));
    requireOrg(ctx);
    const d = requireDb(db);
    const purposes = ['marketing', 'newsletter', 'service_alerts', 'analytics'] as const;
    const result: Record<string, unknown> = {};
    for (const purpose of purposes) {
      result[purpose] = await latestConsent(d, ctx.user.email, purpose);
    }
    return reply.send({ consents: result });
  });

  // Baja sencilla por enlace firmado (sin autenticación: el enlace lleva la firma).
  app.get('/notifications/unsubscribe', async (request, reply) => {
    const token = (request.query as Record<string, unknown> | undefined)?.token;
    if (typeof token !== 'string' || !token) throw badRequest('Falta el token de baja.');
    let verified;
    try {
      verified = verifyUnsubscribeToken(token);
    } catch {
      throw badRequest('Enlace de baja no válido.');
    }
    if (!verified) throw badRequest('Enlace de baja no válido.');
    const d = requireDb(db);
    await recordConsent(d, {
      email: verified.email,
      purpose: verified.purpose,
      granted: false,
      textVersion: 'unsubscribe-link-v1',
      source: 'unsubscribe-link',
    });
    return reply.send({
      ok: true,
      message:
        'Te has dado de baja de los correos de marketing. Seguirás recibiendo las comunicaciones necesarias de tu cuenta.',
    });
  });

  // Generador del enlace de baja (sesión autenticada; la firma no viaja por correo aquí).
  app.get('/notifications/unsubscribe-link', async (request, reply) => {
    const ctx = await authenticate(request, requireDb(db));
    requireOrg(ctx);
    let token: string;
    try {
      token = signUnsubscribeToken(ctx.user.email, 'marketing');
    } catch {
      throw new ApiError(503, 'config_missing', 'Falta la clave para firmar la baja.');
    }
    return reply.send({ token });
  });

  // Webhook del proveedor de correo (rebotes, quejas, entregas).
  // Sin proveedor configurado responde 503: no hay secreto de webhook que verificar.
  app.post('/webhooks/email', async (request, reply) => {
    const d = requireDb(db);
    if ((process.env.EMAIL_PROVIDER ?? 'none').trim().toLowerCase() === 'none') {
      throw new ApiError(503, 'email_not_configured', 'Correo sin proveedor configurado (PENDIENTE).');
    }
    const body = parseBody(emailWebhookSchema, request.body);
    const [event] = await d
      .insert(emailEvents)
      .values({
        outboxId: body.outboxId ?? null,
        email: body.email,
        eventType: body.eventType,
        providerEventId: body.providerEventId ?? null,
        payload: body as unknown as Record<string, unknown>,
      })
      .onConflictDoNothing()
      .returning();
    if (!event) return reply.send({ received: true, duplicate: true });
    if (body.eventType === 'bounced' || body.eventType === 'complained') {
      // Supresión automática: un rebote/queja bloquea futuros envíos a ese correo.
      await addSuppression(d, { email: body.email, channel: 'email', reason: body.eventType });
    }
    return reply.send({ received: true });
  });

  // Exposición de lectura del outbox propio (para depuración del cliente).
  app.get('/notifications/outbox', async (request, reply) => {
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const rows = await requireDb(db)
      .select()
      .from(emailOutbox)
      .where(eq(emailOutbox.organizationId, organizationId))
      .orderBy(desc(emailOutbox.createdAt))
      .limit(50);
    return reply.send({
      outbox: rows.map((r) => ({
        id: r.id,
        templateKey: r.templateKey,
        subject: r.subject,
        category: r.category,
        status: r.status,
        attempts: r.attempts,
        sentAt: r.sentAt?.toISOString() ?? null,
        providerMessageId: r.providerMessageId,
      })),
    });
  });
};
