# Fase D (+ panel admin de la Fase E) — backend

Rama `block/fase-d` (desde `origin/block/fase-b`). Estado: 2026-11-14.

## Implementado

- **Stripe (solo test, solo con configuración)** — `packages/integrations/src/stripe.ts`:
  `stripe_not_configured` → checkout 503; clave live rechazada
  (`stripe_live_not_allowed`). `price_id` solo desde `STRIPE_PRICE_ID`.
  Webhook con firma sobre raw body, `event_id` único, persistencia +
  encolado en `jobs` y aplicación idempotente en el worker (duplicados y
  eventos fuera de orden tolerados; `last_stripe_event_at` en suscripciones).
  Eventos: `checkout.session.completed`, `invoice.paid`,
  `invoice.payment_failed`, `customer.subscription.updated/deleted`,
  `charge.refunded`/`charge.dispute.created` (registrados para revisión, sin
  reembolso automático). Estados: free/active/past_due/
  canceled_at_period_end/ended; gracia de 3 días (PLAN). Cancelar mantiene
  acceso hasta final pagado. Reconciliación diaria en
  `apps/worker/src/jobs/billing.ts` (solo con claves).
- **Cuotas atómicas** — `apps/api/src/lib/quotas.ts` + `POST /usage/*`:
  reserva/confirma/libera sobre `usage_ledger`, transacción con
  `SELECT ... FOR UPDATE` + clave de idempotencia; límites del PLAN
  (10 análisis, 100 consultas por periodo de suscripción). Revisitar un
  análisis o una rectificación del mismo expediente NO consume.
- **Correo** — `packages/integrations/src/email.ts` + outbox transaccional
  (`email_outbox`), supresión (`suppression_entries`) y consentimientos
  (`consent_events`). Job `apps/worker/src/jobs/email-outbox.ts`: sin
  proveedor deja todo en `pending` y no envía nada. Aceptado por proveedor
  ≠ entregado (la entrega solo la confirma el webhook). Baja de marketing
  no cancela comunicaciones de cuenta; desactivar alertas no cancela la
  suscripción. Doble confirmación para boletines; baja sencilla por enlace
  firmado (HMAC).
- **Soporte** — `POST/GET /support/tickets` con conversación; respuestas de
  admin en `/admin/support/tickets/:id/messages`. Regla documentada en el
  código: el agente nunca promete compensaciones ni modifica datos sensibles
  desde texto libre.
- **Admin** — `/admin/*`: resumen, embudo (N/D donde falta dato), finanzas
  (MRR sin impuestos; LTV null con muestra <10; no se confunde margen con
  beneficio), clientes, calidad, fuentes/operaciones, comunicaciones,
  soporte (SLA interno 48 h), configuración versionada (`system_settings`)
  y auditoría. Pausas (`pause.capture/campaigns/new_analyses/
  non_essential_emails`) sin bloquear acceso ni cancelación. Todo acceso
  admin auditado; cambiar configuración exige reautenticación MFA.
- **Notificaciones** — `GET /notifications`, preferencias, consentimientos,
  baja firmada, webhook de correo, lectura del outbox propio.
- **Migración 0002** (`packages/db/drizzle/0002_orange_rhodey.sql`):
  `notifications`, `notification_preferences`, `subscriptions.
  last_stripe_event_at`, `email_outbox.category`.
- **Tests** — PostgreSQL real, 87 tests nuevos o tocados (ver abajo).
  Setup de Vitest en la API con claves solo de test (`src/test-setup.ts`).
- **OpenAPI** — regenerado: 42 rutas.

## PENDIENTE (con causa)

- **Stripe sin claves de test** (Jon no las ha aportado): checkout 503,
  webhook 503, reconciliación en `pending`. Sin claves no hay cobro ni
  activación real. Falta también decidir identidad comercial y revisión
  fiscal antes de cualquier cobro real.
- **Correo sin proveedor** (`EMAIL_PROVIDER=none`): outbox en `pending`,
  sin envíos. Pendiente: proveedor transaccional de dominio propio o Gmail
  dedicada + SPF/DKIM/DMARC + secreto de webhook.
- **LLM**: sigue sin proveedor (no es de esta fase).
- El cableado de los jobs al `worker/index.ts` lo hace la integración de la
  Fase F (esta fase solo crea `apps/worker/src/jobs/billing.ts` y
  `apps/worker/src/jobs/email-outbox.ts`, exportados y probados).
- El panel admin es API; la UI vive en `block/web` (Fase E).

## Tests (PostgreSQL 16.15 real, localhost:5432)

```bash
pnpm --filter @licitaclima/api test           # 64 passed
pnpm --filter @licitaclima/integrations test  # 10 passed
pnpm --filter @licitaclima/worker test        # 7 passed
pnpm --filter @licitaclima/db test            # 6 passed
```

Total Fase D: 87 tests. Sin variables de entorno (el setup de Vitest fija
claves solo de test). Typecheck limpio con `tsc -p tsconfig.app.json` por
app/paquete (api, worker, integrations, db, config, domain, prompts).
El typecheck de `apps/web` falla de forma preexistente (falta
`@types/react`; fuera del ámbito de esta fase).
