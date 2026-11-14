# LicitaClima

Servicio por suscripción que localiza y analiza licitaciones públicas españolas
para pequeñas empresas de mantenimiento e instalación de climatización.

**Mensaje:** «Encuentra licitaciones de climatización que encajan con tu empresa
y entiende sus requisitos antes de dedicar tiempo a preparar una oferta».

- **Plan único:** 49 €/mes + impuestos · 1 usuario · 1 perfil · 3 provincias ·
  10 análisis personalizados/mes · 100 consultas de chat por periodo.
- **Formato:** resumen **semanal** + alertas cuando hay novedad en tus provincias
  (decisión 2026-11-14; nunca se promete resumen diario ni 10 oportunidades).
- **Nicho estricto:** 5 CPV (45331000, 42512000, 42500000, 50730000, 50720000)
  + 9 palabras clave. Solo núcleo + limítrofe se publican; los marginales van a revisión.

## Estado (2026-11-14, Fase F cerrada en master)

- Fase A (viabilidad de datos) y pull de 30 días: completos.
  Ver `docs/data-feasibility.md` y `docs/volume-30d.md`.
- Fases B–F (MVP): fusionadas en `master` y verificadas:
  `pnpm build`, `pnpm typecheck` y `pnpm test` en verde —
  **184 tests** (api 64, integrations 36, worker 30, domain 26, web 15,
  db 13; config/prompts sin tests). Migraciones desde cero en BD limpia:
  913 tenders (709 núcleo / 42 limítrofe / 162 marginal). Ingesta en vivo
  verificada (feed 643, 1.002 entradas). Backup restaurado en BD aislada
  con conteos idénticos. Detalle y evidencias en
  `docs/validation-report.md`.
- **Pendientes de Jon:** proveedor LLM (xAI o Top Tools AI), claves Stripe en modo test,
  Gmail dedicada o proveedor transaccional, despliegue en Oracle, dominio
  canónico, licencia de reutilización de Hacienda.
- Sin LLM, sin Stripe y sin correo configurados: esas integraciones están marcadas
  PENDIENTE y no se presentan como operativas (el API devuelve 503/`pending`
  explícitos; el correo del magic link queda en el outbox sin enviar).

### Hueco conocido

La web llama a rutas de oportunidades, análisis, chat, favoritos y leads
(`GET /opportunities`, `POST /analyses/:id/questions`, …) que la API
todavía no tiene: devuelven 404. El panel cliente y el chat existen como
UI, pero sin backend. Es la pieza que falta para el flujo completo; ver
`docs/validation-report.md` §5.

## Arranque local

```bash
cp .env.example .env   # completa solo lo que tengas
pnpm install --frozen-lockfile
pnpm build             # compila los paquetes a dist/ (obligatorio)
pnpm db:migrate        # migraciones Drizzle (PostgreSQL)
pnpm db:seed           # siembra con los datos REALES del pull de 30 días
pnpm dev:api           # :3001
pnpm dev:web           # :5173
pnpm dev:worker        # ingesta cada 6 h + trabajos (tsx watch)
```

Arranque compilado (producción):

```bash
node apps/api/dist/server.js
node apps/worker/dist/index.js schedule   # demonio: cola 15 min, ingesta 6 h,
                                          # conciliación diaria, digest lunes 09:00
```

Requisitos: Node ≥ 22, pnpm 10, PostgreSQL 16 (o `docker compose up db`).
Ver `docs/operations.md` para producción en Oracle (runbook listo, sin desplegar).

## Documentación

- `docs/data-feasibility.md` — Fase A
- `docs/volume-30d.md` — pull de 30 días
- `docs/architecture.md` — arquitectura, modelo de datos, pipeline, API
- `docs/security.md` — controles y pendientes de seguridad
- `docs/operations.md` — arranque, Docker, migraciones, admin, backups, runbook Oracle
- `docs/costs.md` — informe de costes (medidos + escenarios 10/30/100 clientes)
- `docs/launch-checklist.md` — checklist de lanzamiento
- `docs/validation-report.md` — qué está probado, qué es pendiente y con qué evidencia
- `docs/fase-c.md`, `docs/fase-d.md` — notas de fase
