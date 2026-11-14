// LicitaClima — correo (Fase D).
// EmailProvider + outbox transaccional + supresión + consentimientos.
// SIN proveedor configurado (EMAIL_PROVIDER=none): el job de outbox deja los
// mensajes en `pending` y NO envía nada. Nada de esto se presenta como
// operativo: /health/ready y el panel admin lo marcan PENDIENTE.
// Distinción obligatoria: aceptado por el proveedor ≠ entregado. La entrega
// solo se conoce por webhook del proveedor (email_events).
import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '@licitaclima/db';
import { consentEvents, emailOutbox, suppressionEntries } from '@licitaclima/db';

export type EmailCategory = 'account' | 'service' | 'marketing';

export interface EmailSendInput {
  to: string;
  subject: string;
  text?: string | null;
  html?: string | null;
  templateKey: string;
}

export interface EmailSendResult {
  /** Aceptado por el proveedor (no significa entregado). */
  acceptedByProvider: boolean;
  providerMessageId: string | null;
  /** Siempre false en el envío: la entrega solo la confirma el webhook. */
  delivered: boolean;
}

export interface EmailProvider {
  readonly name: string;
  readonly configured: boolean;
  send(input: EmailSendInput): Promise<EmailSendResult>;
}

/** Sin proveedor: `send` nunca se ejecuta (el job no llama si configured=false). */
export class NoEmailProvider implements EmailProvider {
  readonly name = 'none';
  readonly configured = false;
  async send(): Promise<EmailSendResult> {
    throw new Error(
      'Correo sin proveedor configurado (PENDIENTE: EMAIL_PROVIDER=none; el outbox queda en pending).',
    );
  }
}

export function createEmailProvider(env: NodeJS.ProcessEnv = process.env): EmailProvider {
  const provider = (env.EMAIL_PROVIDER ?? 'none').trim().toLowerCase();
  if (provider === 'none' || provider === '') return new NoEmailProvider();
  // Proveedor transaccional de dominio propio / Gmail dedicada: PENDIENTE de
  // decisión de Jon. No se finge ningún envío.
  throw new Error(
    `Proveedor de correo '${provider}' no implementado (PENDIENTE: sin proveedor configurado).`,
  );
}

export function emailProviderStatus(env: NodeJS.ProcessEnv = process.env): 'configured' | 'pending' {
  return createEmailProviderSafe(env).configured ? 'configured' : 'pending';
}

function createEmailProviderSafe(env: NodeJS.ProcessEnv): EmailProvider {
  try {
    return createEmailProvider(env);
  } catch {
    return new NoEmailProvider();
  }
}

/**
 * Categoría de cada plantilla. Reglas (§11):
 * - 'account': cuenta/pagos; la baja de marketing NO las cancela.
 * - 'service': avisos solicitados (alertas, resumen); desactivar alertas no
 *   cancela la suscripción.
 * - 'marketing': solo con consentimiento separado; doble confirmación.
 */
export function templateCategory(templateKey: string): EmailCategory {
  if (/^(newsletter|promo|oferta|welcome|bienvenida)/.test(templateKey)) return 'marketing';
  if (/^(alert|aviso|digest|resumen|ticket|soporte)/.test(templateKey)) return 'service';
  return 'account';
}

export interface EnqueueEmailInput {
  organizationId?: string | null;
  toEmail: string;
  templateKey: string;
  subject: string;
  bodyText?: string | null;
  bodyHtml?: string | null;
  payload?: Record<string, unknown> | null;
  idempotencyKey: string;
}

/**
 * Encola un correo en el outbox transaccional (misma transacción que la
 * operación que lo origina, cuando se llama dentro de ella).
 * Si el destinatario está suprimido para ese canal, se encola como
 * 'suppressed' y nunca se envía. La clave idempotente evita duplicados.
 */
export async function enqueueEmail(db: Db, input: EnqueueEmailInput) {
  const email = input.toEmail.trim().toLowerCase();
  const category = templateCategory(input.templateKey);
  const channel = category === 'marketing' ? 'marketing' : 'email';
  const suppressed = await isSuppressed(db, email, channel);
  const [row] = await db
    .insert(emailOutbox)
    .values({
      organizationId: input.organizationId ?? null,
      toEmail: email,
      templateKey: input.templateKey,
      subject: input.subject,
      bodyText: input.bodyText ?? null,
      bodyHtml: input.bodyHtml ?? null,
      payload: input.payload ?? null,
      idempotencyKey: input.idempotencyKey,
      category,
      status: suppressed ? 'suppressed' : 'pending',
    })
    .onConflictDoNothing()
    .returning();
  if (row) return row;
  const [existing] = await db
    .select()
    .from(emailOutbox)
    .where(eq(emailOutbox.idempotencyKey, input.idempotencyKey))
    .limit(1);
  return existing;
}

