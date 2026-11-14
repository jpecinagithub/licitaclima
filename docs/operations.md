# LicitaClima — Operaciones

## 1. Arranque local

Requisitos: Node ≥ 22, pnpm 10, PostgreSQL 16 (o `docker compose up db`).

```bash
cp .env.example .env   # completa solo lo que tengas; sin secretos en git
pnpm install --frozen-lockfile
pnpm build             # compila los paquetes a dist/ (obligatorio antes de arrancar o testar)
pnpm db:migrate        # migraciones 0000-0002
pnpm db:seed           # siembra con los datos REALES del pull de 30 días (913 expedientes)
pnpm dev:api           # API :3001 (tsx watch)
pnpm dev:web           # web :5173 (Vite)
pnpm dev:worker        # worker en desarrollo (tsx watch)
```

Arranque compilado (el que usa producción):

```bash
pnpm build
DATABASE_URL=postgres://licitaclima:licitaclima@localhost:5432/licitaclima \
  node apps/api/dist/server.js        # API :3001
node apps/worker/dist/index.js        # muestra la ayuda del worker
```

Salud:

```bash
curl localhost:3001/health/live    # {"status":"ok"}
curl localhost:3001/health/ready   # {"status":"ok","db":"ok","llm":"none","stripe":"pending","email":"pending"}
```

> Nota VM: en esta máquina `pnpm install` no puede escribir el lockfile
> directamente (EPERM en `chown` sobre el overlay); el `.npmrc` del repo
> lleva `manage-package-manager-versions=false` y, si hace falta regenerar
> el lockfile, hay que hacerlo en `/tmp` y copiarlo. Ver el commit de
> fusión de Fase C en `master`.

## 2. Docker Compose

```bash
docker compose up db        # solo PostgreSQL 16 (desarrollo)
docker compose up --build   # db + api + worker + web (nginx)
```

Servicios: `db` (postgres:16-alpine, volumen `licitaclima_pgdata`),
`api` (:3001), `worker`, `web` (nginx :80 con el prerender estático).
Las imágenes se construyen desde `infra/docker/*.Dockerfile` (ver nota en
cada uno: la instalación es completa —sin `--prod`— porque el build
necesita `tsc` y los paquetes workspace compilados). **Sin Docker en la VM
de desarrollo, estas imágenes no se han construido aquí**: verificar con
`docker compose build` en Oracle antes de desplegar.

## 3. Migraciones

```bash
pnpm db:migrate   # aplica 0000_sleepy_vertigo, 0001_sessions_org_nullable, 0002_orange_rhodey
```

Drizzle. Las migraciones son acumulativas y no se reescriben. Para una BD
nueva: crear la BD vacía, `pnpm db:migrate`, `pnpm db:seed`.
Verificación hecha en 2026-11-14 en `licitaclima_clean`: 913 tenders
(709 núcleo / 42 limítrofe / 162 marginal), 38 tablas, seed idempotente
(segunda siembra: sigue 913).

## 4. Worker: trabajos y programador

Por lotes (cron externo o manual):

```bash
DATABASE_URL=... node apps/worker/dist/index.js run ingest --feed 643 [--max-pages N]
DATABASE_URL=... node apps/worker/dist/index.js run ingest --feed 1044 [--max-pages N]
DATABASE_URL=... node apps/worker/dist/index.js run documents --tender <id>
DATABASE_URL=... node apps/worker/dist/index.js run extract --tender <id>
DATABASE_URL=... node apps/worker/dist/index.js run analyze --tender <id>
DATABASE_URL=... node apps/worker/dist/index.js run publish --tender <id>
DATABASE_URL=... node apps/worker/dist/index.js run alerts --tender <id>
DATABASE_URL=... node apps/worker/dist/index.js run digest-weekly --org <id>
DATABASE_URL=... node apps/worker/dist/index.js run billing-reconcile
DATABASE_URL=... node apps/worker/dist/index.js run billing-events [--limit N]
DATABASE_URL=... node apps/worker/dist/index.js run email-outbox [--limit N]
DATABASE_URL=... node apps/worker/dist/index.js run-due [--limit N]
DATABASE_URL=... node apps/worker/dist/index.js enqueue-ingest
DATABASE_URL=... node apps/worker/dist/index.js digest --org <id>
```

Demonio en proceso único (recomendado si hay un solo contenedor de worker):

```bash
DATABASE_URL=... node apps/worker/dist/index.js schedule
```

Cadencias: cola cada 15 min, ingesta cada 6 h (solo si no hay otra
pendiente/en curso), conciliación Stripe diaria, digest semanal los lunes
09:00 Europe/Madrid para organizaciones con suscripción activa.
Sin Stripe/correo, esos ticks devuelven `pending` y no envían ni cobran
nada. El demonio registra cada tick en JSON por stdout.

Los jobs de Fase D (`billing-*`, `email-outbox`) requieren `DATABASE_URL`;
sin ella el worker arranca en modo memoria (no persistente) y esos jobs
fallan con un error explícito.

Pliegos descargados: `DOCUMENTS_DIR` (por defecto
`apps/worker/data/documents`, fuera de git). Hay que incluir ese directorio
en el backup (ver §6); el dump de PostgreSQL no lo contiene.

## 5. Administración

