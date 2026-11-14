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

## 7. Despliegue en Oracle — DESPLEGADO 2026-11-14

**Estado: en vivo desde 2026-11-14.** URL pública:
https://licitaclima.jpecina.duckdns.org (subdominio DuckDNS verificado,
certificado Let's Encrypt vía Certbot con renovación automática; HTTP
redirige a HTTPS). Servidor `iadelveloper-server` (Oracle, aarch64, 23 GB
RAM); acceso SSH por túnel Tailscale
(`ssh -F ~/.ssh/config 100.102.140.37`); el SSH directo por el proxy 3128
resetea la conexión (el host `appforge-oracle` no es usable).

- Checkout: `/opt/licitaclima`, master en `1a7c2bf` (ver `git log`).
- Servicios (docker compose, proyecto `licitaclima`): `db`
  (postgres:16-alpine, volumen `licitaclima_licitaclima_pgdata`), `api`,
  `worker`, `web` (nginx). `restart: unless-stopped` en los 4.
- Puertos: `api` → `127.0.0.1:3101` (el 3001 del host lo ocupa ERP3),
  `web` → `127.0.0.1:3100` (el 80 lo usa nginx del host), `db` SIN puerto
  publicado (solo red interna de compose).
- nginx del host: `/etc/nginx/sites-enabled/licitaclima` — `/api/` y
  `/health/` → 127.0.0.1:3101, `/` → 127.0.0.1:3100. `nginx -t`
  obligatorio antes de recargar.
- `.env` de producción en `/opt/licitaclima/.env` (0600, nunca en git):
  `SESSION_SECRET` y `ADMIN_SECRETS_KEY` generados con
  `openssl rand -hex 32`;
  `DATABASE_URL=postgres://licitaclima:licitaclima@db:5432/licitaclima`;
  `WEB_PUBLIC_URL` / `API_PUBLIC_URL` / `LICITACLIMA_SITE_URL` =
  `https://licitaclima.jpecina.duckdns.org`. Sin Stripe, sin correo real
  (outbox), LLM `none`.
- Admin: `admin@licitaclima.es` (creado por CLI 2026-11-14, TOTP activo);
  contraseña SOLO en `/opt/licitaclima/.admin-credentials` (0600, fuera
  de git).
- Worker: el CMD base sin args solo imprime la ayuda y sale; el override
  de producción le pasa `schedule` (cola 15 min, ingesta 6 h, digest
  lunes 09:00 Europe/Madrid).

### Archivos solo en el servidor (no commitear)

- `docker-compose.prod.yml` (override: puertos, `schedule`, volumen
  `licitaclima_documents` para los pliegos).
- `docker-compose.yml` MODIFICADO en este checkout (sin commitear): se
  quitaron los `ports:` de `db`, `api` y `web` porque el override no
  puede vaciar listas (`ports: []` no anula la base; compose fusiona
  las listas). Antes de un `git pull` que toque ese fichero, guardar el
  cambio (`git stash` o re-aplicarlo después).
- `.env`, `.admin-credentials`, `backup.sh`, `backups/`.

### Despliegue inicial (lo que se hizo 2026-11-14)

1. `git clone https://github.com/jpecinagithub/licitaclima.git
   /opt/licitaclima` (master `43187b7`).
2. `.env` + `docker-compose.prod.yml` como arriba.
3. `docker compose build`: falló en las 3 imágenes por
   `tsconfig.base.json` (los Dockerfiles no lo copiaban; todos los
   `tsconfig.json` lo extienden) — corregido en el repo (commit
   `d0aa4aa`) y vuelto a compilar: `licitaclima-api` 415 MB,
   `licitaclima-worker` 380 MB, `licitaclima-web` 63 MB.
4. `up -d db` (healthy) → migraciones 0000–0002 → seed: 913 tenders,
   38 tablas.
5. `up -d` completo; `/health/ready` →
   `{"status":"ok","db":"ok","llm":"none","stripe":"pending","email":"pending"}`.
6. Ingesta manual `run ingest --feed 643 --max-pages 2`: 1.002 entradas,
   0 nuevas, 17 rectificadas. `run-due --limit 10`: 9 done, 1 failed
   transitorio (sin rastro en la tabla de jobs: 0 failed, sin
   `last_error`; reintento automático hasta 5 intentos).
7. Admin creado por CLI.
8. nginx + `certbot --nginx -d licitaclima.jpecina.duckdns.org`
   (reutiliza la cuenta existente).
9. La web devolvía 404 en rutas no prerenderadas (`/acceso`, `/app/*`,
   `/admin/*`; el magic link aterriza en `/acceso/confirmar`) —
   corregido con fallback SPA en el nginx del contenedor
   (`infra/docker/web-nginx.conf`, commit `1a7c2bf`) y reconstruida solo
   la imagen web.
10. Backup: `backup.sh` + cron diario 03:30 (para no coincidir con el
    backup de NEXUS de las 03:00); primer backup 2026-11-14 (dump 772 KB
    + pliegos 31,8 MB) y restauración probada en BD aparte
    `licitaclima_restore`: 913/913 tenders, BD borrada después.
    OJO: el crontab de ubuntu contiene además el backup de NEXUS (03:00)
    y magic-hour-claim (09:00 y 10:30): no reemplazarlo entero con
    `echo ... | crontab -`; editar por líneas (el 2026-11-14 se borró
    por accidente y se restauró desde el syslog).

### Anomalías observadas (causa raíz sin resolver)

- El bind de `127.0.0.1:5432` fallaba de forma reproducible al crear el
  endpoint de `db` («address already in use») aunque nada escucha en el
  5432 (`ss`, `/proc/net/tcp`, sin docker-proxy en ese puerto; un
  `python3 bind` y un `docker run -p 127.0.0.1:5432:80` manual sí
  enlazan). Mitigado quitando el mapeo de `db` (mejor que lo que pedía
  el runbook). Si reaparece con 3100/3101, revisar el daemon de Docker.
- Un `docker compose run` recreó `db` y lo dejó sin red (`networks={}`,
  DNS `db` sin resolver): se resolvió con `down` + `up -d db` y usando
  `run --no-deps` para las tareas puntuales.
- Las salidas largas por SSH se cortan ~60 s (`client_loop: send
  disconnect: Broken pipe`): los trabajos largos (ingesta, run-due) se
  lanzan con `nohup ... &` y se consulta el log después.

### Redesplegar

```bash
cd /opt/licitaclima
git pull --ff-only   # ojo: docker-compose.yml modificado en este checkout (ver arriba)
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
curl https://licitaclima.jpecina.duckdns.org/health/ready
```

## 8. Costes operativos

Ver `docs/costs.md` (medidos + escenarios 10/30/100 clientes; LLM y correo
pendientes de proveedor, sin tarifas inventadas).