export async function isSuppressed(
  db: Db,
  email: string,
  channel: 'email' | 'marketing',
): Promise<boolean> {
  const rows = await db
    .select()
    .from(suppressionEntries)
    .where(eq(suppressionEntries.email, email.trim().toLowerCase()));
  // La supresión de canal 'email' (rebote/queja) bloquea todo; la de
  // 'marketing' solo bloquea marketing.
  if (rows.some((r) => r.channel === 'email')) return true;
  return channel === 'marketing' && rows.some((r) => r.channel === 'marketing');
}

export async function addSuppression(
  db: Db,
  input: { email: string; channel: 'email' | 'marketing'; reason: string },
) {
  const [row] = await db
    .insert(suppressionEntries)
    .values({
      email: input.email.trim().toLowerCase(),
      channel: input.channel,
      reason: input.reason,
    })
    .onConflictDoNothing()
    .returning();
  return row ?? null;
}

export interface RecordConsentInput {
  organizationId?: string | null;
  userId?: string | null;
  email: string;
  purpose: 'marketing' | 'newsletter' | 'service_alerts' | 'analytics';
  granted: boolean;
  textVersion: string;
  source?: string | null;
}

/**
 * Registra un consentimiento con versión del texto y fecha. La baja de
 * marketing añade supresión de marketing (no toca comunicaciones de cuenta);
 * una nueva concesión la retira.
 */
export async function recordConsent(db: Db, input: RecordConsentInput) {
  const email = input.email.trim().toLowerCase();
  const [row] = await db
    .insert(consentEvents)
    .values({
      organizationId: input.organizationId ?? null,
      userId: input.userId ?? null,
      email,
      purpose: input.purpose,
      granted: input.granted,
      textVersion: input.textVersion,
      source: input.source ?? null,
    })
    .returning();
  if (input.purpose === 'marketing' || input.purpose === 'newsletter') {
    if (!input.granted) {
      await addSuppression(db, { email, channel: 'marketing', reason: `baja_${input.purpose}` });
    } else {
      await db
        .delete(suppressionEntries)
        .where(eq(suppressionEntries.email, email));
    }
  }
  return row;
}

/** Último consentimiento vigente por propósito (null = sin registro). */
export async function latestConsent(
  db: Db,
  email: string,
  purpose: string,
): Promise<{ granted: boolean; textVersion: string; createdAt: Date } | null> {
  const rows = await db
    .select()
    .from(consentEvents)
    .where(eq(consentEvents.email, email.trim().toLowerCase()));
  const match = rows
    .filter((r) => r.purpose === purpose)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return match ? { granted: match.granted, textVersion: match.textVersion, createdAt: match.createdAt } : null;
}

function unsubscribeSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.ADMIN_SECRETS_KEY ?? env.SESSION_SECRET;
  if (!secret) throw new Error('Falta ADMIN_SECRETS_KEY o SESSION_SECRET para firmar la baja.');
  return secret;
}

/**
 * Enlace de baja firmado (HMAC-SHA256, sin token en BD): `email|proposito|firma`.
 * La baja es sencilla (un clic) y solo afecta a marketing/boletines: nunca
 * cancela comunicaciones de cuenta ni la suscripción.
 */
export function signUnsubscribeToken(
  email: string,
  purpose: 'marketing' | 'newsletter',
  env: NodeJS.ProcessEnv = process.env,
): string {
  const normalized = email.trim().toLowerCase();
  const sig = createHmac('sha256', unsubscribeSecret(env))
    .update(`${normalized}|${purpose}`, 'utf8')
    .digest('hex');
  return Buffer.from(`${normalized}|${purpose}|${sig}`, 'utf8').toString('base64url');
}

export function verifyUnsubscribeToken(
  token: string,
  env: NodeJS.ProcessEnv = process.env,
): { email: string; purpose: 'marketing' | 'newsletter' } | null {
  let decoded: string;
  try {
    decoded = Buffer.from(token, 'base64url').toString('utf8');
    // La codificación debe ser canónica: un carácter extra al final no
    // puede seguir verificando (mismo token, distinta representación).
    if (Buffer.from(decoded, 'utf8').toString('base64url') !== token) return null;
  } catch {
    return null;
  }
  const [email, purpose, sig] = decoded.split('|');
  if (!email || (purpose !== 'marketing' && purpose !== 'newsletter') || !sig) return null;
  const expected = createHmac('sha256', unsubscribeSecret(env))
    .update(`${email}|${purpose}`, 'utf8')
    .digest('hex');
  if (sig !== expected) return null;
  return { email, purpose };
}
