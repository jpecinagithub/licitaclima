import type { FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import type { Db } from '@licitaclima/db';
import { memberships, sessions, users } from '@licitaclima/db';
import { forbidden, unauthorized } from './errors.js';
import { SESSION_COOKIE, findSessionByToken } from './sessions.js';

export interface SessionContext {
  session: typeof sessions.$inferSelect;
  user: typeof users.$inferSelect;
  /** NULL en administradores (no pertenecen a ningún tenant). */
  organizationId: string | null;
  membershipRole: string | null;
  isAdmin: boolean;
}

/**
 * Autentica por cookie de sesión opaca. No confía en ningún identificador
 * que venga del cliente: la organización se deriva de la sesión en BD.
 */
export async function authenticate(request: FastifyRequest, db: Db): Promise<SessionContext> {
  const token = request.cookies?.[SESSION_COOKIE];
  if (!token) throw unauthorized();
  const session = await findSessionByToken(db, token);
  if (!session) throw unauthorized();
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user) throw unauthorized();
  let membershipRole: string | null = null;
  if (session.organizationId) {
    const [m] = await db
      .select()
      .from(memberships)
      .where(eq(memberships.userId, user.id))
      .limit(1);
    membershipRole = m?.role ?? null;
  }
  return {
    session,
    user,
    organizationId: session.organizationId,
    membershipRole,
    isAdmin: user.role === 'admin' || user.role === 'owner',
  };
}

/**
 * Exige contexto de tenant. Los administradores (sin organización) no pasan:
 * nunca operan sobre datos de clientes desde una ruta de tenant.
 */
export function requireOrg(ctx: SessionContext): { organizationId: string; membershipRole: string } {
  if (!ctx.organizationId) throw forbidden('Esta ruta requiere una organización cliente.');
  return { organizationId: ctx.organizationId, membershipRole: ctx.membershipRole ?? 'miembro' };
}

/** Exige rol global admin/owner (separado de cliente en servidor). */
export function requireAdmin(ctx: SessionContext): SessionContext {
  if (!ctx.isAdmin) throw forbidden('Se requiere rol de administrador.');
  return ctx;
}

/**
 * Reautenticación para acciones sensibles (admin): la última verificación
 * MFA debe ser reciente (por defecto 10 minutos).
 */
export function requireRecentMfa(ctx: SessionContext, maxAgeMinutes = 10): SessionContext {
  requireAdmin(ctx);
  const at = ctx.session.mfaVerifiedAt;
  if (!at || Date.now() - new Date(at).getTime() > maxAgeMinutes * 60 * 1000) {
    throw forbidden('Reautenticación MFA requerida para esta acción.');
  }
  return ctx;
}

/**
 * Guarda de aislamiento multi-tenant: un registro solo es accesible si su
 * organization_id coincide con el de la sesión. Un UUID conocido NO
 * sustituye a la autorización: si no coincide, 404 genérico (no 403 con
 * detalles, para no confirmar existencia).
 */
export function assertSameOrg(recordOrganizationId: string | null, ctx: SessionContext): void {
  const { organizationId } = requireOrg(ctx);
  if (recordOrganizationId !== organizationId) {
    throw forbidden('No autorizado.');
  }
}
