# LicitaClima — Arquitectura

Estado: MVP de las Fases B–F fusionado en `master` (2026-11-14). Ver
`docs/validation-report.md` para qué está probado y qué queda pendiente.

## 1. Visión general

Servicio por suscripción (49 €/mes + impuestos) que localiza licitaciones
públicas españolas de climatización, lee los pliegos y explica qué piden,
con referencias verificables. Resumen **semanal** + alertas (decisión de Jon
2026-11-14; nunca se promete resumen diario ni 10 oportunidades).

```
                 ┌─────────────┐
                 │  Caddy (:80/443, Oracle; pendiente) │
                 └──────┬──────┘
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
  apps/web         apps/api          apps/worker
  (Vite+React,    (Fastify,        (jobs: ingesta,
   prerender       /api/v1,          documentos, extract,
   estático)       OpenAPI)         analyze, publish,
                                     alerts, digest,
                                     billing, email)
        │               │                │
        └───────────────┼────────────────┘
                        ▼
              PostgreSQL 16 (Drizzle)
              + volumen privado de pliegos
```

## 2. Monorepo (pnpm workspaces, TypeScript, Node ≥ 22)

| Paquete | Contenido |
|---|---|
| `apps/web` | React 19 + Vite + React Router. Páginas públicas prerenderizadas (`scripts/prerender.mjs`), panel cliente y panel admin (UI). |
| `apps/api` | Fastify, rutas `/api/v1`, OpenAPI (`apps/api/openapi.json`, 42 rutas / 48 operaciones), `server.ts` + CLI admin (`src/cli.ts`). |
| `apps/worker` | Orquestador de trabajos sobre la tabla `jobs` (claim `FOR UPDATE SKIP LOCKED`), CLI por lotes y demonio `schedule`. |
| `packages/config` | Única fuente de precios y límites (`PLAN`, `NICHO`, `SOURCES`, `LIMITS`). Cambiar un precio/límite se hace aquí. |
| `packages/domain` | Tipos de dominio + reglas puras: extracción determinista (`extraction.ts`), clasificación del nicho y resolución de provincia (`classify.ts`, `province.ts`). |
| `packages/db` | Esquema Drizzle (36 tablas), migraciones `0000–0002`, seed con datos reales, `createDb`/`createPool`, utilidades de test. |
| `packages/integrations` | Adaptadores externos: Atom, SSRF, PDF (pdfjs-dist), Stripe (solo test), correo (sin proveedor), LLM (`NoLlmProvider`). |
| `packages/prompts` | Prompts versionados (sin uso activo: no hay proveedor LLM). |

### Regla de build (Fase F)

Los 5 paquetes compilan TypeScript a `dist/` (`main`/`types` → `dist`).
`pnpm build` compila todo; `pnpm test` hace build antes (igual que CI).
El arranque de producción es Node sobre el código compilado:

```bash
node apps/api/dist/server.js
node apps/worker/dist/index.js [run|run-due|enqueue-ingest|digest|schedule]
```

Antes de la Fase F los paquetes apuntaban `main` a `./src/index.ts` y su
build era `--noEmit`, así que `node dist/...` fallaba con
`ERR_MODULE_NOT_FOUND`. La corrección obligó a romper el ciclo
`db ↔ integrations`: las funciones puras `classify.ts` y `province.ts`
viven ahora en `@licitaclima/domain` (que depende de `@licitaclima/config`);
`integrations` las re-exporta sin cambiar su API pública y `db` depende de
`domain`, no de `integrations`.

## 3. Modelo de datos (Drizzle, PostgreSQL 16)

37 tablas, migraciones versionadas en `packages/db/drizzle/`:

- **Identidad y tenant:** `users` (rol global `cliente` | `admin` | `owner`;
  el admin lleva TOTP y códigos de recuperación en el propio usuario),
  `organizations`, `memberships`, `sessions`, `login_tokens`.
- **Perfil:** `company_profiles`, `profile_versions`.
- **Ingesta:** `sources`, `ingestion_runs` (con `cursor_checkpoint` JSON:
  `next_url` + ETag/Last-Modified + páginas), `tenders`, `tender_versions`
  (la foto completa del expediente vive en `tender_versions.data` JSON),
  `lots`, `documents`, `document_versions`, `extracted_pages`.
