# LicitaClima — Fase C: ingesta, documentos, análisis y seed

**Rama:** `block/fase-c` · **Fecha:** 2026-11-14 · **Estado:** implementado y verificado (ver §7)

## 1. Qué se construyó

| Pieza | Ficheros |
|---|---|
| Adaptador Atom (feeds 643 y 1044) | `packages/integrations/src/atom.ts` |
| Clasificación nicho estricto (Fase A) | `packages/integrations/src/classify.ts` |
| Corrección de provincia (título > NUTS > órgano) | `packages/integrations/src/province.ts` |
| Protección SSRF + allowlist de dominios | `packages/integrations/src/ssrf.ts` |
| Descarga y extracción de texto de PDF (pdfjs-dist) | `packages/integrations/src/pdf.ts` |
| Esquemas Zod de extracción y matriz de encaje | `packages/domain/src/extraction.ts` |
| Capa de datos del worker (interfaz + memoria + Postgres) | `apps/worker/src/db.ts`, `apps/worker/src/pg-store.ts` |
| Jobs: ingest, documents, extract, analyze/publish, digest-weekly, alerts | `apps/worker/src/jobs/` |
| Seed con los 913 expedientes reales + fixtures DEMO aparte | `packages/db/src/seed.ts`, `packages/db/src/fixtures-demo.ts` |
| DDL provisional (hasta que Fase B entregue el esquema Drizzle) | `packages/db/src/provisional-schema.ts` |

## 2. Decisiones

- **Extracción determinista v1, SIN LLM** (proveedor sin elegir: xAI o Top Tools AI).
  Nunca se presenta como análisis LLM (`metodo: 'determinista-v1 (sin LLM)'`).
- **PDF con pdfjs-dist** (frente a pdf-parse): mantenido, sin ejecución de código
  del PDF (`isEvalSupported: false`), extracción por página con numeración original.
- **Provincia:** mapa NUTS-2021 completo (52 provincias + NUTS2 uniprovinciales).
  Códigos no resolubles (ES, ESZZZ, ES51, ES61, ES70, …) → `provincia = null`,
  nunca inventada. 93 de los 913 expedientes del seed quedan sin provincia
  (10,2 %); 84 de ellos ya venían como «(sin provincia)» en el pull de 30 días.
- **Deduplicación:** por `<id>` Atom (republicación con `<updated>` mayor se
  reprocesa como rectificación) y por (expediente+órgano). El upsert conserva
  los campos que una republicación parcial no trae (COALESCE), nunca los borra.
- **Rectificación (DOC_MOD):** sube la versión del expediente, invalida los
  análisis afectados y devuelve el expediente a `documentos_pendientes`.
- **Resumen semanal, no diario** (decisión de Jon 2026-11-14): sin novedades no
  hay envío; se registra `sin_novedades`. Las alertas solo saltan con novedad
  en las provincias del cliente. Todo va al outbox (`pending`); el proveedor
  de correo NO está configurado (Fase D), así que **nada se envía**.
- **Seed real:** los 913 expedientes de `data/volume-30d/niche_30d.json`
  (núcleo 709, limítrofe 42, marginal 162). Los marginales quedan en
  `revision_requerida` y no se publican. Fixtures sintéticos aparte, marcados
  DEMO, nunca mezclados (solo con `--demo`).
- **Base de datos:** PostgreSQL 16.15 real en `localhost:5432` (base
  `licitaclima`, usuario `licitaclima`). Sin pg-mem. El DDL provisional
  (`CREATE TABLE IF NOT EXISTS`) se retira cuando Fase B entregue las
  migraciones Drizzle; los nombres de tabla/columna siguen el prompt §8.

## 3. Pipeline

```
descubierto → normalizado → prefiltrado → documentos_pendientes
→ extraido → analizado → validado → publicado
Alternativos: sin_documentos | requiere_OCR | fuente_no_disponible
| revision_requerida | fallido
```

- Ingesta cada 6 h, checkpoint persistente (`ingestion_runs`: cursor `next_url`,
  ETag/Last-Modified), reintentos con backoff+jitter, salud de fuentes en
  `source_health` / `sources`.
