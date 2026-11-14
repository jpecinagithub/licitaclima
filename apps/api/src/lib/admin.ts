import argon2 from 'argon2';
import { authenticator } from 'otplib';
import { eq } from 'drizzle-orm';
import type { Db } from '@licitaclima/db';
import { sessions, users } from '@licitaclima/db';
import { badRequest, forbidden, unauthorized } from './errors.js';
import { decryptSecret, encryptSecret, randomToken, sha256Hex } from './crypto.js';
import { createSession } from './sessions.js';

/**
 * Administración (Fase B).
 * - Cuenta creada SOLO por CLI bootstrap. Sin contraseñas por defecto.
 * - Contraseña Argon2id, TOTP obligatorio, códigos de recuperación con hash.
 * - La sesión de admin no tiene organization_id: nunca opera como tenant.
 */

authenticator.options = { window: 1 };

export interface CreateAdminInput {
  email: string;
  password: string;
}

export interface CreatedAdmin {
  user: typeof users.$inferSelect;
  /** Secreto TOTP en claro: se muestra UNA vez en consola (CLI). Nunca en logs. */
  totpSecret: string;
  /** URL otpauth:// para el QR de la app autenticadora. */
  otpauthUrl: string;
  /** Códigos de recuperación en claro: se muestran UNA vez. En BD solo van sus hashes. */
  recoveryCodes: string[];
}

export async function createAdmin(db: Db, input: CreateAdminInput): Promise<CreatedAdmin> {
  const email = input.email.trim().toLowerCase();
  if (input.password.length < 12) {
    throw badRequest('La contraseña de administrador debe tener al menos 12 caracteres.');
  }
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) throw badRequest('Ya existe un usuario con ese correo.', 'conflict');
  const passwordHash = await argon2.hash(input.password);
  const totpSecret = authenticator.generateSecret();
  const recoveryCodes = Array.from({ length: 8 }, () => randomToken(5));
  const [user] = await db
    .insert(users)
    .values({
      email,
      role: 'admin',
      passwordHash,
      totpSecretEncrypted: encryptSecret(totpSecret),
      totpEnabled: true,
      recoveryCodesHash: recoveryCodes.map((c) => sha256Hex(c)),
    })
    .returning();
  const otpauthUrl = authenticator.keyuri(email, 'LicitaClima', totpSecret);
  return { user, totpSecret, otpauthUrl, recoveryCodes };
}

export async function listAdmins(db: Db) {
  return db
    .select({ id: users.id, email: users.email, role: users.role, totpEnabled: users.totpEnabled, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.role, 'admin'));
}

interface VerifyAdminInput {
  email: string;
  password: string;
  totpCode: string;
}

async function verifyAdminSecondFactor(
  db: Db,
  user: typeof users.$inferSelect,
  totpCode: string,
): Promise<{ usedRecoveryCode: boolean }> {
  if (!user.totpSecretEncrypted) throw forbidden('TOTP no configurado para este administrador.');
  const secret = decryptSecret(user.totpSecretEncrypted);
  if (authenticator.check(totpCode, secret)) return { usedRecoveryCode: false };
  // Código de recuperación (un solo uso): se elimina su hash al usarlo.
  const hash = sha256Hex(totpCode.trim());
  const remaining = (user.recoveryCodesHash ?? []).filter((h) => h !== hash);
  if (remaining.length === (user.recoveryCodesHash ?? []).length) {
    throw unauthorized('Código de verificación no válido.');
  }
  await db.update(users).set({ recoveryCodesHash: remaining }).where(eq(users.id, user.id));
  return { usedRecoveryCode: true };
}

/** Verifica contraseña + TOTP (o código de recuperación). No crea sesión. */
export async function verifyAdminCredentials(db: Db, input: VerifyAdminInput) {
  const email = input.email.trim().toLowerCase();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || (user.role !== 'admin' && user.role !== 'owner') || !user.passwordHash) {
    // Genérico: no revelar si el correo existe ni si es admin.
    throw unauthorized('Credenciales no válidas.');
  }
  const passwordOk = await argon2.verify(user.passwordHash, input.password);
  if (!passwordOk) throw unauthorized('Credenciales no válidas.');
  const second = await verifyAdminSecondFactor(db, user, input.totpCode);
  return { user, ...second };
}

export async function loginAdmin(
  db: Db,
  input: VerifyAdminInput & { userAgent?: string | null; ipHash?: string | null },
) {
  const { user } = await verifyAdminCredentials(db, input);
  const { token } = await createSession(db, {
    userId: user.id,
    organizationId: null,
    mfaVerifiedAt: new Date(),
    userAgent: input.userAgent ?? null,
    ipHash: input.ipHash ?? null,
  });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  return { user, sessionToken: token };
}

/** Reautenticación para acciones sensibles: refresca mfaVerifiedAt de la sesión. */
export async function reauthAdmin(
  db: Db,
  sessionId: string,
  input: { userId: string; password: string; totpCode: string },
) {
  const [user] = await db.select().from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user || !user.passwordHash) throw unauthorized('Credenciales no válidas.');
  const passwordOk = await argon2.verify(user.passwordHash, input.password);
  if (!passwordOk) throw unauthorized('Credenciales no válidas.');
  await verifyAdminSecondFactor(db, user, input.totpCode);
  await db
    .update(sessions)
    .set({ mfaVerifiedAt: new Date() })
    .where(eq(sessions.id, sessionId));
}
