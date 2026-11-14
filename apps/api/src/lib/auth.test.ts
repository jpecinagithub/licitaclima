import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { loginTokens, sessions, users } from '@licitaclima/db';
import { consumeMagicLink, requestMagicLink, verifyMagicLink } from './auth.js';
import { sha256Hex } from './crypto.js';
import { createTestDb, type TestDb } from './test-db.js';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.cleanup();
});

describe('magic link', () => {
  it('request crea el token con SOLO el hash en BD y encola el outbox sin el token', async () => {
    const { token, emailSent } = await requestMagicLink(t.db, { email: 'Cliente@Ejemplo.es' });
    expect(emailSent).toBe(false); // PENDIENTE Fase D: sin proveedor de correo
    const [row] = await t.db.select().from(loginTokens).where(eq(loginTokens.tokenHash, sha256Hex(token))).limit(1);
    expect(row).toBeDefined();
    expect(row.email).toBe('cliente@ejemplo.es');
    expect(row.usedAt).toBeNull();
    // El token en claro no está en ninguna columna de la fila.
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it('verify (GET) no consume: antes y después sigue válido', async () => {
    const { token } = await requestMagicLink(t.db, { email: 'verify@example.es' });
    expect(await verifyMagicLink(t.db, token)).toMatchObject({ valid: true });
    expect(await verifyMagicLink(t.db, token)).toMatchObject({ valid: true });
    const [row] = await t.db.select().from(loginTokens).where(eq(loginTokens.tokenHash, sha256Hex(token))).limit(1);
    expect(row.usedAt).toBeNull();
  });

  it('consume crea usuario + organización + sesión, y el segundo uso falla', async () => {
    const { token } = await requestMagicLink(t.db, { email: 'nuevo@example.es' });
    const first = await consumeMagicLink(t.db, { token });
    expect(first.membershipRole).toBe('owner');
    expect(first.sessionToken).toHaveLength(64);
    const [session] = await t.db.select().from(sessions).where(eq(sessions.userId, first.user.id)).limit(1);
    expect(session).toBeDefined();
    expect(session.tokenHash).toBe(sha256Hex(first.sessionToken));
    expect(session.tokenHash).not.toBe(first.sessionToken);
    await expect(consumeMagicLink(t.db, { token })).rejects.toMatchObject({ status: 410, code: 'invalid_link' });
  });

  it('consume concurrente: solo uno de dos intentos simultáneos tiene éxito', async () => {
    const { token } = await requestMagicLink(t.db, { email: 'concurrente@example.es' });
    const results = await Promise.allSettled([
      consumeMagicLink(t.db, { token }),
      consumeMagicLink(t.db, { token }),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0] as PromiseRejectedResult).reason).toMatchObject({ status: 410 });
  });

  it('token caducado no se consume', async () => {
    const { token } = await requestMagicLink(t.db, { email: 'caducado@example.es' });
    await t.db
      .update(loginTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(loginTokens.tokenHash, sha256Hex(token)));
    await expect(consumeMagicLink(t.db, { token })).rejects.toMatchObject({ status: 410 });
    expect(await verifyMagicLink(t.db, token)).toMatchObject({ valid: false });
  });

  it('token desconocido no se consume y no revela nada', async () => {
    await expect(consumeMagicLink(t.db, { token: '0'.repeat(64) })).rejects.toMatchObject({
      status: 410,
      code: 'invalid_link',
    });
    expect(await verifyMagicLink(t.db, '0'.repeat(64))).toMatchObject({ valid: false, emailMasked: null });
  });

  it('segundo login del mismo usuario reutiliza su organización (no duplica)', async () => {
    const { token: t1 } = await requestMagicLink(t.db, { email: 'repite@example.es' });
    const first = await consumeMagicLink(t.db, { token: t1 });
    const { token: t2 } = await requestMagicLink(t.db, { email: 'repite@example.es' });
    const second = await consumeMagicLink(t.db, { token: t2 });
    expect(second.organization.id).toBe(first.organization.id);
    expect(second.user.id).toBe(first.user.id);
    const count = await t.db.select().from(users).where(eq(users.email, 'repite@example.es'));
    expect(count).toHaveLength(1);
  });
});