- **Análisis:** `generic_analyses` (`provider = 'determinista-v1 (sin LLM)'`),
  `requirement_evidence` (`evidence` NULL = requisito sin evidencia; nunca
  se inventa), `matches`, `personalized_analyses`, `favorites`.
- **Comunicación:** `conversations`, `messages`, `email_outbox`
  (idempotente por `idempotency_key`), `email_events`, `consent_events`,
  `suppression_entries`, `notifications`, `notification_preferences`,
  `leads`, `attribution_events`.
- **Pagos:** `plans`, `subscriptions`, `usage_ledger`, `stripe_events`
  (único por `event_id`).
- **Operación:** `jobs` (cola persistente, `idempotency_key` único),
  `support_tickets`, `audit_logs`, `system_settings`.

Todo objeto privado lleva `organization_id`. Un UUID impredecible no
sustituye autorización: las rutas comprueban tenant en servidor (tests de
aislamiento multi-tenant en `apps/api`).

Dinero siempre como string decimal (`numeric` en BD, nunca float).
Instantes en UTC; las fechas oficiales conservan su zona y su precisión
(una fecha sin hora nunca gana una hora inventada: `deadline_at = NULL` +
`deadline_date_only = true`).

## 4. Pipeline de análisis

```
descubierto -> normalizado -> prefiltrado -> documentos_pendientes
  -> extraido -> analizado -> validado -> publicado
```

Alternativos: `sin_documentos`, `requiere_OCR`, `fuente_no_disponible`,
`revisión_requerida`, `fallido`. Cada trabajo tiene intentos, próximo
reintento (backoff con jitter), versión y trazabilidad (tabla `jobs`).

- **Ingesta:** feeds Atom oficiales 643 y 1044, paginación completa,
  checkpoint persistente, deduplicación por `<id>` Atom (`external_id`),
  reconciliación por re-ingesta (barata e idempotente). Solo núcleo +
  limítrofe se publican; los marginales van a revisión.
- **Documentos:** solo PCAP/PPT de dominios en allowlist, con defensa SSRF
  (DNS + IP privada/reservada + redirección fuera de allowlist bloqueadas),
  máx. 20 MB y 200 páginas, firma y MIME validados. Descarga una vez por
  hash; los pliegos viven en volumen privado (`DOCUMENTS_DIR`,
  por defecto `apps/worker/data/documents`), los metadatos en PostgreSQL.
- **Extracción determinista v1 (sin LLM):** esquema Zod validado; cada
  afirmación lleva documento, hash, página y fragmento. Campos ausentes:
  `null` + motivo. Las instrucciones dentro de un PDF no se ejecutan
  (se cuentan como `instruccionesDetectadas`, sin efecto).
- **Análisis:** matriz de encaje por requisito (compatible / incompatible /
  desconocido / no_aplica) contra el perfil declarado. Un requisito
  obligatorio incompatible bloquea la recomendación positiva; un requisito
  desconocido no equivale a cumplido. El score no es probabilidad de ganar.
- **Publicación:** solo núcleo/limítrofe con extracción válida y estado
  PUB. Una rectificación re-procesa el expediente e invalida los matches
  derivados (son derivados: se recalculan, no se parchean).

## 5. Trabajos del worker

| Job | Cadencia | Descripción |
|---|---|---|
| `ingest` | cada 6 h | Feeds 643 y 1044 (encolado con anti-duplicado: no se encola si hay otra ingesta pendiente/en curso). |
| `documents` / `extract` / `analyze` / `publish` / `alerts` | por expediente, vía cola | Cadena del pipeline; `alerts` avisa a las orgs de la provincia. |
| `digest-weekly` | lunes 09:00 Europe/Madrid | Resumen semanal por org con suscripción activa; si no hay novedades, registra `sin_novedades` y **no** envía un correo vacío. |
| `billing-events` | cada 15 min | Aplica eventos Stripe pendientes (idempotente, tolera duplicados y desorden). |
| `billing-reconcile` | diaria | Conciliación con Stripe. Sin claves: `pending`. |
| `email-outbox` | cada 15 min | Envía el outbox con el proveedor configurado. Sin proveedor: `pending`, no envía nada. |