- Documentos: solo PCAP+PPT al inicio; deduplicación por SHA-256 (un documento
  se extrae una sola vez); bytes en volumen privado (`DOCUMENTS_DIR`,
  por defecto `./data/documents`), metadatos en PostgreSQL.
- Extracción: requisitos con evidencia (documento, hash, página, fragmento);
  ausente = null + motivo; evidencia inexistente en un requisito obligatorio
  → `revision_requerida` (bloquea la publicación). Conflictos entre
  documentos en lista explícita. El texto del PDF es DATO: los fragmentos que
  parecen instrucciones se registran en `instruccionesDetectadas` y no se
  ejecutan (test de prompt injection incluido).
- Matriz de encaje: compatible / incompatible / desconocido / no_aplica.
  Obligatorio incompatible → recomendación negativa. Desconocido ≠ cumplido.
  El score es un recuento explicable, NO una probabilidad de ganar.

## 4. Seguridad

- SSRF: solo https, dominio en allowlist, DNS sin IP privadas/loopback/
  reservadas ni metadatos cloud (169.254.169.254), redirecciones revalidadas
  (máx. 5), tamaño máx. 20 MB, MIME `application/pdf`, firma `%PDF`.
  Un dominio nuevo NO se descarga sin revisión.
- XML sin DOCTYPE ni entidades externas (sin XXE).
- El HTML de rechazo del WAF no se guarda como documento (se detecta por
  MIME/firma → `fuente_no_disponible`).
- Sin secretos en git ni en logs. `DATABASE_URL` solo por entorno.

## 5. Uso

```bash
# Seed (PostgreSQL real)
DATABASE_URL=postgres://licitaclima:licitaclima@localhost:5432/licitaclima \
  pnpm --filter @licitaclima/db seed

# Worker
DATABASE_URL=postgres://licitaclima:licitaclima@localhost:5432/licitaclima \
  pnpm --filter @licitaclima/worker start -- run ingest --feed 643
DATABASE_URL=... pnpm --filter @licitaclima/worker start -- run ingest --feed 1044
DATABASE_URL=... pnpm --filter @licitaclima/worker start -- run-due
DATABASE_URL=... pnpm --filter @licitaclima/worker start -- digest --org <id>

# Tests
pnpm --filter @licitaclima/integrations test
pnpm --filter @licitaclima/domain test
pnpm --filter @licitaclima/db test
DATABASE_URL=... pnpm --filter @licitaclima/worker test   # incluye el test de integración Postgres
```

La cadencia de ingesta (cada 6 h) la lleva el planificador externo (cron);
el worker ejecuta un lote por invocación y sale.

## 6. Verificación en vivo (2026-11-14)

(Evidencia en `docs/fase-c-evidence.json`.)

- Feed 643, pág. 1: HTTP 200, 14.865.866 bytes, 504 entradas, ETag
  `"e2d5ca-6602d57827e12"`, Last-Modified `Fri, 13 Nov 2026 19:21:58 GMT`
  (verificado con curl, UA Chrome 120).
- Feed 1044, pág. 1: HTTP 200, 4.579.169 bytes, 399 entradas, ETag
  `"45df61-66032e95a07d6"`, Last-Modified `Sat, 14 Nov 2026 02:00:39 GMT`
  (verificado con curl, UA Chrome 120).
- Ingesta real por CLI (`run ingest --feed 643|1044 --max-pages 1`):
  643 → 504 entradas, 0 nuevas, 7 rectificadas; 1044 → 399 entradas,
  0 nuevas, 5 rectificadas. 0 nuevas es lo esperado: todo lo de la pág. 1
  ya estaba en el seed de 30 días. Checkpoint guardado con la URL de la
  pág. 2 en ambos feeds (`cursor_checkpoint.nextUrl`).
