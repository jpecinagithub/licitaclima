import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import argon2 from 'argon2';
import { authenticator } from 'otplib';
import { eq } from 'drizzle-orm';
import { sessions, users } from '@licitaclima/db';
import { createAdmin, loginAdmin, reauthAdmin, verifyAdminCredentials } from './admin.js';
import { decryptSecret, sha256Hex } from './crypto.js';
import { createTestDb, type TestDb } from './test-db.js';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.cleanup();
});

describe('admin bootstrap (CLI)', () => {
  it('createAdmin: contraseña Argon2id, TOTP cifrado y códigos solo con hash', async () => {
    const created = await createAdmin(t.db, { email: 'Admin@Ejemplo.es', password: 'contraseña-segura-123' });
    expect(created.user.role).toBe('admin');
    expect(created.user.email).toBe('admin@ejemplo.es');
    expect(created.otpauthUrl).toContain('otpauth://totp/LicitaClima:');
    expect(created.recoveryCodes).toHaveLength(8);
    const [row] = await t.db.select().from(users).where(eq(users.id, created.user.id)).limit(1);
    expect(row.passwordHash).not.toBe('contraseña-segura-123');
    expect(await argon2.verify(row.passwordHash!, 'contraseña-segura-123')).toBe(true);
    expect(row.totpSecretEncrypted).not.toContain(created.totpSecret);
    expect(decryptSecret(row.totpSecretEncrypted!)).toBe(created.totpSecret);
    // Ningún código de recuperación en claro en la BD.
    for (const code of created.recoveryCodes) {
      expect(JSON.stringify(row)).not.toContain(code);
      expect(row.recoveryCodesHash).toContain(sha256Hex(code));
    }
  });

  it('createAdmin rechaza contraseña corta y correo duplicado', async () => {
    await expect(createAdmin(t.db, { email: 'corto@example.es', password: 'corta' })).rejects.toMatchObject({ status: 400 });
    await expect(createAdmin(t.db, { email: 'admin@ejemplo.es', password: 'otra-contraseña-123' })).rejects.toMatchObject({ status: 400 });
  });

  it('loginAdmin exige contraseña + TOTP vigente; el código erróneo falla', async () => {
    const created = await createAdmin(t.db, { email: 'login@example.es', password: 'contraseña-segura-123' });
    const goodCode = authenticator.generate(created.totpSecret);
    await expect(
      loginAdmin(t.db, { email: 'login@example.es', password: 'contraseña-segura-123', totpCode: '000000' }),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      loginAdmin(t.db, { email: 'login@example.es', password: 'incorrecta-123456', totpCode: goodCode }),
    ).rejects.toMatchObject({ status: 401 });
    const { user, sessionToken } = await loginAdmin(t.db, {
      email: 'login@example.es',
      password: 'contraseña-segura-123',
      totpCode: goodCode,
    });
    expect(user.id).toBe(created.user.id);
    // La sesión de admin no tiene organization_id y tiene MFA reciente.
    const [session] = await t.db.select().from(sessions).where(eq(sessions.tokenHash, sha256Hex(sessionToken))).limit(1);
    expect(session.organizationId).toBeNull();
    expect(session.mfaVerifiedAt).not.toBeNull();
  });

  it('código de recuperación: un solo uso', async () => {
    const created = await createAdmin(t.db, { email: 'recupera@example.es', password: 'contraseña-segura-123' });
    const code = created.recoveryCodes[0]!;
    const first = await verifyAdminCredentials(t.db, {
      email: 'recupera@example.es',
      password: 'contraseña-segura-123',
      totpCode: code,
    });
    expect(first.usedRecoveryCode).toBe(true);
    await expect(
      verifyAdminCredentials(t.db, {
        email: 'recupera@example.es',
        password: 'contraseña-segura-123',
        totpCode: code,
      }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('reauthAdmin refresca mfaVerifiedAt de la sesión', async () => {
    const created = await createAdmin(t.db, { email: 'reauth@example.es', password: 'contraseña-segura-123' });
    const { sessionToken } = await loginAdmin(t.db, {
      email: 'reauth@example.es',
      password: 'contraseña-segura-123',
      totpCode: authenticator.generate(created.totpSecret),
    });
    const [session] = await t.db.select().from(sessions).where(eq(sessions.tokenHash, sha256Hex(sessionToken))).limit(1);
    // Simula MFA antiguo.
    const old = new Date(Date.now() - 60 * 60 * 1000);
    await t.db.update(sessions).set({ mfaVerifiedAt: old }).where(eq(sessions.id, session.id));
    await reauthAdmin(t.db, session.id, {
      userId: created.user.id,
      password: 'contraseña-segura-123',
      totpCode: authenticator.generate(created.totpSecret),
    });
    const [after] = await t.db.select().from(sessions).where(eq(sessions.id, session.id)).limit(1);
    expect(new Date(after.mfaVerifiedAt!).getTime()).toBeGreaterThan(old.getTime());
  });
});