Dos modos de ejecución: por lotes desde cron externo
(`run`, `run-due`, `enqueue-ingest`) o demonio en proceso único
(`schedule`: cola cada 15 min, ingesta cada 6 h, conciliación diaria,
digest semanal). Ver `docs/operations.md`.

## 6. API (`/api/v1`, Fastify + Zod + OpenAPI)

42 rutas / 48 operaciones en `apps/api/openapi.json` (regenerar con
`pnpm --filter @licitaclima/api gen:openapi`; también se sirve en
`GET /api/v1/openapi.json`).

- **Auth:** `POST /auth/request-link` (respuesta genérica anti-enumeración),
  `GET /auth/verify-link` (no consume), `POST /auth/consume-link`
  (confirmación POST; el GET del correo no consume el token),
  `POST /auth/logout`, `GET /me`.
- **Cliente:** `GET/PATCH /company-profile` (versionado),
  `GET /billing/subscription`, `POST /billing/checkout|portal|cancel`,
  `GET /usage`, `POST/GET /usage/reserve|confirm|release`,
  `GET/POST /support/tickets`, `GET /notifications`,
  `GET/PATCH /notification-preferences`, `GET/POST /consents`,
  `POST /webhooks/stripe`, `POST /webhooks/email`.
- **Admin:** `POST /auth/admin/login|reauth`, `GET /admin/summary|funnel|
  finance|customers|quality|sources|comms|support|settings|audit|health`,
  `PATCH /admin/settings`, `POST /admin/support/tickets/:id/...`.

**Hueco conocido (Fase F, no resuelto):** la web llama a rutas que la API
todavía no tiene — `GET /opportunities`, `GET /opportunities/:id`,
`POST /opportunities/:id/analyses`, `GET /analyses/:id`,
`GET|POST /analyses/:id/questions`, `GET /analyses/:id/pdf`,
`POST|DELETE /favorites/:id`, `PATCH /opportunities/:id/status`,
`POST /leads`, `GET /public/coverage`, `GET /public/sample`,
`GET /company-profile/versions`, `GET /admin/finances`,
`GET /admin/communications`. Todas devuelven 404 hoy. El panel cliente y
el chat existen como UI, pero sin backend. Es la pieza que falta para el
flujo completo muestra → análisis → pregunta; ver
`docs/validation-report.md` §5.

## 7. Web

Vite + React 19 + React Router. Páginas públicas prerenderizadas a HTML
estático (`scripts/prerender.mjs`, 10 rutas + `sitemap.xml` + `robots.txt`):
el mismo HTML lo recibe todo el mundo (sin render distinto para bots) y
React lo hidrata. El panel (`/app/*`) y el admin (`/admin/*`) son SPA
privada. La UI nunca inventa datos: si un endpoint falta, muestra
«Pendiente» / N/D.

## 8. Configuración versionada

Precios y límites viven en `packages/config/src/index.ts` (`PLAN`:
49 €/mes + impuestos, 1 usuario, 1 perfil, 3 provincias, 10 análisis/mes,
100 consultas/periodo, gracia de 3 días; `NICHO`: 5 CPV + 9 palabras clave;
`SOURCES`: feeds y cadencia de 6 h; `LIMITS`: PDF 20 MB/200 páginas,
magic link 15 min, sesión 30 días). Stripe toma el `price_id` de la
configuración permitida, nunca del cliente.

## 9. Observabilidad y límites

- Logs estructurados con `request_id`/`job_id` (Fastify + pino en la API,
  JSON en el worker); datos personales minimizados.
- Salud: `GET /health/live` (siempre ok) y `GET /health/ready` (BD, LLM,
  Stripe, correo — con su estado real, `pending` cuando falta).
- Límites de gasto LLM: sin proveedor no hay gasto posible; el adaptador
  es `NoLlmProvider` y cualquier intento de completar lanza un error
  explícito. Cuando Jon elija proveedor, habrá que añadir presupuesto
  diario/mensual y por organización antes de activar nada.
- Pausas de admin en `system_settings` (`pause.*`): captación, campañas,
  nuevos análisis y envíos no esenciales. No bloquean acceso, cancelación
  ni operaciones de seguridad.
