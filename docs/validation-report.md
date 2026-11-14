# LicitaClima — Informe de validación (Fase F)

Fecha: 2026-11-14. Plataforma de verificación: VM de desarrollo
(Linux, Node v24.22.1, pnpm 10.34.9, PostgreSQL 16.15 real en
localhost:5432). Instantes en UTC; zona Europe/Madrid donde aplica.

Este informe diferencia **probado localmente**, **probado con proveedor
en test** y **pendiente**, como exige el prompt §14. Nada de lo pendiente
se presenta como operativo.

## 1. Fusión en master

| Rama | Commits | Merge en master |
|---|---|---|
| `block/web` | b3a3244, f53350f | `c3205ef` |
| `block/fase-b` | 957714d..6987ce7 | `dbf4df0` |
| `block/fase-c` | 1992281..8622670 | `2ccc37f` |
| `block/fase-d` | 435d0c1..113e352 | `324b714` |
| `block/api-lectura` | ecd9e2b..edab059 | `49596b1` |

Merges con `--no-ff`, sin reescribir historia. Conflictos resueltos:

- `pnpm-lock.yaml` (Fase C y Fase D, add/add y contenido): regenerado con
  `pnpm install` con las dependencias de ambas ramas. El lockfile no se
  puede escribir directamente en esta VM (EPERM en `chown` del overlay);
  se generó en `/tmp` y se copió. Verificado con
  `pnpm install --frozen-lockfile`.
- `apps/worker/package.json`, `packages/integrations/package.json`,
  `packages/integrations/src/index.ts` (Fase D): resueltos por unión
  (C aporta Atom/PDF; D aporta Stripe/correo).

Además, en `master` y antes de las pruebas: commit `1429f81` con el
`.npmrc` (`manage-package-manager-versions=false`, necesario en esta VM).

## 2. Build, tipos y tests (master fusionado)

Comandos: `pnpm install --frozen-lockfile`, `pnpm build`,
`pnpm typecheck` (`tsc -p tsconfig.app.json` por app, nunca `tsc --noEmit`
a secas), `pnpm test` (hace `build` antes, como CI).

| Paso | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | OK |
| `pnpm build` | OK (web incl. prerender: 10 rutas + sitemap + robots) |
| `pnpm typecheck` | OK (8 paquetes; el 9.º es la raíz, sin script propio) |

Tests por paquete (Vitest, PostgreSQL 16.15 real donde aplica), tras el
merge de `block/api-lectura` (2026-11-14, master `49596b1`):

| Paquete | Tests |
|---|---|
| `packages/domain` | 26 passed (3 ficheros) |
| `apps/web` | 15 passed (4 ficheros) |
| `packages/db` | 13 passed (2 ficheros) |
| `packages/integrations` | 36 passed (5 ficheros) |
| `apps/worker` | 32 passed (7 ficheros) |
| `apps/api` | 103 passed (20 ficheros) |
| `packages/config`, `packages/prompts` | 0 (sin tests por diseño; `--passWithNoTests`) |
| **Total** | **225 passed, 0 failed** |

El merge añadió `dotenv` en `@licitaclima/db` y `pdfkit` en la API
(lockfile ya actualizado en la rama, `ecd9e2b`); en un checkout de
master con `node_modules` anterior al merge el typecheck de `db`
fallaba (`Cannot find module 'dotenv'`) hasta correr `pnpm install`.
Tras `pnpm install --frozen-lockfile`, typecheck en verde en los 8
paquetes.

Arreglos de Fase F incluidos (commit `f452f92`):

- Worker typecheck: `@types/node` declarado + `types: ["node"]`
  (antes solo llegaba transitivo vía vitest).
- `node dist/index.js` / `node dist/server.js`: los paquetes apuntaban
  `main` a `./src/index.ts` y su build era `--noEmit`. Ahora emiten a
  `dist/` y ambos arranques funcionan (antes: `ERR_MODULE_NOT_FOUND`).
  Requirió romper el ciclo `db ↔ integrations` moviendo `classify.ts` y
  `province.ts` (+tests) a `@licitaclima/domain`.
- Jobs de Fase D cableados en el worker (`billing-reconcile`,
  `billing-events`, `email-outbox`) + comando `schedule` (cola 15 min,
  ingesta 6 h, conciliación diaria, digest lunes 09:00 Europe/Madrid).
- `nextMonday0900Madrid` corregido (el cálculo inicial nunca alcanzaba
  las :00 por redondeo de minutos) y verificado: sáb 2026-11-14 →
  lun 2026-11-16T08:00:00Z (= 09:00 CET).

