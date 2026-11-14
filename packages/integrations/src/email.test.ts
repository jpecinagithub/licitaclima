import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { emailOutbox, suppressionEntries } from '@licitaclima/db';
import { createTestDb, type TestDb } from '@licitaclima/db/src/test-utils.js';
import {
  createEmailProvider,
  enqueueEmail,
  isSuppressed,
  latestConsent,
  recordConsent,
  signUnsubscribeToken,
  templateCategory,
  verifyUnsubscribeToken,
} from './email.js';

// Clave SOLO de test para firmar bajas.
process.env.SESSION_SECRET ??= 'test-session-secret-solo-test-000000000000';

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.cleanup();
});

describe('correo (sin proveedor)', () => {
  it('createEmailProvider(none): no configurado; send lanza (nunca finge envío)', async () => {
    const provider = createEmailProvider({ EMAIL_PROVIDER: 'none' });
    expect(provider.configured).toBe(false);
    await expect(provider.send({ to: 'a@example.es', subject: 'x', templateKey: 'magic_link' })).rejects.toThrow(/sin proveedor/i);
  });

  it('templateCategory: cuenta, servicio y marketing separados', () => {
    expect(templateCategory('magic_link')).toBe('account');
    expect(templateCategory('payment_failed')).toBe('account');
    expect(templateCategory('alert_rectification')).toBe('service');
    expect(templateCategory('newsletter')).toBe('marketing');
    expect(templateCategory('promo')).toBe('marketing');
  });

  it('enqueue: suprimido de marketing queda suppressed; cuenta queda pending; idempotente', async () => {
    await recordConsent(t.db, { email: 'suprimido@example.es', purpose: 'marketing', granted: false, textVersion: 'marketing-v1' });
    expect(await isSuppressed(t.db, 'suprimido@example.es', 'marketing')).toBe(true);
    expect(await isSuppressed(t.db, 'suprimido@example.es', 'email')).toBe(false);
    const mkt = await enqueueEmail(t.db, {
      toEmail: 'suprimido@example.es',
      templateKey: 'newsletter',
      subject: 'Boletín',
      idempotencyKey: 'email-mkt-1',
    });
    expect(mkt?.status).toBe('suppressed');
    const acc = await enqueueEmail(t.db, {
      toEmail: 'suprimido@example.es',
      templateKey: 'magic_link',
      subject: 'Tu enlace',
      idempotencyKey: 'email-acc-1',
    });
    // La baja de marketing NO cancela comunicaciones de cuenta.
    expect(acc?.status).toBe('pending');
    const again = await enqueueEmail(t.db, {
      toEmail: 'suprimido@example.es',
      templateKey: 'magic_link',
      subject: 'Tu enlace',
      idempotencyKey: 'email-acc-1',
    });
    expect(again?.id).toBe(acc?.id);
    const [rows] = await t.db.select().from(emailOutbox).where(eq(emailOutbox.idempotencyKey, 'email-acc-1'));
    expect(rows).toBeDefined();
  });

  it('recordConsent: la baja añade supresión; la concesión la retira', async () => {
    await recordConsent(t.db, { email: 'consent@example.es', purpose: 'newsletter', granted: false, textVersion: 'nl-v1' });
    expect(await isSuppressed(t.db, 'consent@example.es', 'marketing')).toBe(true);
    expect((await latestConsent(t.db, 'consent@example.es', 'newsletter'))?.granted).toBe(false);
    await recordConsent(t.db, { email: 'consent@example.es', purpose: 'newsletter', granted: true, textVersion: 'nl-v1' });
    const [supp] = await t.db.select().from(suppressionEntries).where(eq(suppressionEntries.email, 'consent@example.es'));
    expect(supp).toBeUndefined();
    expect((await latestConsent(t.db, 'consent@example.es', 'newsletter'))?.granted).toBe(true);
  });

  it('enlace de baja firmado: ida y vuelta; manipulado → null', () => {
    const token = signUnsubscribeToken('baja@example.es', 'marketing');
    expect(verifyUnsubscribeToken(token)).toEqual({ email: 'baja@example.es', purpose: 'marketing' });
    expect(verifyUnsubscribeToken(`${token}x`)).toBeNull();
    expect(verifyUnsubscribeToken('basura')).toBeNull();
  });
});