```bash
# Crear el admin (contraseña por CLI; TOTP obligatorio después)
pnpm --filter @licitaclima/api exec tsx src/cli.ts admin:create --email admin@licitaclima.es
pnpm --filter @licitaclima/api exec tsx src/cli.ts admin:list
```

Panel admin en la web (`/admin/*`): resumen, embudo, finanzas, clientes,
calidad, fuentes, comunicaciones, soporte, configuración y auditoría.
Pausas en `system_settings` (`pause.*`): no bloquean acceso, cancelación
ni seguridad.

## 6. Backups y restauración

Objetivo inicial (prompt §13): RPO 24 h, RTO 8 h. **No prometidos sin
medir**: la primera restauración medida es la de 2026-11-14 (ver abajo).

```bash
# Backup (BD + pliegos). Guardar FUERA del servidor.
pg_dump "postgres://licitaclima:licitaclima@localhost:5432/licitaclima" -Fc \
  -f /ruta/externa/licitaclima-$(date +%F).dump
rsync -a apps/worker/data/documents/ /ruta/externa/licitaclima-documents/

# Restauración en entorno aislado (probada 2026-11-14)
psql "postgres://licitaclima:licitaclima@localhost:5432/postgres" \
  -c "CREATE DATABASE licitaclima_restore OWNER licitaclima;"
pg_restore -d "postgres://licitaclima:licitaclima@localhost:5432/licitaclima_restore" \
  /ruta/externa/licitaclima-2026-11-14.dump
# verificar conteos: tenders, documents, jobs, users
```

Medición 2026-11-14 (VM de desarrollo, PostgreSQL 16.15 local):
dump 1,1 MB en 0,35 s; restore en 0,33 s; conteos idénticos a origen
(tenders 913, documents 4, jobs 25, users 0). Los pliegos en disco no se
restauraron en esa prueba (solo la BD): el procedimiento de pliegos está
documentado arriba pero sin medir.

Runbook de caída:

1. `curl localhost:3001/health/ready` → si `db` no es `ok`, revisar el
   contenedor/servicio de PostgreSQL y los logs de la API.
2. Si la BD se pierde: crear BD vacía, `pg_restore` del último dump,
   `rsync` de los pliegos, `pnpm db:migrate` (por si el dump es anterior
   a una migración), arrancar API y worker.
3. Si un secreto se filtra: rotarlo en el `.env` del servidor, reiniciar
   API y worker, revocar sesiones (`sessions`) y tokens (`login_tokens`)
   afectados; los secretos de admin cifrados con `ADMIN_SECRETS_KEY`
   obligan a re-crear el admin si cambia esa clave.
4. Si Stripe falla: los webhooks quedan en `stripe_events` sin procesar;
   al volver, `run billing-events` los aplica y `run billing-reconcile`
   concilia el estado vigente.
5. Borrados de cuenta: antes de restaurar un backup, re-aplicar los
   borrados registrados después de la fecha del backup (procedimiento
   pendiente de formalizar; ver `docs/security.md` §8).

## 7. Despliegue en Oracle — runbook (NO desplegado)

**Estado: sin desplegar. SSH bloqueado el 2026-11-14; el servidor no se ha
verificado en este turno.** Pasos cuando Jon desbloquee el acceso:

1. Verificar el servidor: `uname -m`, RAM/disco, Docker y
   `docker compose` instalados, puertos 80/443 libres, Caddy o nginx
   existente, ruta `/opt/licitaclima` (o la que Jon indique).
2. Copiar el repo (git clone) y el `.env` de producción (nunca por git):
   `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_SECRETS_KEY`,
   `WEB_PUBLIC_URL=https://licitaclima.es`,
   `API_PUBLIC_URL=https://licitaclima.es` (o subdominio de API si lo hay).
   Stripe y correo solo cuando Jon aporte las claves; LLM solo cuando
   elija proveedor.
3. `docker compose build` (verificar que las 3 imágenes compilan; no se
   han construido nunca) y `docker compose up -d db`, esperar `healthy`,
   aplicar migraciones (`pnpm db:migrate` desde el checkout del servidor
   con el `DATABASE_URL` del servidor, o equivalente dentro del contenedor
   api), `docker compose up -d`.
4. Crear el admin con la CLI, comprobar `/health/ready` y las 3 rutas
   públicas, hacer una ingesta manual (`run ingest --feed 643 --max-pages 2`)
   y un `run-due`.
5. DNS: `licitaclima.es` → IP del servidor (dominio pendiente de comprar;
   el prerender usa `https://licitaclima.es` como marcador hasta que Jon
   confirme el dominio canónico). Caddy en `infra/Caddyfile` hace
   `reverse_proxy /api/* → :3001` y `/* → :80`.
6. Backups: cron diario `pg_dump` + `rsync` de pliegos a almacenamiento
   externo; probar la restauración en el propio Oracle (BD aparte) antes
   de dar el despliegue por bueno.
7. No exponer el 5432 públicamente: quitar el mapeo de puertos de `db`
   en el compose de producción o atarlo a `127.0.0.1`.

## 8. Costes operativos

Ver `docs/costs.md` (medidos + escenarios 10/30/100 clientes; LLM y correo
pendientes de proveedor, sin tarifas inventadas).