Flaky corregido en `03770fc`: el test del pliego real de 52 páginas
tardaba ~1,5 s solo pero >5 s con la suite en paralelo (timeout de
vitest); timeout a 30 s. No es una regresión.

## 3. Verificado con datos reales

### 3.1 Seed y migraciones desde cero (probado localmente)

BD limpia `licitaclima_clean`: migraciones `0000`, `0001`, `0002`
aplicadas; seed → **913 tenders** (709 núcleo / 42 limítrofe /
162 marginal), 913 `tender_versions`, 37 tablas (+ la tabla de
migraciones de Drizzle). Seed idempotente
(segunda siembra: sigue 913). Coincide con la BD de desarrollo.

### 3.2 Ingesta en vivo (probado localmente, fuente oficial)

`run ingest --feed 643 --max-pages 2` en master: 2 páginas, **1.002
entradas**, 0 nuevos, 17 actualizados/rectificados, parado por
`max-paginas` (checkpoint y deduplicación funcionan: la re-ingesta no
duplica). Tras la ingesta aparecieron 3 expedientes PUB nuevos con
pliegos (9124/2026, 2026-0667, 2026-0666).

### 3.3 Pipeline de documentos y análisis (probado localmente, pliegos reales)

Expediente 9124/2026 (núcleo, Asturias, PUB), cadena completa:

- `documents`: 2 PDF descargados en vivo de la fuente oficial.
- `extract`: 6 requisitos con evidencia, 2 sin evidencia, 0 obligatorios
  sin evidencia, 0 instrucciones detectadas.
- `analyze`: recomendación `revisar`, `provider = 'determinista-v1 (sin LLM)'`.
- `publish`: `published: true`, pipeline `publicado`.
- `requirement_evidence`: 8 filas; `condiciones-pago` y
  `visita-obligatoria` con `evidence = NULL` (sin evidencia, sin inventar).

Casos límite verificados en la misma sesión: expediente marginal
(5734/2026) → `publish: false`, `revision_requerida` (correcto: los
marginales no se publican); expediente sin pliegos (78/26) →
`sin_documentos`; expediente 04/2026 (marginal) → analyze OK,
publish rechazado.

### 3.4 Backup y restauración (probado localmente, entorno aislado)

`pg_dump -Fc` de `licitaclima` (1,1 MB, 0,35 s) → `pg_restore` en
`licitaclima_restore` (0,33 s) → conteos idénticos: tenders 913,
documents 4, jobs 25, users 0. **Limitación:** solo la BD; los pliegos
en disco (`apps/worker/data/documents`) no se restauraron en esa prueba.
RPO 24 h / RTO 8 h siguen sin prometerse (una sola medición local).

### 3.5 E2E manual (probado localmente, curl + BD; sin Playwright)

Servidores desde `dist`: API :3001 + web preview :4173.
`/health/ready` → `{"status":"ok","db":"ok","llm":"none",
"stripe":"pending","email":"pending"}`.

