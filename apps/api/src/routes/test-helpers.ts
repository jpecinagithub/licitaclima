// Helpers de tests HTTP (Fase D). Cada fichero crea su propia BD de test.
import { authenticator } from 'otplib';
import { eq } from 'drizzle-orm';
import type { Db } from '@licitaclima/db';
import { organizations, subscriptions } from '@licitaclima/db';
import { ensurePlan } from '@licitaclima/integrations';
import { buildServer } from '../server.js';
import { requestMagicLink } from '../lib/auth.js';
import { createAdmin } from '../lib/admin.js';

export type TestApp = ReturnType<typeof buildServer>;

export function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const setCookie = res.headers['set-cookie'];
  const first = Array.isArray(setCookie) ? setCookie[0] : (setCookie as string | undefined);
  return first?.split(';')[0] ?? '';
}

/** Login de cliente por magic link. Devuelve cookie y organización creada. */
export async function loginAs(
  app: TestApp,
  db: Db,
  email: string,
): Promise<{ cookie: string; organizationId: string; userId: string }> {
  const { token } = await requestMagicLink(db, { email });
  const res = await app.inject({ method: 'POST', url: '/api/v1/auth/consume-link', payload: { token } });
  if (res.statusCode !== 200) throw new Error(`loginAs falló (${res.statusCode}): ${res.body}`);
  const body = res.json() as { organization: { id: string }; user: { id: string } };
  return { cookie: cookieFrom(res), organizationId: body.organization.id, userId: body.user.id };
}

/** Login de administrador (contraseña + TOTP). La sesión no tiene organización. */
export async function loginAdminAs(
  app: TestApp,
  db: Db,
  email: string,
): Promise<{ cookie: string; userId: string }> {
  const password = 'contraseña-admin-123';
  const created = await createAdmin(db, { email, password });
  const code = authenticator.generate(created.totpSecret);
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/admin/login',
    payload: { email, password, totpCode: code },
  });
  if (res.statusCode !== 200) throw new Error(`loginAdminAs falló (${res.statusCode}): ${res.body}`);
  return { cookie: cookieFrom(res), userId: created.user.id };
}

/** Suscripción activa con periodo vigente (para probar cuotas y facturación). */
export async function makeActiveSubscription(
  db: Db,
  organizationId: string,
  overrides: Partial<{ status: string; periodStart: Date; periodEnd: Date }> = {},
) {
  const plan = await ensurePlan(db);
  if (!plan) throw new Error('ensurePlan falló');
  const now = new Date();
  const [sub] = await db
    .insert(subscriptions)
    .values({
      organizationId,
      planId: plan.id,
      stripeCustomerId: `cus_test_${organizationId.slice(0, 8)}`,
      stripeSubscriptionId: `sub_test_${organizationId.slice(0, 8)}`,
      status: overrides.status ?? 'active',
      currentPeriodStart: overrides.periodStart ?? new Date(now.getTime() - 24 * 60 * 60 * 1000),
      currentPeriodEnd: overrides.periodEnd ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    })
    .onConflictDoNothing()
    .returning();
  if (sub) return sub;
  const [existing] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);
  return existing;
}

export async function orgName(db: Db, organizationId: string): Promise<string | null> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  return org?.name ?? null;
}
