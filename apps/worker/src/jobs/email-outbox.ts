// LicitaClima worker — outbox de correo (Fase D).
// SIN proveedor configurado (EMAIL_PROVIDER=none): el job deja los mensajes
// en `pending` y NO envía nada (estado PENDIENTE).
// Con proveedor: aceptado por el proveedor ≠ entregado. El envío marca
// 'sent' + provider_message_id; la entrega solo la confirma el webhook
// (email_events). Reintentos con backoff exponencial, sin duplicar entregas
// (la clave idempotente del outbox y el envío único por fila lo garantizan).
// Pausa de admin `pause.non_essential_emails`: solo salen correos de cuenta;
// marketing y servicio quedan pendientes.
import { and, asc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import type { Db } from '@licitaclima/db';
import { emailOutbox, systemSettings } from '@licitaclima/db';
import { createEmailProvider, isSuppressed, type EmailProvider } from '@licitaclima/integrations';

export const EMAIL_MAX_ATTEMPTS = 5;

export interface ProcessOutboxResult {
  status: 'ok' | 'pending';
  reason?: string;
  claimed: number;
  sent: number;
  failed: number;
  suppressed: number;
  skippedPaused: number;
}

export interface ProcessOutboxOptions {
  provider?: EmailProvider;
  limit?: number;
  now?: Date;
}

async function nonEssentialPaused(db: Db): Promise<boolean> {
  const [row] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, 'pause.non_essential_emails'))
    .limit(1);
  return (row?.value as { paused?: boolean } | null)?.paused === true;
}

export async function processEmailOutbox(
  db: Db,
  opts: ProcessOutboxOptions = {},
): Promise<ProcessOutboxResult> {
  const provider = opts.provider ?? createEmailProvider();
  if (!provider.configured) {
    return { status: 'pending', reason: 'email_not_configured', claimed: 0, sent: 0, failed: 0, suppressed: 0, skippedPaused: 0 };
  }
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 50;
  const paused = await nonEssentialPaused(db);

  // Reclama un lote: solo filas pendientes cuyo próximo intento ya llegó.
  const candidates = await db
    .select()
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.status, 'pending'),
        or(isNull(emailOutbox.nextAttemptAt), lte(emailOutbox.nextAttemptAt, now)),
      ),
    )
    .orderBy(asc(emailOutbox.createdAt))
    .limit(limit);

  let sent = 0;
  let failed = 0;
  let suppressed = 0;
  let skippedPaused = 0;
  let claimed = 0;

  for (const row of candidates) {
    if (paused && row.category !== 'account') {
      skippedPaused += 1;
      continue;
    }
    // Reclamo atómico: solo el worker que incrementa attempts procesa la fila.
    const [claimedRow] = await db
      .update(emailOutbox)
      .set({ attempts: sql`${emailOutbox.attempts} + 1`, updatedAt: new Date() })
      .where(and(eq(emailOutbox.id, row.id), eq(emailOutbox.status, 'pending')))
      .returning();
    if (!claimedRow) continue;
    claimed += 1;
    const attempts = claimedRow.attempts;

    if (await isSuppressed(db, row.toEmail, row.category === 'marketing' ? 'marketing' : 'email')) {
      await db.update(emailOutbox).set({ status: 'suppressed', updatedAt: new Date() }).where(eq(emailOutbox.id, row.id));
      suppressed += 1;
      continue;
    }

    try {
      const result = await provider.send({
        to: row.toEmail,
        subject: row.subject,
        text: row.bodyText,
        html: row.bodyHtml,
        templateKey: row.templateKey,
      });
      if (!result.acceptedByProvider) throw new Error('Proveedor no aceptó el envío.');
      // 'sent' = aceptado por el proveedor. La entrega la confirma el webhook.
      await db
        .update(emailOutbox)
        .set({
          status: 'sent',
          sentAt: new Date(),
          providerMessageId: result.providerMessageId,
          updatedAt: new Date(),
        })
        .where(eq(emailOutbox.id, row.id));
      sent += 1;
    } catch (err) {
      const backoffMinutes = Math.min(60, 2 ** Math.max(0, attempts - 1));
      const nextAttemptAt = new Date(now.getTime() + backoffMinutes * 60 * 1000);
      await db
        .update(emailOutbox)
        .set({
          status: attempts >= EMAIL_MAX_ATTEMPTS ? 'failed' : 'pending',
          nextAttemptAt: attempts >= EMAIL_MAX_ATTEMPTS ? null : nextAttemptAt,
          updatedAt: new Date(),
        })
        .where(eq(emailOutbox.id, row.id));
      failed += 1;
      void err;
    }
  }

  return { status: 'ok', claimed, sent, failed, suppressed, skippedPaused };
}
