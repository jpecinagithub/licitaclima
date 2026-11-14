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

## Variables de entorno de tests

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | PostgreSQL 16 real (base de desarrollo). Es la base desde la que se crean las bases de test si no se define `TEST_DATABASE_URL`. |
| `TEST_DATABASE_URL` | Opcional: base alternativa para derivar las bases `licitaclima_test_<hex>` (una por fichero de test, borrada al terminar). |
| `SESSION_SECRET` / `ADMIN_SECRETS_KEY` | Solo las fija el setup de Vitest con valores de test; no hace falta definirlas para `pnpm test`. |

## API de lectura (block/api-lectura)

Oportunidades, análisis personalizados, chat determinista, favoritos,
leads y endpoints públicos (`apps/api/src/routes/opportunities.ts`,
`analyses.ts`, `favorites.ts`, `leads.ts`, `public.ts`):

| Ruta | Descripción |
|---|---|
| `GET /opportunities` | Solo núcleo + limítrofe PUB por defecto. Filtros: provincia, estado, clase, texto, estadoPersonal, favorito; orden y paginación (`page`, `limit` máx. 100). |
| `GET /opportunities/:id` | Ficha con lotes, documentos y requisitos del análisis genérico. Los marginales dan 404. |
| `POST /opportunities/:id/analyses` | Reserva cuota atómica y encola `personalized-analyze` (202 + `jobId`). Revisitar no consume. |
| `GET /analyses/:id` | Estado + resultado con evidencias. |
| `GET /analyses/:id/pdf` | PDF del análisis (extracción determinista v1, sin LLM). Solo si está terminado (si no, 409). |
| `POST /analyses/:id/questions` | Respuesta DETERMINISTA con citas de los fragmentos extraídos, o «Sin evidencia en los documentos». Consume 1 consulta de chat. Sin LLM. |
| `GET /analyses/:id/questions` | Historial de la conversación del expediente. |
| `POST/DELETE /favorites/:id` | Favorito por organización. |
| `PATCH /opportunities/:id/status` | Estado personal: pendiente/estudiar/descartada/presentada. |
| `POST /leads` | Público, rate limit 10/15 min. Consentimiento de marketing solo si se marca; sin envío de correo. |
| `GET /public/coverage` | Fuentes 643/1044 + última sincronización real + conteos reales. Sin afirmar cobertura exhaustiva. |
| `GET /public/sample` | Oportunidades PUB de núcleo reales, limitadas, sin registro. |
| `GET /company-profile/versions` | Historial de versiones del perfil. |

El trabajo `personalized-analyze` vive en `apps/worker/src/jobs/personalized.ts`:
ejecuta la cadena documents → extract → analyze con el perfil de la
organización, marca el análisis `done` y confirma la cuota; si no hay
documentos, marca `failed` y libera la cuota.

## OpenAPI

```bash
pnpm --filter @licitaclima/api exec tsx src/openapi-gen.ts   # regenera openapi.json
```

También se sirve en vivo en `GET /api/v1/openapi.json`.
