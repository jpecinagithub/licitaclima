// LicitaClima — facturación (Fase D, prompt §10).
// Stripe SOLO test y SOLO con configuración. Sin claves:
//   POST /billing/checkout → 503 {error:{code:'stripe_not_configured'}}
// El checkout NO activa acceso por redirect: la suscripción solo se activa
// por webhook verificado. El webhook verifica la firma con el raw body,
// persiste el evento (event_id único), encola su procesado y responde 200
// rápido; el worker (jobs/billing.ts) aplica el evento de forma idempotente
// y tolerante a duplicados y a eventos fuera de orden.
// Cancelar mantiene el acceso hasta el final del periodo pagado.
import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import type { Db } from '@licitaclima/db';
import { jobs, stripeEvents, subscriptions } from '@licitaclima/db';
import { PLAN } from '@licitaclima/config';
import {
  cancelSubscriptionAtPeriodEnd,
  createCheckoutSession,
  createPortalSession,
  isStripeConfigured,
  stripeStatus,
  verifyWebhookSignature,
} from '@licitaclima/integrations';
import type { RouteOptions } from './auth.js';
import { requireDb } from './auth.js';
import { authenticate, requireOrg } from '../lib/tenant.js';
import { checkCsrf } from '../lib/csrf.js';
import { ApiError, badRequest, conflict } from '../lib/errors.js';
import { getQuotaStatus } from '../lib/quotas.js';
import { getOrCreateSubscription, subscriptionToJson } from '../lib/billing.js';

function stripeUnavailable(): ApiError {
  const status = stripeStatus();
  if (status === 'live_blocked') {
    return new ApiError(503, 'stripe_live_not_allowed', 'Stripe en modo live no está permitido en este MVP (solo test).');
  }
  return new ApiError(503, 'stripe_not_configured', 'Stripe no configurado (PENDIENTE: faltan claves de test).');
}

export const billingRoutes: FastifyPluginAsync<RouteOptions> = async (app, opts) => {
  const db = opts.db;

  // Parser JSON propio de este plugin: guarda el cuerpo crudo para verificar
  // la firma del webhook (la firma se comprueba sobre el raw body, nunca
  // sobre el JSON ya parseado).
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    function (request, body, done) {
      (request as unknown as { rawBody: Buffer }).rawBody = body as Buffer;
      try {
        done(null, JSON.parse((body as Buffer).toString('utf8') || '{}'));
      } catch {
        done(new Error('JSON no válido.'), undefined);
      }
    },
  );

  app.get('/billing/subscription', async (request, reply) => {
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    const d = requireDb(db);
    const sub = await getOrCreateSubscription(d, organizationId);
    const quota = await getQuotaStatus(d, organizationId);
    return reply.send({
      subscription: subscriptionToJson(sub, { hasAccess: quota.hasAccess }),
      plan: {
        id: PLAN.id,
        name: PLAN.name,
        priceEurExclTax: PLAN.priceEurExclTax,
        currency: PLAN.currency,
        interval: PLAN.interval,
        maxPersonalizedAnalysesPerPeriod: PLAN.maxPersonalizedAnalysesPerPeriod,
        maxChatQuestionsPerPeriod: PLAN.maxChatQuestionsPerPeriod,
        graceDaysAfterFailedRenewal: PLAN.graceDaysAfterFailedRenewal,
      },
      quota: {
        periodStart: quota.periodStart.toISOString(),
        periodEnd: quota.periodEnd.toISOString(),
        analyses: quota.analyses,
        chat: quota.chat,
      },
      stripe: { status: stripeStatus() },
    });
  });

  app.post('/billing/checkout', async (request, reply) => {
    checkCsrf(request);
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    if (!isStripeConfigured()) throw stripeUnavailable();
    const d = requireDb(db);
    const sub = await getOrCreateSubscription(d, organizationId);
    if (sub.stripeSubscriptionId && (sub.status === 'active' || sub.status === 'canceled_at_period_end')) {
      throw conflict('Ya tienes una suscripción activa.', 'already_subscribed');
    }
    const webUrl = (process.env.WEB_PUBLIC_URL ?? 'http://localhost:5173').replace(/\/$/, '');
    const session = await createCheckoutSession({
      organizationId,
      email: ctx.user.email,
      successUrl: `${webUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${webUrl}/billing/cancelled`,
    });
    return reply.send({
      url: session.url,
      sessionId: session.sessionId,
      note: 'El acceso se activa solo cuando Stripe confirme el pago por webhook; la URL de éxito no activa acceso por sí sola.',
    });
  });

  app.post('/billing/portal', async (request, reply) => {
    checkCsrf(request);
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    if (!isStripeConfigured()) throw stripeUnavailable();
    const d = requireDb(db);
    const sub = await getOrCreateSubscription(d, organizationId);
    if (!sub.stripeCustomerId) {
      throw conflict('Aún no hay cliente de Stripe para esta organización.', 'no_customer');
    }
    const webUrl = (process.env.WEB_PUBLIC_URL ?? 'http://localhost:5173').replace(/\/$/, '');
    const session = await createPortalSession({
      customerId: sub.stripeCustomerId,
      returnUrl: `${webUrl}/billing/subscription`,
    });
    return reply.send({ url: session.url });
  });

  app.post('/billing/cancel', async (request, reply) => {
    checkCsrf(request);
    const ctx = await authenticate(request, requireDb(db));
    const { organizationId } = requireOrg(ctx);
    if (!isStripeConfigured()) throw stripeUnavailable();
    const d = requireDb(db);
    const sub = await getOrCreateSubscription(d, organizationId);
    if (!sub.stripeSubscriptionId || sub.status !== 'active') {
      throw conflict('No hay una suscripción activa que cancelar.', 'no_active_subscription');
    }
    await cancelSubscriptionAtPeriodEnd(sub.stripeSubscriptionId);
    await d
      .update(subscriptions)
      .set({ status: 'canceled_at_period_end', cancelAtPeriodEnd: true, updatedAt: new Date() })
      .where(eq(subscriptions.id, sub.id));
    return reply.send({
      ...subscriptionToJson({ ...sub, status: 'canceled_at_period_end', cancelAtPeriodEnd: true }),
      note: 'Cancelación al final del periodo pagado: mantienes el acceso hasta entonces.',
    });
  });

  app.post('/webhooks/stripe', async (request, reply) => {
    // Sin CSRF ni sesión: la autenticación es la firma de Stripe.
    const d = requireDb(db);
    if (!isStripeConfigured()) throw stripeUnavailable();
    const sigHeader = request.headers['stripe-signature'];
    const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
    const rawBody =
      (request as unknown as { rawBody?: Buffer }).rawBody ??
      Buffer.from(JSON.stringify(request.body ?? {}), 'utf8');
    let event;
    try {
      event = verifyWebhookSignature(rawBody, signature);
    } catch {
      throw badRequest('Firma de webhook de Stripe no válida.', 'invalid_signature');
    }
    // Persistir primero (event_id único: el duplicado no se reprocesa) y
    // encolar el procesado; la respuesta es rápida y el worker aplica.
    const [row] = await d
      .insert(stripeEvents)
      .values({ eventId: event.id, type: event.type, payload: event as unknown as Record<string, unknown> })
      .onConflictDoNothing()
      .returning({ id: stripeEvents.id });
    if (!row) {
      return reply.send({ received: true, duplicate: true });
    }
    await d
      .insert(jobs)
      .values({
        type: 'stripe_event',
        payload: { eventId: event.id },
        idempotencyKey: `stripe-event:${event.id}`,
      })
      .onConflictDoNothing();
    return reply.send({ received: true });
  });
};