| Paso | Resultado |
|---|---|
| Muestra | `GET /` 200, `GET /muestra` 200 (prerender con contenido real; 49 €/mes visible). `POST /leads` → 200 (antes 404; ruta añadida en `block/api-lectura`, ver §5). |
| Registro | `POST /auth/request-link` 200 genérica + 1 fila `login_tokens` + 1 fila `email_outbox` (`magic_link`, `pending`, sin envío). Token obtenido con el mismo código que lo genera (`requestMagicLink`, vía `node`, documentado: sin proveedor de correo no hay otro canal). `GET /auth/verify-link` dos veces → `valid: true` (el GET no consume). `POST /auth/consume-link` → 200, usuario + organización creados (rol `owner`), cookie de sesión. Tras el consumo → `valid: false`; reuso → 410 `invalid_link`. `GET /me` → 200. |
| Perfil | `GET /company-profile` inicial → 404 `not_found`. `PATCH` (Madrid/Toledo/Guadalajara, RITE, etc.) → 200, versión 1. `GET` → perfil guardado. 1 fila en `profile_versions`. |
| Análisis | Ver §3.3 (cadena completa con pliegos reales, publicado). En la sesión de `block/api-lectura`: `POST /opportunities/:id/analyses` → 202 con `consumedQuota=true` y 9 análisis restantes; `run personalized-analyze` → `done`, recomendación «negativa» (correcta: perfil Madrid/Toledo/Guadalajara frente a licitación en Asturias). `GET /analyses/:id` → 200 (`estado=analizado`, `status=done`, 10 requisitos, 6 con evidencia). Revisita → 200 `consumedQuota=false` (`revisit_or_rectification`). `GET /analyses/:id/pdf` → 200, 24.681 bytes, `%PDF`. |
| Pregunta | `POST /analyses/:id/questions` → 201 con citas (`sinEvidencia=false`, 3 citas) y 201 `sinEvidencia=true` («Sin evidencia en los documentos…») para «¿Cuál es la política de dividendos de la empresa?»; historial → 200 (8 mensajes). |
| Favoritos | `POST /favorites/:id` → 200 (`favorito=true`); `PATCH /favorites/:id` → 200 (`estado=estudiar`); `DELETE /favorites/:id` → 204 y `favorito=false` en la ficha. |
| Cross-org (paso 26) | Segundo usuario: `GET /analyses/:id` ajeno → 404; favoritos propios vacíos; sin perfil → 404; la licitación pública 9124/2026 sí es visible. Id malformado → 404 (no 500). El usuario A sí lee su propio análisis → 200. |
| Cancelación | `GET /billing/subscription` → 200 (`free`, plan 49 €, 10 análisis / 100 chat). `POST /billing/cancel` → **503 `stripe_not_configured`** (sin claves Stripe; pendiente). `GET /usage` → 200 (10 análisis y 100 chat restantes). |
| Digest | `digest --org <id E2E>` → en la sesión de Fase F dio `sin_novedades` porque ningún expediente estaba aún en `publicado` (el seed los deja en `descubierto`/`validado` y solo la cadena documents→extract→analyze→publish los publica). En la sesión de `block/api-lectura`, tras publicar 2167/2026 (Guadalajara) y 2754/2026 (Toledo), el digest de la semana 2026-11-09 para la org de Madrid/Toledo/Guadalajara dio `enviado` con 2 novedades y 1 fila en `email_outbox` (`resumen_semanal`, `pending`, sin envío). Matiz: ambas se publicaron con `sin_documentos` (sin pliegos descargables en el feed) y sin análisis genérico (0 requisitos); el digest las lista igualmente (ver §5, punto 10). |
| Jobs Fase D | `run billing-reconcile` → `pending/stripe_not_configured`. `run billing-events` → 0 procesados. `run email-outbox` → `pending/email_not_configured`. `schedule` arranca, ejecuta los ticks (due 6/6, ingest encolado, reconcile pending) y calcula el próximo digest (lun 2026-11-16T08:00:00Z). |

Defectos encontrados por este E2E y corregidos en la rama (`edab059`,
antes del merge):

1. `DELETE /favorites/:id` con `Content-Type: application/json` y sin
   cuerpo devolvía **500** (`FST_ERR_CTP_EMPTY_JSON_BODY`): el cliente
   web enviaba ese header en todas las peticiones. El cliente ya no
   envía `Content-Type` sin cuerpo (`apps/web/src/lib/api.ts`) y el
   error handler de la API mapea los errores `FST_ERR_CTP_*` a 400
   `validation_error`, nunca 500. El parser propio de
   `application/json` no era viable: `billing.ts` ya registra uno
   (cuerpo crudo para la firma del webhook de Stripe) y Fastify no
   admite dos para el mismo content-type.
2. La pregunta «¿Cuál es la política de dividendos de la empresa?»
   casaba páginas que solo contienen la palabra genérica «empresa»
   (`sinEvidencia=false` con citas falsas). El comparador determinista
   exige ahora **≥2 términos distintos** cuando la pregunta tiene 2 o
   más (1 basta para preguntas de un solo término).

## 4. Probado con proveedor en test

**Nada.** Stripe y correo no tienen claves ni proveedor; el LLM no tiene
proveedor. No hay ninguna prueba con proveedor en test en este informe.
Lo que existe es código + tests que verifican el comportamiento *sin*
proveedor (503/pending explícitos, sin simulación de éxito).

## 5. Pendiente (con causa)

1. **~~Rutas API de oportunidades / análisis / chat / favoritos / leads /
   públicas~~ — RESUELTO 2026-11-14.** Merge `49596b1`
   (`block/api-lectura`, `ecd9e2b..edab059`): `GET /opportunities`,
   `POST /opportunities/:id/analyses`, `GET /analyses/:id`,
   `POST /analyses/:id/questions`, `GET /analyses/:id/pdf`, favoritos,
   `POST /leads`, `GET /public/*`, `GET /company-profile/versions`,
   `GET /admin/finances`, `GET /admin/communications`. E2E completo en
   §3.5 (26/26 pasos + digest con novedades + cross-org). Quedaba el
   hueco principal del MVP; ya no lo es.
2. **Stripe en test**: sin claves. Causa: pendiente de Jon. Bloquea
   checkout, portal, cancelación y webhooks reales.
3. **Correo**: sin proveedor. Causa: pendiente de Jon (Gmail dedicada o
   transaccional). Bloquea el registro por magic link de extremo a
   extremo.
