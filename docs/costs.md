# LicitaClima — Informe de costes

Fecha: 2026-11-14. Moneda: EUR. Todas las cifras son medidas o supuestos
explícitos; donde no hay proveedor elegido no hay tarifa (no se inventa).

## 1. Supuestos y unidades medidas (2026-11-14, VM de desarrollo)

| Concepto | Medido | Fuente |
|---|---|---|
| Ingesta (1 ejecución, 2 feeds) | ~20 MB descargados | Pull Fase A / verificación Fase C |
| Ingesta | 4 ejecuciones/día (cada 6 h) → ~80 MB/día | Cadencia configurada |
| Pliegos PDF | ~5–10 MB/día | Fase A (pliegos del nicho) |
| Pliegos en disco (verificación E2E) | 2,0 MB, 2 ficheros (6 documentos, 2 reutilizados por hash) | `apps/worker/data`, 2026-11-14 |
| BD desarrollo (913 tenders + jobs + análisis) | 17 MB | `pg_database_size('licitaclima')` |
| BD limpia (913 tenders, seed) | 14 MB; dump 1,1 MB | `licitaclima_clean`, 2026-11-14 |
| Nicho | ~6,7 aperturas de núcleo/día laborable nacional; ~6–9/mes por cliente de 3 provincias medianas | `docs/volume-30d.md` |
| Plan | 49 €/mes + impuestos; 10 análisis/mes; 100 consultas chat/periodo | `packages/config` |

La ingesta es un coste **fijo** (no depende del nº de clientes): los mismos
feeds se descargan una vez y se comparten. El coste marginal por cliente es
pequeño: perfil + matches + análisis personalizados + mensajes + 1 digest
semanal.

## 2. Costes conocidos hoy

| Partida | Coste | Estado |
|---|---|---|
| Servidor Oracle (24 GB RAM / 200 GB, aprox., sin verificar en este turno) | Ya contratado por Jon para otros proyectos; LicitaClima no añade servidor | Coste hundido; no se imputa precio aquí porque no se ha verificado la tarifa del servidor |
| PostgreSQL 16 | Incluido (contenedor en el mismo servidor) | 0 € incremental |
| Dominio `licitaclima.es` | Pendiente de comprar | Sin precio hasta elegir registrador |
| DNS (DuckDNS, usado en otros proyectos) | 0 € | — |
| Stripe (modo test) | 0 € | En test no hay comisiones |
| Correo | Sin proveedor | Pendiente |
| LLM | Sin proveedor | **Pendiente: es la partida variable principal** |
| Vercel / hosting web | No se usa para LicitaClima (web en Oracle con nginx; prerender estático) | 0 € |

## 3. La partida pendiente: LLM

Sin proveedor elegido (Jon decide entre xAI y Top Tools AI) no se puede
calcular el coste por análisis ni por pregunta. Lo que sí está acotado por
diseño:

- Máximo contractual por cliente: 10 análisis personalizados/mes y 100
  consultas de chat/periodo (límites en `packages/config`).
- La extracción determinista v1 **no** usa LLM: el coste de extracción es
  solo CPU local (pdfjs) y no escala con el nº de clientes.
- El chat y el análisis personalizado son los únicos consumos LLM. Sin
  precios por modelo y sin presupuesto configurado, el adaptador es
  `NoLlmProvider`: cualquier intento de completar lanza un error en vez de
  gastar nada.

**Antes de activar el LLM hay que:** elegir proveedor y modelo, registrar
su tarifa con fecha, fijar presupuesto diario/mensual y por organización, y
medir el coste real por análisis y por pregunta en test. Sin eso, el
margen por cliente no se puede afirmar.

## 4. Escenarios (10 / 30 / 100 clientes)

Ingresos (sin impuestos, sin contar IVA ni comisiones): 10 clientes →
490 €/mes; 30 → 1.470 €/mes; 100 → 4.900 €/mes. **Ingresos no son
beneficio.**

Costes fijos mensuales estimados con lo medido:

| Partida | 10 clientes | 30 clientes | 100 clientes |
|---|---|---|---|
| Ingesta (ancho de banda + disco) | ~2,4 GB/mes descarga, ~150–300 MB/mes pliegos nuevos | igual | igual |
| BD (tendencias: +~14 MB por cada 913 tenders nuevos; el seed de 30 días son 913) | < 100 MB | < 100 MB | < 200 MB |
| Pliegos en disco | < 1 GB/año | < 1 GB/año | < 1 GB/año |
| Digests (1/semana/cliente) | ~40/mes | ~120/mes | ~400/mes |
| Servidor | 0 € incremental (compartido) | 0 € incremental | 0 € incremental |

El cuello de botella no es el almacenamiento ni el ancho de banda: es el
LLM. Con los límites del plan, el consumo máximo teórico es:

- Análisis: 10/mes/cliente → 100 / 300 / 1.000 análisis/mes.
- Preguntas: 100/periodo/cliente → 1.000 / 3.000 / 10.000 preguntas/mes.

Sin tarifa por análisis/pregunta no se traduce a euros; esa es la
incógnita que decide si el plan de 49 € cubre el servicio. El uso real
será menor que el máximo (la mayoría de clientes no agotará la cuota),
pero el presupuesto debe dimensionarse para el máximo hasta tener datos.

Stripe en vivo: comisiones no incluidas arriba; verificar en
stripe.com/es/pricing antes del lanzamiento (no se codifican comisiones
históricas como constantes). Impuestos: el precio es «+ impuestos»; la
facturación fiscal española (IVA, facturación) está pendiente de revisión
con asesor (ver `docs/launch-checklist.md`).

## 5. Qué medir en el piloto

- Coste real por análisis y por pregunta (por proveedor/modelo), con
  fecha y tarifa registrada.
- Uso real de cuota por cliente (no el máximo teórico).
- Coste de ingesta real en Oracle (ancho de banda y disco a 30 días).
- Tasa de conversión muestra → pago y retención (criterios comerciales
  del prompt §2, no medidos todavía).
