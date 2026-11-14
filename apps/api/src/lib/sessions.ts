import { eq } from 'drizzle-orm';
import type { Db } from '@licitaclima/db';
import { sessions } from '@licitaclima/db';
import { LIMITS } from '@licitaclima/config';
import { hashIp, randomToken, sha256Hex } from './crypto.js';

/** Nombre de la cookie de sesión. Nunca en localStorage. */
export const SESSION_COOKIE = 'lc_session';

export const SESSION_TTL_MS = LIMITS.sessionTtlDays * 24 * 60 * 60 * 1000;

export interface CreateSessionInput {
  userId: string;
  /** NULL en administradores (no pertenecen a ningún tenant). */
  organizationId: string | null;
  mfaVerifiedAt?: Date | null;
  userAgent?: string | null;
  ipHash?: string | null;
}

export interface CreatedSession {
  session: typeof sessions.$inferSelect;
  /** Token en claro: SOLO existe aquí y en la cookie. En BD solo va su hash. */
  token: string;
}

export async function createSession(db: Db, input: CreateSessionInput): Promise<CreatedSession> {
  const token = randomToken(32);
  const now = new Date();
  const [session] = await db
    .insert(sessions)
    .values({
      userId: input.userId,
      organizationId: input.organizationId,
      tokenHash: sha256Hex(token),
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      mfaVerifiedAt: input.mfaVerifiedAt ?? null,
      userAgent: input.userAgent ?? null,
      ipHash: input.ipHash ?? null,
    })
    .returning();
  return { session, token };
}

export async function findSessionByToken(db: Db, token: string) {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, sha256Hex(token)))
    .limit(1);
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;
  return session;
}

export async function touchSession(db: Db, sessionId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ lastUsedAt: new Date() })
    .where(eq(sessions.id, sessionId));
}

export async function revokeSession(db: Db, token: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.tokenHash, sha256Hex(token)));
}

export async function revokeAllUserSessions(db: Db, userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.userId, userId));
}

export function sessionCookieOptions() {
  return {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

export { hashIp };
