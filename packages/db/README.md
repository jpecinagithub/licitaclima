# @licitaclima/db — Esquema Drizzle + PostgreSQL (Fase B)

36 tablas (entidades mínimas del prompt §8). Dinero en `numeric(19,4)`,
nunca float. Instantes en `timestamptz` (UTC). IDs UUID impredecibles
generados en la aplicación.

## Datos públicos vs. privados

- **Públicos (sin `organization_id`)**: `sources`, `tenders`,
  `tender_versions`, `lots`, `documents`, `document_versions`,
  `extracted_pages`, `generic_analyses`, `plans`, `system_settings`.
- **Privados (siempre con `organization_id`)**: todo lo demás
  (`users`/`memberships` aparte, `company_profiles`, `matches`,
  `personalized_analyses`, `favorites`, `conversations`, `messages`,
  `subscriptions`, `usage_ledger`, `email_outbox`, `support_tickets`,
  `audit_logs`, `jobs`, …). Un UUID conocido no sustituye a la
  autorización: la API filtra siempre por la organización de la sesión
  (ver `apps/api/src/lib/tenant.ts` y sus tests de acceso cruzado).

## Migraciones

Versionadas con drizzle-kit en `./drizzle/` (`0000_*.sql`, `0001_*.sql`).

```bash
# Generar una migración tras cambiar el esquema
pnpm --filter @licitaclima/db generate
# Aplicarla (PostgreSQL real)
DATABASE_URL=postgres://licitaclima:licitaclima@localhost:5432/licitaclima \
  pnpm --filter @licitaclima/db migrate
```

`src/migrate.ts` aplica en orden los `.sql` pendientes y registra el hash
en `drizzle.__drizzle_migrations` (idempotente; re-ejecutar no hace nada).

## PostgreSQL real (sin pg-mem)

Las migraciones y los tests usan **PostgreSQL 16 real** en
`localhost:5432` (o `docker compose up db`). **No se usa pg-mem**: pg-mem
no es PostgreSQL (su adaptador `pg` no implementa `getTypeParser` y
drizzle-orm no funciona sobre él sin rodeos), así que presentarlo como
equivalente sería engañoso. Cada fichero de test crea su propia base
`licitaclima_test_<hex>`, aplica las migraciones reales y la borra al
terminar (ver `src/test-utils.ts`).

Requisito local: el rol de `DATABASE_URL` necesita `CREATEDB` para los
tests (solo desarrollo local):

```sql
ALTER ROLE licitaclima CREATEDB;
```

```bash
# Tests del paquete (PostgreSQL real)
DATABASE_URL=postgres://licitaclima:licitaclima@localhost:5432/licitaclima \
  pnpm --filter @licitaclima/db test
```

## Desarrollo local

```bash
docker compose up db   # o PostgreSQL 16 instalado en el host
cp .env.example .env   # DATABASE_URL=postgres://licitaclima:licitaclima@localhost:5432/licitaclima
pnpm db:migrate
```