- Pliego real descargado por el job `documents` (Badajoz
  PSS/2026/0000130740): PCAP 1.132.024 bytes, SHA-256
  `73ea1033859c41895d9a78f8d47f7342d64810da4e5dd33721ce0f4f67cd980c`
  (mismo hash que el fixture descargado a mano) y PPT 862.198 bytes,
  SHA-256 `833b37ee6c5ea757bcdc2b559d83294bb3cc87784fb4bdc7ff263c365483428c`.
  Texto extraído: PCAP 52 páginas y PPT 35 (87 páginas en total).
  `file` decía "10 páginas" del PCAP: pdfjs-dist (52) es el fiable.
- Pipeline real completo sobre ese expediente: extract (7 requisitos con
  evidencia, 1 sin, 0 obligatorios sin evidencia, 0 inyecciones) →
  analyze (recomendación `revisar`, sin bloqueos) → publish
  (`publicado`, PUB). Alertas: 1 encolada para una org de Badajoz.
  Digest semanal: `enviado` (semana 2026-11-09, 1 expediente) e idempotente
  en la 2ª ejecución. Outbox: 2 filas `pending` (nada enviado: proveedor
  de correo no configurado, Fase D). La org de prueba y sus filas de
  outbox se borraron tras la verificación.
- Seed: 913 filas sembradas en PostgreSQL (913 insertadas, 0 actualizadas
  en la 1ª ejecución; la 2ª: 0 insertadas, 913 actualizadas — idempotente).
  Verificado por SQL: tenders 913, clases núcleo 709 / limítrofe 42 /
  marginal 162, PUB 196 (núcleo PUB 147), sin provincia 45, por verificar
  46, 1 expediente derivado `SIN-EXPEDIENTE-6f163d13d72f`.
  Incidencia encontrada y corregida: 4 expedientes se repiten con órganos
  distintos (p. ej. `62/2026`), así que el `external_id` del seed incluye
  un hash del órgano.
- Tests: 82/82 (ver §7).

## 7. Tests

| Suite | Tests | Resultado |
|---|---|---|
| integrations (province, classify, atom, ssrf, pdf) | 45 | 45/45 OK |
| domain (extraction) | 7 | 7/7 OK |
| db (seed) | 7 | 7/7 OK |
| worker (ingest, extract, analyze, digest/alerts, pg-store) | 23 | 23/23 OK (con `DATABASE_URL` real) |
| **Total** | **82** | **82/82 OK** |

Typecheck: `tsc -p tsconfig.app.json --noEmit` (worker) y
`tsc -p tsconfig.json --noEmit` (integrations, domain, db): sin errores.

## 8. Pendiente (no bloqueante para Fase C)

1. **Adaptación al esquema de Fase B: HECHA en esta fase.** El DDL
   provisional de Fase C se retiró; `PostgresWorkerStore` y el seed usan
   las tablas Drizzle de Fase B. Queda por confirmar que el esquema de
   Fase B de la rama `block/fase-b` coincide con el de master cuando se
   fusione (los `id` son default de aplicación: los INSERT SQL usan
   `gen_random_uuid()`; `cursor_checkpoint` es texto JSON, no jsonb).
2. **OCR local** para PDFs escaneados (`requiere_OCR`): opcional, no obligatorio
   en MVP. Hoy esos expedientes quedan apartados con ese estado.
3. **Plataformas autonómicas (feed 1044):** la descarga de pliegos desde esos
   dominios está permitida en la allowlist pero no verificada en vivo con un
   PDF autonómico (solo PLACSP, 7/7 en Fase A). Verificar con el primer
   expediente 1044 con documentos.
4. **Proveedor LLM** (xAI o Top Tools AI): sin elegir. La extracción
   determinista no lo necesita; el análisis con LLM es Fase posterior.
5. **Proveedor de correo** (Fase D): el outbox acumula `pending` sin enviar.
6. **ZIP mensuales de Hacienda** como vía de backfill: sin verificar
   (hacienda.gob.es inaccesible desde esta VM).
7. **Aviso legal / licencia de reutilización de Hacienda:** sin leer
   (hacienda.gob.es inaccesible); pendiente antes de explotar comercialmente.
8. El worker no tiene aún planificador interno (cron externo) ni límites de
   memoria/CPU del proceso de extracción PDF más allá de páginas/tiempo/tamaño.