4. **LLM**: sin proveedor ni modelo. Causa: pendiente de Jon (xAI o
   Top Tools AI). Bloquea chat y análisis personalizado; la extracción
   determinista no es análisis LLM y nunca se presenta como tal.
5. **E2E con Playwright**: no ejecutado. Causa: Playwright no está
   instalado ni hay navegadores en esta VM. El E2E de §3.5 es manual
   (curl + BD) y documenta cada paso con su evidencia.
6. **Despliegue en Oracle**: no desplegado. Causa: SSH bloqueado
   2026-11-14. El runbook está en `docs/operations.md` §7; las imágenes
   Docker no se han construido nunca (sin Docker en esta VM).
7. **Helmet/CSP**: no configurados. Causa: no implementados; van antes
   del lanzamiento.
8. **Borrado/exportación de cuenta y retención**: sin definir. Causa:
   decisión pendiente de Jon.
9. **Textos legales**: plantillas pendientes de completar y revisar.
10. **Licencia de Hacienda**: aviso legal y spec v1.3 sin verificar
    desde esta VM.
11. **Publicar sin extracción**: `run publish` marca `publicado` aunque
    el expediente no tenga documentos ni análisis genérico (verificado
    2026-11-14 con 2167/2026 y 2754/2026: `sin_documentos`, 0
    requisitos) y el digest lo lista igualmente. Causa: el job de
    Fase C no exige extracción previa. **Decisión de Jon 2026-11-14:
    aceptado como «publicado sin pliegos»** — la ficha sin requisitos
    se publica y se lista igual; sin cambio de código (el
    comportamiento ya era ese).

## 6. Datos de la verificación E2E (para reproducir)

- Usuario E2E: `e2e-fase-f@licitaclima.test`, org
  `2445fc85-5757-4149-93d7-64884f45e0ba`, perfil
  `5d5b65c5-590e-4aac-b0e9-6fdedc794ad5` (v1). Queda en la BD de
  desarrollo `licitaclima` como evidencia; no es un usuario real.
- Expedientes procesados en la sesión: 9124/2026 (publicado),
  5734/2026 y 04/2026 (marginales, a revisión), 78/26
  (`sin_documentos`), PSS/2026/0000130740 (re-procesado por rectificación
  en la ingesta en vivo: volvió a `documentos_pendientes`).
- Estado final de la BD de desarrollo tras la sesión: 913 tenders
  (el seed) + actualizaciones de la ingesta en vivo; documents 8;
  jobs 50 (incluye los encolados por las pruebas del programador);
  `generic_analyses` 4 (Badajoz, 04/2026, 5734/2026, 9124/2026).

Sesión de verificación de `block/api-lectura` (2026-11-14, rama
`edab059`, servidor :3001 desde `dist`, PostgreSQL 16 real):

- Usuarios E2E: `e2e-lectura@licitaclima.test` (org A
  `640f9b2b-41ca-410c-834d-9de4ada15132`), `e2e-cross@licitaclima.test`
  (org B), `e2e-flujo@licitaclima.test` (org C
  `79fbd133-f919-433c-b692-59b9912dc9ce`, perfil Madrid/Toledo/
  Guadalajara v1). Suscripción de prueba en org C (plan
  `licitaclima-mensual-v1`, `cus_test_e2e`/`sub_test_e2e`, periodo
  2026-11-13 → 2026-12-13): sin ella el plan gratuito muestra la cuota
  (10 análisis / 100 chat) pero `POST /opportunities/:id/analyses`
  devuelve 409 `quota_exceeded` («Se requiere una suscripción activa
  para usar esta cuota»).
- Análisis: A `e96c1d22-bc50-497b-9a80-09b49bfb2b33` sobre 9124/2026;
  C `1f159b99-1615-45b1-ba4e-cbaa7b6d616d` (job
  `72e95ac6-716e-4326-9050-cfab7ca388f9`, recomendación «negativa»).
- Expedientes publicados por la cadena en esta sesión: 2167/2026
  (Guadalajara) y 2754/2026 (Toledo), ambos `sin_documentos` y sin
  análisis genérico; digest semanal 2026-11-09 de org C: `enviado`
  con esas 2 novedades (1 fila `resumen_semanal` en outbox).
- La BD de desarrollo se limpió al cerrar el bloque (ver §3.5): se
  resembró desde cero y quedaron solo los 913 expedientes del seed;
  los usuarios/orgs/suscripciones/análisis/favoritos/jobs/outbox del
  E2E se eliminaron. `data/seed/seed-manifest.json` se commiteó en
  master tras la resiembra final.
