import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { emailOutbox, organizations, systemSettings } from '@licitaclima/db';
import { createTestDb, type TestDb } from '@licitaclima/db/src/test-utils.js';
import { addSuppression, type EmailProvider, type EmailSendResult } from '@licitaclima/integrations';
import { processEmailOutbox } from './email-outbox.js';

let t: TestDb;
let orgId: string;
beforeAll(async () => {
  t = await createTestDb();
  const [org] = await t.db.insert(organizations).values({ name: 'Worker Email SL', slug: 'worker-email' }).returning();
  orgId = org.id;
});
afterAll(async () => {
  await t.cleanup();
});

function stubProvider(sent: Array<{ to: string; subject: string }>, fail = false): EmailProvider {
  return {
    name: 'stub',
    configured: true,
    async send(input): Promise<EmailSendResult> {
      if (fail) throw new Error('Proveedor caído (test).');
      sent.push({ to: input.to, subject: input.subject });
      return { acceptedByProvider: true, providerMessageId: 'msg_stub_1', delivered: false };
    },
  };
}

async function enqueue(toEmail: string, templateKey: string, idempotencyKey: string) {
  const [row] = await t.db
    .insert(emailOutbox)
    .values({
      organizationId: orgId,
      toEmail,
      templateKey,
      subject: `Asunto ${templateKey}`,
      category: templateKey === 'newsletter' ? 'marketing' : 'account',
      idempotencyKey,
      status: 'pending',
    })
    .returning();
  return row;
}

describe('worker: outbox de correo', () => {
  it('sin proveedor → pending y nada se envía', async () => {
    await enqueue('pendiente@example.es', 'magic_link', 'w-pending-1');
    const result = await processEmailOutbox(t.db);
    expect(result.status).toBe('pending');
    expect(result.sent).toBe(0);
    const [row] = await t.db.select().from(emailOutbox).where(eq(emailOutbox.idempotencyKey, 'w-pending-1'));
    expect(row.status).toBe('pending');
  });

  it('con proveedor: envía una vez, marca sent + provider_message_id; la segunda pasada no reenvía', async () => {
    const sent: Array<{ to: string; subject: string }> = [];
    await enqueue('envio@example.es', 'magic_link', 'w-send-1');
    const first = await processEmailOutbox(t.db, { provider: stubProvider(sent) });
    expect(first.sent).toBeGreaterThanOrEqual(1);
    expect(sent.some((s) => s.to === 'envio@example.es')).toBe(true);
    const [row] = await t.db.select().from(emailOutbox).where(eq(emailOutbox.idempotencyKey, 'w-send-1'));
    expect(row.status).toBe('sent');
    expect(row.providerMessageId).toBe('msg_stub_1');
    expect(row.sentAt).not.toBeNull();
    const before = sent.length;
    const second = await processEmailOutbox(t.db, { provider: stubProvider(sent) });
    expect(sent.length).toBe(before); // sin duplicar entregas
    expect(second.sent).toBe(0);
  });

  it('suprimido → suppressed sin llamar al proveedor', async () => {
    await addSuppression(t.db, { email: 'rebotado@example.es', channel: 'email', reason: 'bounced' });
    await enqueue('rebotado@example.es', 'magic_link', 'w-supp-1');
    const sent: Array<{ to: string; subject: string }> = [];
    const result = await processEmailOutbox(t.db, { provider: stubProvider(sent) });
    expect(result.suppressed).toBeGreaterThanOrEqual(1);
    expect(sent.some((s) => s.to === 'rebotado@example.es')).toBe(false);
    const [row] = await t.db.select().from(emailOutbox).where(eq(emailOutbox.idempotencyKey, 'w-supp-1'));
    expect(row.status).toBe('suppressed');
  });

  it('fallo del proveedor: reintento con backoff; a los 5 intentos → failed', async () => {
    const row = await enqueue('falla@example.es', 'magic_link', 'w-fail-1');
    await t.db.update(emailOutbox).set({ attempts: 4 }).where(eq(emailOutbox.id, row.id));
    const result = await processEmailOutbox(t.db, { provider: stubProvider([], true) });
    expect(result.failed).toBeGreaterThanOrEqual(1);
    const [after] = await t.db.select().from(emailOutbox).where(eq(emailOutbox.idempotencyKey, 'w-fail-1'));
    expect(after.status).toBe('failed');
    expect(after.attempts).toBe(5);
  });

  it('pausa de envíos no esenciales: marketing queda pendiente, cuenta sale', async () => {
    await t.db
      .insert(systemSettings)
      .values({ key: 'pause.non_essential_emails', value: { paused: true } })
      .onConflictDoNothing();
    await enqueue('pausa-mkt@example.es', 'newsletter', 'w-pause-mkt-1');
    await enqueue('pausa-acc@example.es', 'magic_link', 'w-pause-acc-1');
    const sent: Array<{ to: string; subject: string }> = [];
    const result = await processEmailOutbox(t.db, { provider: stubProvider(sent) });
    expect(result.skippedPaused).toBeGreaterThanOrEqual(1);
    expect(sent.some((s) => s.to === 'pausa-acc@example.es')).toBe(true);
    expect(sent.some((s) => s.to === 'pausa-mkt@example.es')).toBe(false);
    const [mkt] = await t.db.select().from(emailOutbox).where(eq(emailOutbox.idempotencyKey, 'w-pause-mkt-1'));
    expect(mkt.status).toBe('pending');
    await t.db
      .update(systemSettings)
      .set({ value: { paused: false } })
      .where(eq(systemSettings.key, 'pause.non_essential_emails'));
  });
});
