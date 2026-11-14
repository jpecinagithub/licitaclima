// LicitaClima — helpers de facturación de la API (Fase D).
// La suscripción local es la única fuente de acceso: se crea en 'free' al
// primer acceso y solo pasa a 'active' por webhook verificado de Stripe o
// reconciliación. La URL de éxito del Checkout nunca activa acceso.
import { eq } from 'drizzle-orm';
import type { Db } from '@licitaclima/db';
import { subscriptions } from '@licitaclima/db';
import { ensurePlan } from '@licitaclima/integrations';

export async function getOrCreateSubscription(db: Db, organizationId: string) {
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);
  if (existing) return existing;
  const plan = await ensurePlan(db);
  if (!plan) throw new Error('No se pudo crear el plan base.');
  const [created] = await db
    .insert(subscriptions)
    .values({ organizationId, planId: plan.id, status: 'free' })
    .returning();
  return created;
}

export function subscriptionToJson(
  sub: typeof subscriptions.$inferSelect,
  extra?: Record<string, unknown>,
) {
  return {
    organizationId: sub.organizationId,
    status: sub.status,
    stripeCustomerId: sub.stripeCustomerId,
    stripeSubscriptionId: sub.stripeSubscriptionId,
    currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    canceledAt: sub.canceledAt?.toISOString() ?? null,
    ...(extra ?? {}),
  };
}
