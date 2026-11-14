import { z } from 'zod';

/**
 * Esquemas Zod de la API v1 (Fase B). Son la única fuente para validar la
 * entrada Y para generar openapi.json (ver src/openapi.ts).
 */

export const emailSchema = z.string().trim().toLowerCase().email('Correo no válido.').max(254);

export const requestLinkSchema = z.object({
  email: emailSchema,
});

export const consumeLinkSchema = z.object({
  /** Token tal como llegó por correo (64 hex). Nunca va en un GET que lo consuma. */
  token: z.string().min(32).max(128),
});

export const verifyLinkSchema = z.object({
  token: z.string().min(32).max(128),
});

export const adminLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Contraseña obligatoria.').max(256),
  /** Código TOTP de 6 dígitos, o código de recuperación. */
  totpCode: z.string().trim().min(6).max(32),
});

export const adminReauthSchema = z.object({
  password: z.string().min(1, 'Contraseña obligatoria.').max(256),
  totpCode: z.string().trim().min(6).max(32),
});

const provinciasSchema = z
  .array(z.string().trim().min(1).max(100))
  .min(1, 'Indica al menos una provincia.')
  .max(3, 'El plan incluye hasta 3 provincias.')
  .refine((arr) => new Set(arr.map((p) => p.toLowerCase())).size === arr.length, {
    message: 'Las provincias no pueden repetirse.',
  });

export const companyProfileSchema = z.object({
  actividad: z.string().trim().min(2, 'La actividad es obligatoria.').max(500),
  provincias: provinciasSchema,
  radioKm: z.number().int().min(0).max(500).nullable().optional(),
  tamanoContratosOrientativo: z.string().trim().max(500).nullable().optional(),
  capacidadOperativa: z.string().trim().max(2000).nullable().optional(),
  experiencia: z.string().trim().max(2000).nullable().optional(),
  certificacionesDeclaradas: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  preferencias: z.string().trim().max(2000).nullable().optional(),
});

export type CompanyProfileInput = z.infer<typeof companyProfileSchema>;

// ---- Fase D: soporte, consentimientos, notificaciones, cuotas, admin ----

export const supportTicketSchema = z.object({
  subject: z.string().trim().min(2, 'El asunto es obligatorio.').max(200),
  message: z.string().trim().min(1, 'Describe tu consulta.').max(5000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional().default('normal'),
});

export const supportMessageSchema = z.object({
  message: z.string().trim().min(1, 'El mensaje no puede estar vacío.').max(5000),
});

export const supportTicketStatusSchema = z.object({
  status: z.enum(['open', 'pending', 'resolved', 'closed']),
});

export const consentSchema = z.object({
  purpose: z.enum(['marketing', 'newsletter', 'service_alerts', 'analytics']),
  granted: z.boolean(),
  textVersion: z.string().trim().min(1).max(100),
});

export const notificationPreferencesSchema = z.object({
  serviceAlerts: z.boolean(),
  weeklyDigest: z.boolean(),
});

export const usageReserveSchema = z.object({
  kind: z.enum(['personalized_analysis', 'chat_question']),
  referenceId: z.string().uuid().optional(),
  idempotencyKey: z.string().trim().min(1).max(128),
});

export const usageSettleSchema = z.object({
  reserveIdempotencyKey: z.string().trim().min(1).max(128),
});

export const adminSettingsSchema = z.object({
  key: z.string().trim().min(1).max(100),
  value: z.unknown(),
});

export const emailWebhookSchema = z.object({
  email: emailSchema,
  eventType: z.enum(['delivered', 'bounced', 'complained', 'opened', 'clicked']),
  providerEventId: z.string().trim().max(200).optional(),
  outboxId: z.string().uuid().optional(),
});
