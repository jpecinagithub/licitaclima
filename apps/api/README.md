# LicitaClima API

Fastify + Zod + OpenAPI. Español de España, EUR, instantes en UTC.

## Arranque

```bash
pnpm --filter @licitaclima/api dev   # :3001
```

## Variables de entorno

| Variable | Obligatoria | Descripción |
|---|---|---|
| `DATABASE_URL` | sí | PostgreSQL 16, p. ej. `postgres://licitaclima:licitaclima@localhost:5432/licitaclima` |
| `ADMIN_SECRETS_KEY` o `SESSION_SECRET` | sí en producción | Clave para cifrar secretos de admin (TOTP). Sin ella, `createAdmin`/login admin fallan. |
| `WEB_PUBLIC_URL` | no | Origen del frontend para CORS/CSRF (`http://localhost:5173`) |
| `API_PUBLIC_URL` | no | URL pública de la API |
| `STRIPE_SECRET_KEY` | no | Clave **test** de Stripe (`sk_test_…`). Vacía → Stripe PENDIENTE, checkout 503 `stripe_not_configured`. Una clave live se rechaza. |
| `STRIPE_WEBHOOK_SECRET` | no | Secreto del webhook de Stripe (`whsec_…`). |
| `STRIPE_PRICE_ID` | no | Price ID permitido (`price_…`). El backend nunca acepta importes del cliente. |
| `STRIPE_PUBLISHABLE_KEY` | no | Clave publicable (test). |
| `EMAIL_PROVIDER` | no | `none` (por defecto: outbox en BD sin envío, PENDIENTE) u otro proveedor cuando se implemente. |
| `EMAIL_FROM` | no | Remitente, p. ej. `noreply@licitaclima.es`. |

## Tests

```bash
pnpm --filter @licitaclima/api test
```

Los tests usan **PostgreSQL real** (nunca pg-mem): cada fichero crea su
propia base `licitaclima_test_<hex>` con las migraciones reales y la borra
al terminar. Requiere que el rol de `DATABASE_URL` tenga `CREATEDB` y que
el cluster PostgreSQL 16 esté en marcha (`sudo pg_ctlcluster 16 main start`
si está parado). `TEST_DATABASE_URL` puede apuntar a otra base para derivar
las bases de test.

Las claves `ADMIN_SECRETS_KEY`/`SESSION_SECRET` las fija el setup de Vitest
(`src/test-setup.ts`) con valores **solo de test** si el entorno no las
aporta; en producción siempre vienen del entorno del servidor.

## OpenAPI

```bash
pnpm --filter @licitaclima/api exec tsx src/openapi-gen.ts   # regenera openapi.json
```

También se sirve en vivo en `GET /api/v1/openapi.json`.
