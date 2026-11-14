import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '@licitaclima/db';
import { emailOutbox, loginTokens, memberships, organizations, users } from '@licitaclima/db';
import { LIMITS } from '@licitaclima/config';
import { gone } from './errors.js';
import { hashIp, randomToken, sha256Hex } from './crypto.js';
import { createSession } from './sessions.js';

export const MAGIC_LINK_TTL_MS = LIMITS.magicLinkTtlMinutes * 60 * 1000;

export interface RequestMagicLinkInput {
  email: string;
  ipHash?: string | null;
}

export interface RequestMagicLinkResult {
  /** Token en claro: SOLO para entregarlo al proveedor de correo en memoria.
   *  Nunca se guarda en BD ni en logs. La ruta HTTP no lo devuelve. */
  token: string;
  /** Con EMAIL_PROVIDER=none (Fase B) el correo NO se envía: queda en outbox pendiente. */
  emailSent: boolean;
}

/**
 * Crea un token de magic link (15 min, un solo uso).
 * - Solo se almacena el hash sha256 del token.
 * - Anti-enumeración: el llamador NO distingue si el correo existe.
 * - El envío real lo hace el proveedor de correo (Fase D) con el token en
 *   memoria; aquí solo se encola el intento en el outbox (sin el token).
 */
export async function requestMagicLink(db: Db, input: RequestMagicLinkInput): Promise<RequestMagicLinkResult> {
  const email = input.email.trim().toLowerCase();
  const token = randomToken(32);
  const now = new Date();
  const [row] = await db
    .insert(loginTokens)
    .values({
      email,
      tokenHash: sha256Hex(token),
      expiresAt: new Date(now.getTime() + MAGIC_LINK_TTL_MS),
    })
    .returning({ id: loginTokens.id });
  await db.insert(emailOutbox).values({
    toEmail: email,
    templateKey: 'magic_link',
    subject: 'Tu enlace de acceso a LicitaClima',
    bodyText: null,
    bodyHtml: null,
    payload: { loginTokenId: row.id, email },
    idempotencyKey: `magic-link:${row.id}`,
    status: 'pending',
  });
  void input.ipHash;
  // PENDIENTE (Fase D): enviar el correo con el proveedor configurado.
  return { token, emailSent: false };
}

export interface ConsumeMagicLinkInput {
  token: string;
  userAgent?: string | null;
  ipHash?: string | null;
}

export interface ConsumeMagicLinkResult {
  user: typeof users.$inferSelect;
  organization: typeof organizations.$inferSelect;
  membershipRole: string;
  sessionToken: string;
}

/**
 * Consume un magic link de forma ATÓMICA:
 * `UPDATE ... WHERE used_at IS NULL AND expires_at > now() RETURNING`.
 * Dos consumos concurrentes del mismo token: solo uno tiene éxito.
 * Un GET nunca consume (la página intermedia solo verifica; el consumo es POST).
 */
export async function consumeMagicLink(db: Db, input: ConsumeMagicLinkInput): Promise<ConsumeMagicLinkResult> {
  const tokenHash = sha256Hex(input.token);
  const consumed = await db.execute<{ id: string; email: string }>(sql`
    UPDATE "login_tokens"
    SET "used_at" = now()
    WHERE "token_hash" = ${tokenHash}
      AND "used_at" IS NULL
      AND "expires_at" > now()
    RETURNING "id", "email"
  `);
  const row = consumed.rows[0];
  if (!row) {
    // Mensaje genérico: caducado, reutilizado o inexistente son indistinguibles.
    throw gone();
  }
  const email = row.email;

  // Invalida otros enlaces pendientes del mismo correo (higiene anti-reutilización).
  await db
    .update(loginTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(loginTokens.email, email), isNull(loginTokens.usedAt)));

  return db.transaction(async (tx) => {
    let [user] = await tx
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);
    if (!user) {
      [user] = await tx
        .insert(users)
        .values({ email, role: 'cliente' })
        .returning();
    }
    let [membership] = await tx
      .select()
      .from(memberships)
      .where(eq(memberships.userId, user.id))
      .limit(1);
    let organization: typeof organizations.$inferSelect;
    if (!membership) {
      const base = email.split('@')[0]?.replace(/[^a-z0-9-]/gi, '').toLowerCase() || 'empresa';
      const slug = `${base}-${randomToken(4)}`;
      [organization] = await tx
        .insert(organizations)
        .values({ name: `Empresa de ${email}`, slug })
        .returning();
      [membership] = await tx
        .insert(memberships)
        .values({ organizationId: organization.id, userId: user.id, role: 'owner' })
        .returning();
    } else {
      [organization] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, membership.organizationId))
        .limit(1);
    }
    const { token: sessionToken } = await createSession(tx as unknown as Db, {
      userId: user.id,
      organizationId: organization.id,
      userAgent: input.userAgent ?? null,
      ipHash: input.ipHash ?? null,
    });
    await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    return { user, organization, membershipRole: membership.role, sessionToken };
  });
}

/**
 * Verificación SOLO de lectura para la página intermedia (GET).
 * No consume el token. Devuelve el correo enmascarado para la UI.
 */
export async function verifyMagicLink(db: Db, token: string): Promise<{ valid: boolean; emailMasked: string | null }> {
  const [row] = await db
    .select({ email: loginTokens.email, usedAt: loginTokens.usedAt, expiresAt: loginTokens.expiresAt })
    .from(loginTokens)
    .where(eq(loginTokens.tokenHash, sha256Hex(token)))
    .limit(1);
  if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
    return { valid: false, emailMasked: null };
  }
  const [local, domain] = row.email.split('@');
  return { valid: true, emailMasked: `${local?.[0] ?? '*'}***@${domain ?? ''}` };
}

export { hashIp };
