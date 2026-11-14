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

## Estado (2026-11-14)

- Fase A (viabilidad de datos) y pull de 30 días: completos.
  Ver `docs/data-feasibility.md` y `docs/volume-30d.md`.
- Fases B–F (MVP): en construcción.
- **Pendientes de Jon:** proveedor LLM (xAI o Top Tools AI), claves Stripe en modo test,
  Gmail dedicada, despliegue en Oracle, licencia de reutilización de Hacienda.
- Sin LLM, sin Stripe y sin correo configurados: esas integraciones están marcadas
  PENDIENTE y no se presentan como operativas.

## Arranque local

```bash
cp .env.example .env   # completa solo lo que tengas
pnpm install
pnpm db:migrate        # migraciones Drizzle (PostgreSQL)
pnpm db:seed           # siembra con los datos REALES del pull de 30 días
pnpm dev:api           # :3001
pnpm dev:web           # :5173
pnpm dev:worker        # ingesta cada 6 h + trabajos
```

Requisitos: Node ≥ 22, pnpm 10, PostgreSQL 16 (o `docker compose up db`).
Ver `docs/operations.md` para producción en Oracle.

## Documentación

- `docs/data-feasibility.md` — Fase A
- `docs/volume-30d.md` — pull de 30 días
- `docs/architecture.md`, `docs/security.md`, `docs/operations.md`,
  `docs/launch-checklist.md`, `docs/validation-report.md` — Fases B–F
