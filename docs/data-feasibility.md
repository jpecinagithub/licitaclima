# LicitaClima — Viabilidad de datos (Fase A)

## §0. Addendum — Pull de 30 días (2026-11-14)

**El pull de 30 días aprobado por Jon está completo y su informe es [`volume-30d.md`](volume-30d.md).** Ventana 2026-10-15 → 2026-11-14 (31 días naturales), misma regla de clasificación que esta Fase A (§5 + §6.1), 185 páginas Atom, 90.049 entradas, 57.648 expedientes únicos, 913 de nicho (1,58 %), **196 aperturas PUB de nicho**. Tras revisión manual título a título de las 196 aperturas (24 correcciones): **núcleo HVAC 147 · limítrofe 9 · marginal 40**.

**Veredicto contra los umbrales de §8.2:** el núcleo queda **justo por debajo** de la banda 150–250 («sí, con posicionamiento semanal») — 147, a 3 del límite inferior; el «amplio» (núcleo+limítrofe) entra justo con 156. Media por día laborable: 8,9 nicho · 6,7 núcleo. Por cliente de 3 provincias: mejor caso 38/mes (Madrid+Alicante+Barcelona), cliente mediano ~6/mes, cliente medio ~8–9/mes. Fines de semana: 0 aperturas (9 días). Importes núcleo: VE mediana 113.171 €, PB s/IVA mediana 91.148 €. El resto de este documento (Fase A, muestra de 1 día) se mantiene sin cambios; el pull de 30 días lo confirma y lo precisa.

- **Fecha de verificación:** 2026-11-14 (11:00 CET aprox., Europe/Madrid)
- **Alcance:** SOLO investigación. No se ha construido la app, no se ha tocado Oracle, no se ha creado repo.
- **Prompt maestro:** `~/workspace/user/files/LicitaClima_Prompt_Implementacion__1.md` (§2, puntos 1–6)
- **Método:** descarga real de los feeds Atom y análisis con `python3` + `xml.etree` (nunca a ojo desde texto truncado). Todos los números de este documento salen de los ficheros descargados el 2026-11-14, guardados en `/tmp/licitaclima/` (efímeros; ver §9 para reproducirlos).

## 0. Resumen ejecutivo

| Pregunta | Respuesta observada |
|---|---|
| ¿Funcionan los feeds Atom oficiales? | **Sí.** 643 y 1044 devuelven HTTP 200, con paginación `next` operativa y `ETag`/`Last-Modified`. |
| ¿Cuánto trae una página? | 643: **504 entradas** (14,9 MB); 1044: **399 entradas** (4,6 MB). Máx. ~500/página. |
| ¿Qué ventana cubre una página? | **Horas, no 30 días.** La pág. 1 de 643 cubre solo ~6 h de actualizaciones del 2026-11-13. Los 30 días exigen paginar ~60–120 págs. por feed (o los ZIP mensuales). |
| ¿Volumen del nicho climatización? | **22 expedientes únicos en 1.401 entradas (~1 día de actualizaciones), de los cuales solo 6 abiertos/vigentes (PUB).** ~6 aperturas/día a nivel nacional; ~3/día si se excluyen los marginales. |
| ¿Da para un resumen diario por cliente (3 provincias)? | **Justo o insuficiente.** Un cliente de 3 provincias vería ~0–1 aperturas nuevas la mayoría de los días (~5–10/mes extrapolado, muestra de 1 día, alta incertidumbre). Ver veredicto en §8. |
| ¿Pliegos descargables? | **Sí, 7/7 PDFs descargados** (118 KB–1,13 MB), PERO solo con un User-Agent de navegador real. Con `curl` y UA mínimo el WAF responde `Request Rejected` (7/7 fallos). |
| ¿Se distingue abierto / adjudicado / anulado / modificado? | **Sí**, por `ContractFolderStatusCode` (PRE/PUB/EV/ADJ/RES/ANUL) + `NoticeTypeCode` (DOC_CN, DOC_CAN_ADJ, DOC_FORM, DOC_MOD, ANUL_*, …). Ver §4. |
| ¿Localización de ejecución? | **Parcial y con trampa.** Código NUTS presente en el 100 %; nombre de provincia en ~92 % (643) y 0 % (1044). Y el NUTS a veces es la sede del órgano, no el lugar de ejecución (caso Paradores: Salamanca/Granada → ES300 Madrid). |
| ¿Duplicados entre 643 y 1044? | **0 en la muestra** (clave expediente+órgano). Parecen disjuntos: 643 = perfiles en PLACSP; 1044 = plataformas autonómicas agregadas. |
| ¿Fiabilidad histórica de la fuente? | **Con incidencias documentadas.** Comentarios en datos.gob.es (jul–oct 2026) reportan días sin actualizar y volúmenes anómalos (33 registros en vez de >1.000). El 2026-11-14 el feed está fresco. |

## 1. Fuentes verificadas (una por una)

### 1.1 Hacienda — página de datos abiertos

- URL: `https://www.hacienda.gob.es/es-ES/GobiernoAbierto/Datos%20Abiertos/paginas/licitaciones_plataforma_contratacion.aspx`
- **Resultado: NO ACCESIBLE desde esta VM el 2026-11-14.** `curl` → `000` (timeout ~10 s, 0 bytes); `browser.open` → error de red (DNS/timeout/conexión). No es un 404: el host `hacienda.gob.es` no responde a las peticiones directas desde este entorno.
- **Impacto:** no se pudo verificar en vivo ni la licencia/aviso legal ni la página. La vía alternativa (copia cacheada de `browser.open`) sí funcionó para la página hermana (ver 1.2).

### 1.2 datos.gob.es — ficha del conjunto de datos

- URL: `https://datos.gob.es/es/catalogo/e05250001-licitaciones-publicadas-en-los-perfiles-del-contratante-ubicados-en-la-plataforma-de-contratacion-del-sector-publico-excluyendo-los-contratos-menores`
- **Resultado: OK (200, leída 2026-11-14 10:57 UTC).** Publicador: Ministerio de Hacienda. Descripción: licitaciones publicadas en perfiles de contratante en PLACSP, **excluyendo contratos menores**.
- Distribuciones listadas (2):
  1. Atom → `.../sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom` (feed 643).
  2. ZIP → página `LicitacionesContratante.aspx` de Hacienda (ver 1.3).
- Condiciones de uso → Aviso legal de Hacienda (`https://www.hacienda.gob.es/es-ES/Paginas/Avisolegal.aspx`): **NO verificado** (hacienda.gob.es inaccesible, ver 1.1). Pendiente: confirmar reutilización/atribución antes de explotar comercialmente.
- **Hallazgo — fiabilidad histórica (comentarios de usuarios en la propia ficha):** quejas repetidas en jul–oct 2026 de que el Atom/ZIP **deja de actualizarse días enteros** y vuelca volúmenes anómalos:
  - 07/10/2026: "falta volcar info licitaciones estado día 6/10, la de agregadas funciona correctamente".
  - 24/09/2026: "hoy se ha volcado la información de primeros de setiembre y finales de agosto".
  - 14/09/2026: "desde el día 3/9/26 está inoperativo (o con deficiencias importantes) las actualizaciones diarias".
  - 09/09/2026: "solo 33 registros del día de ayer, cuando serían más de 1.000".
  - 28/07/2026: "los últimos ficheros .atom que contiene son del día 23 de julio".
  - Es decir: **la fuente es oficial y gratuita, pero con un historial reciente de interrupciones de días/semanas**. El producto debe marcar expresamente "fuente no disponible / datos desactualizados" cuando falle (el prompt §3 ya lo exige) y no prometer frescura que la fuente no garantiza.

### 1.3 Hacienda — página del conjunto (copia cacheada) y ZIP

- URL: `https://www.hacienda.gob.es/es-ES/GobiernoAbierto/Datos%20Abiertos/Paginas/LicitacionesContratante.aspx`
- **Resultado: OK vía copia cacheada de `browser.open` (rastreo 2026-09-23).** Texto literal relevante:
  - "Diariamente se publican las actualizaciones producidas durante el día anterior, por lo que **una misma licitación puede aparecer tantas veces como modificaciones se hayan producido** en los datos de dicha licitación."
  - "El fichero contiene un **máximo de 500 entradas**, las siguientes entradas se encuentran en el fichero publicado en la URL referenciada en el elemento `atom:link@ref="next"`."
  - "Se pueden descargar **comprimidos los ficheros por año** con las actualizaciones producidas desde el 1 de enero de 2012 hasta el año anterior en curso; **o por meses del año en curso**. El contenido del paquete comprimido se debe comenzar a leer a partir del fichero `licitacionesPerfilesContratanteCompleto3.atom`. El último fichero de cada paquete está enlazado con el primer fichero del paquete anterior."
  - "El conjunto de entidades que tienen su perfil del contratante en esta Plataforma ha ido creciendo progresivamente por lo que **el periodo que cubre estos datos no es homogéneo** para todas ellas."
- **Consecuencia práctica:** la vía eficiente para el backfill de 30 días es el **ZIP mensual**, no paginar el Atom día a día. El ZIP **no pudo verificarse en vivo** (hacienda.gob.es inaccesible): tamaño, URL exacta del ZIP y contenido quedan **pendientes de verificar** desde otra red o más adelante.

### 1.4 Feed 643 — perfiles en PLACSP (completo v3)

- URL: `https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom`
- **Resultado: 200 OK.** Descargado 2026-11-14 ~10:57 UTC.
  - Tamaño: **14.865.866 bytes (~14,9 MB)**, tiempo **17,7 s**.
  - `feed/updated`: **2026-11-13T20:21:42+01:00** (fresco: ~15 h antes de la descarga).
  - Entradas en pág. 1: **504**. Rango `entry/updated`: **2026-11-13 14:04 → 20:11** (~6 h).
  - Enlaces: `self`, `first` (misma URL), `next` → `.../licitacionesPerfilesContratanteCompleto3_20261113_202142.atom`.
  - Cabeceras (GET): `Content-Type: application/atom+xml`, **`ETag: "e2d5ca-6602d57827e12"`**, **`Last-Modified: Fri, 13 Nov 2026 19:21:58 GMT`**. Sin `Content-Length` visible (chunked). Sin rate limit observado (sin 429 en ninguna petición de este estudio).
  - **Paginación verificada:** pág. 2 descargada OK (**200, 13.940.758 bytes, 19,2 s, 498 entradas**, `updated` 2026-11-13 12:55 → 14:03), con su propio `next` → `..._20261113_202142_1.atom` y `prev` a pág. 1. La cadena continúa.

### 1.5 Feed 1044 — plataformas agregadas sin menores

- URL: `https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_1044/PlataformasAgregadasSinMenores.atom`
- **Resultado: 200 OK.** Descargado 2026-11-14 ~10:57 UTC.
  - Tamaño: **4.579.169 bytes (~4,6 MB)**, tiempo **7,0 s**.
  - `feed/updated`: **2026-11-14T03:00:35+01:00** (fresco: ~8 h antes de la descarga).
  - Entradas en pág. 1: **399**. Rango `entry/updated`: **2026-11-13 13:41 → 2026-11-14 01:00** (~11 h).
  - Enlaces: `self`, `first`, `next` → `.../PlataformasAgregadasSinMenores_20261114_030035.atom`.
  - Cabeceras `ETag`/`Last-Modified`: **no comprobadas para 1044** (solo se capturaron para 643). Pendiente menor.
  - Las entradas enlazan a **plataformas autonómicas** (Navarra, Galicia, Cataluña, Andalucía, Comunidad de Madrid, …), no a PLACSP. Estructura más pobre que 643 (ver §3).

### 1.6 Especificación de sindicación

- URL del prompt (v1.3): `https://www.hacienda.gob.es/Lists/DGPatrimonio/Plataforma_Contratacion/especificacion-sindicacion-1-3.pdf`
  - **Resultado: NO ACCESIBLE** (mismo bloqueo que 1.1: `curl 000`; `browser.open` error de red). **La v1.3 no ha podido leerse.**
- URL alternativa localizada por búsqueda (v1.2): `https://www.hacienda.gob.es/dgpatrimonio/plataforma_contratacion/especificacion_mecanismo_sindicacion.pdf`
  - **Resultado: OK vía copia cacheada (rastreo 2026-09-14).** "Formato de sindicación y reutilización de datos sobre licitaciones publicadas en la PLACSP", DGPE, **versión 1.2, 18/10/2018, 147 págs.** Resumen en §4. OJO: la v1.2 referencia listas de códigos 2.07/2.04 mientras que el feed vivo usa 2.04 (estados) y 2.11 (tipos de anuncio): hay **deriva de versiones** entre spec y feed; la fuente de verdad son las listas `.gc` vivas (ver §4.1), descargadas en vivo (200) el 2026-11-14.
- Búsqueda adicional: existe una copia v1.1 (07/04/2016) en `1library.co` (no oficial; no usada como fuente primaria).

## 2. Muestra real analizada

- **Ficheros:** `feed643.atom` (pág. 1, 504), `feed643_p2.atom` (pág. 2, 498), `feed1044.atom` (pág. 1, 399). Total **1.401 entradas**.
- **Ventana cubierta (por `entry/updated`):** 2026-11-13 12:55 → 2026-11-14 01:00, es decir, **~12 h de actualizaciones, no 30 días**. Es una muestra de **un día**, no de un mes. Todas las tasas diarias de este documento son extrapolaciones de esa ventana y deben confirmarse con un pull de 30 días (ver §8).
- **Advertencia sobre "entradas":** una entrada = una actualización de un expediente, no un expediente nuevo. El mismo expediente reaparece cada vez que se modifica (spec §3.3.2, caso 2; hacienda §1.3). En esta muestra no hubo repetidos por (expediente, órgano) entre las 3 páginas, pero en un pull de 30 días los habrá seguro.
- **Ritmo observado:** 643 ≈ 1.002 entradas / ~7,3 h ≈ **137/h**; 1044 ≈ 399 / ~11,3 h ≈ **35/h**. Estimación gruesa: **~1.500–2.500 entradas/día (643) + ~500–800/día (1044)**. La paginación es de ~500 entradas/fichero, así que 30 días ≈ **60–120 páginas (643) + 60–90 (1044)**.

## 3. Campos por entry (observado en el XML, no en la spec)

Cada `entry` trae Atom (`id`, `link` deeplink al detalle, `title` = objeto, `summary` = "Id licitación: …; Órgano de Contratación: …; Importe: … EUR; Estado: …", `updated`) + extensión CODICE `ContractFolderStatus`. Campos verificados en el XML real:

| Campo | Elemento CODICE | 643 p1+p2 (n=1.002) | 1044 (n=399) |
|---|---|---|---|
| Expediente | `ContractFolderID` | 100 % | 100 % |
| Estado | `ContractFolderStatusCode` | 100 % | 100 % |
| Órgano (nombre, DIR3, NIF, dirección, contacto) | `LocatedContractingParty/Party` | 100 % | 100 % |
| Objeto | `ProcurementProject/Name` (= `title`) | 100 % | 100 % |
| Tipo / subtipo contrato | `TypeCode` / `SubTypeCode` | presente | presente |
| Valor estimado | `BudgetAmount/EstimatedOverallContractAmount` | 100 % (1.002/1.002) | 99,5 % (397/399) |
| Ppto. base sin impuestos | `BudgetAmount/TaxExclusiveAmount` | 100 % | presente* |
| Ppto. base con impuestos | `BudgetAmount/TotalAmount` | 100 % | **0 % (0/399)** |
| CPV (1..n) | `RequiredCommodityClassification/ItemClassificationCode` | 99,4 % (994/1.002; 8 sin CPV) | 100 % (399/399) |
| Lugar ejecución (nombre) | `RealizedLocation/CountrySubentity` | 92,2 % (922/1.002) | **0 % (0/399)** |
| Lugar ejecución (código NUTS) | `RealizedLocation/CountrySubentityCode` | 100 % | 100 % |
| Duración | `PlannedPeriod/DurationMeasure` | presente | presente |
| Plazo presentación ofertas | `TenderingProcess/TenderSubmissionDeadlinePeriod/EndDate + EndTime` | 94,4 % (944/1.002) | 90,5 % (361/399) |
| Pliego cláusulas (PCAP) | `LegalDocumentReference` (+ URI + hash) | 92,8 % (928/1.002) | 71,4 % (285/399) |
| Pliego técnico (PPT) | `TechnicalDocumentReference` (+ URI + hash) | 91,3 % (913/1.002) | 70,4 % (281/399) |
| Cualquier URI de documento | `*/Attachment/ExternalReference/URI` | 99,0 % (990/1.002) | 71,7 % (286/399) |
| Documentos generales (0..n) | `GeneralDocument` (actas, informes, mesa…) | presente | presente |
| Tipos de anuncio | `ValidNoticeInfo/NoticeTypeCode` (0..n) | presente | presente |
| Lotes | `ProcurementProjectLot` (0..n, con importes y CPV propios) | 19,1 % con lotes (191/1.002) | 25,8 % (103/399) |
| Criterios adjudicación / garantías / solvencia | `TenderingTerms/...` | presente (ej. `AwardingCriteria` con `WeightNumeric`) | presente |

\* En 1044 `TaxExclusiveAmount` existe pero `TotalAmount` no; los importes de 1044 deben leerse como valor estimado + base sin impuestos únicamente.

**Diferencias 643 vs 1044 (importantes para el diseño):**
- 1044 no trae `TotalAmount` ni nombre de provincia (`CountrySubentity`): la provincia solo se deriva del **código NUTS** (presente en el 100 %).
- 1044 trae documentos solo en ~72 % de entradas: el resto vive en la plataforma autonómica de origen (el `link` de la entry apunta allí, p. ej. `contratosdegalicia.gal`, `contractaciopublica.cat`, `juntadeandalucia.es`). El adaptador de 1044 debe seguir esos enlaces o aceptar "sin documentos en feed".
- 1044 no trae `Legal/TechnicalDocumentReference` en ~29 % de entradas; en esos casos el pliego no está en el feed.

## 4. Cómo distinguir estados y tipos de anuncio (spec v1.2 + listas `.gc` vivas)

### 4.1 Estados — `ContractFolderStatusCode`

Lista viva descargada 2026-11-14 (200): `https://contrataciondelestado.es/codice/cl/2.04/SyndicationContractFolderStatusCode-2.04.gc` (2.952 bytes). Valores (spec v1.2 §4.1 + lista 2.04):

| Código | Significado | ¿Oportunidad abierta? |
|---|---|---|
| `PRE` | Anuncio Previo | No (aviso anticipado; útil como vigilancia) |
| `PUB` | **EN PLAZO** — convocatoria publicada y plazo de ofertas abierto | **Sí** |
| `EV` | PENDIENTE DE ADJUDICACIÓN — plazo ya cerrado, sin adjudicar | No (seguimiento) |
| `ADJ` | Adjudicada (al menos un lote) | No |
| `RES` | Resuelta — formalizada, desierta, desistimiento o renuncia | No |
| `ANUL` | Anulada (con independencia del estado previo) | No |

**Distribución observada en la muestra (1.401 entradas):** PUB 398 (28,4 %), EV 442 (31,5 %), ADJ 275 (19,6 %), RES 271 (19,3 %), ANUL 9 (0,6 %), PRE 6 (0,4 %). Es decir, **solo ~28 % de lo que publica el feed en un día son convocatorias abiertas**; el resto son cambios de estado de expedientes ya conocidos. El producto debe filtrar por `PUB` + `EndDate ≥ hoy` (en la muestra, los 6 PUB del nicho cumplían plazo ≥ 2026-11-14).

### 4.2 Tipos de anuncio — `NoticeTypeCode`

Lista viva descargada 2026-11-14 (200): `https://contrataciondelestado.es/codice/cl/2.11/TenderingNoticeTypeCode-2.11.gc` (7.873 bytes). Principales (observados en muestra): `DOC_CN` (Anuncio de Licitación), `DOC_CD` (Anuncio de Pliegos), `DOC_PIN` / `DOC_PIN_RTL` (Anuncio Previo), `DOC_CAN_ADJ` (Adjudicación), `DOC_FORM` (Formalización), `DOC_MOD` (Modificación de contrato), `DOC_CCN` (Finalización), `RENUNCIA`, `DESISTIMIENTO`, `ANUL_CN` / `ANUL_CAN_ADJ` / `ANUL_FORM` (anulaciones). **Regla de clasificación recomendada:** estado `PUB` + `DOC_CN`/`DOC_CD` vigente = abierta; `DOC_MOD` = rectificación/modificación (vigilar, no es una apertura nueva); cualquier `ANUL_*` o estado `ANUL` = anulada; `DOC_CAN_ADJ`/`DOC_FORM` = adjudicación/formalización. Los `ValidNoticeInfo` son 0..n por entry: una misma entry puede traer `DOC_CN` + `DOC_CD` a la vez.

### 4.3 Paginación — spec v1.2 §3.2 (RFC 5005, "Paged Feeds")

- Entradas ordenadas por `<updated>` descendente (más recientes primero); cada fichero ≤ ~500 entradas.
- Enlaces `first` (más reciente), `last` (más antiguo), `prev`, `next`. **Verificado en vivo:** pág. 1 → pág. 2 → pág. 3 (`next` con sufijo `_1`).
- **Actualización de una licitación (caso 2):** se republica un `entry` con el **mismo `<id>`** y nuevo `<updated>`. Deduplicar por `<id>` (o por expediente+órgano) quedándose con el `<updated>` mayor. **Eliminación/archivado (caso 3):** extensión `<at:deleted-entry>` (no observada en la muestra; soportarla en el adaptador).
- **Importes (spec §4.4):** `EstimatedOverallContractAmount` = **valor estimado** (art. 9 Directiva 2004/18/CE; incluye prórrogas y modificados previstos); `TaxExclusiveAmount` = **presupuesto base sin impuestos**; `TotalAmount` = **presupuesto base con impuestos**. Los tres son conceptos distintos y **no deben intercambiarse ni compararse entre sí**.
  - Verificación empírica: en 643, `TotalAmount = TaxExclusiveAmount × (1+IVA)` en el **88 %** (878/1.002; IVA 21/10/4/0 %). El 12 % restante usa otros tipos o redondeos. El `EstimatedOverall` es independiente (p. ej. multi-anual: Río Hortega, valor estimado 1.980.940,96 € frente a base sin impuestos 990.470,48 €). Un caso observado con base sin impuestos > valor estimado (Axencia Turismo de Galicia: 3.998.954,75 € > 3.304.921,29 €) queda como anomalía puntual sin explicar — no afecta a la regla general.
- **Pliegos (spec §4.9):** PCAP = `LegalDocumentReference/.../URI` (0..1); PPT = `TechnicalDocumentReference/.../URI` (0..1); resto = `AditionalDocumentReference` (0..n) + `GeneralDocument`. En el feed vivo las URI son de dos formas: `.../FileSystem/servlet/GetDocumentByIdServlet?cifrado=…&DocumentIdParam=…` y `.../wps/wcm/connect/PLACE_es/...GetDocumentsById...`. Cada documento trae `DocumentHash` (útil para deduplicar por hash).
- **Lugar de ejecución (spec §4.10):** `ProcurementProject/RealizedLocation` con `CountrySubentity` (nombre), `CountrySubentityCode` (NUTS, lista NUTS-2021 en el feed vivo) y `Address` (ciudad, CP, calle). **Ver §6.3: el NUTS no siempre es el lugar de ejecución.**

## 5. CPV del nicho — verificados (no dados por buenos)

Los 5 códigos del prompt **existen** y sus descripciones se corroboraron en varias fuentes independientes concordantes (avisos de licitación que citan el vocabulario CPV; la comprobación oficial en SIMAP queda pendiente — ver §9):

| CPV (8 dígitos en feed) | Código completo | Descripción |
|---|---|---|
| `45331000` | 45331000-6 | Trabajos de instalación de calefacción, ventilación y aire acondicionado |
| `42512000` | 42512000-8 | Instalaciones de aire acondicionado |
| `42500000` | 42500000-1 | Equipos de refrigeración y ventilación |
| `50730000` | 50730000-1 | Servicios de reparación y mantenimiento de grupos refrigeradores |
| `50720000` | 50720000-8 | Servicios de reparación y mantenimiento de calefacción central |

CPV adicionales que aparecen en expedientes del nicho y conviene incluir en el clasificador (observados en la muestra): `45331200` (ventilación y aire acondicionado), `45331210` (ventilación), `45331220` (aire acondicionado), `45331230/45331231` (equipos de refrigeración), `42512300` (paquetes HVAC), `42510000`, `42520000` (equipos de ventilación), `50700000` (mantenimiento de instalaciones de edificios — muy genérico), `50710000`, `50531100`, `50413200`. Y como exclusiones típicas: `09134xxx` (combustibles), `09111400` (biomasa/leña), `79993xxx` (facility management genérico).

## 6. Medición del nicho climatización

### 6.1 Regla de clasificación usada

- **Palabras clave** (título, sin tildes, minúsculas): `climatizacion, hvac, aire acondicionado, ventilacion, calefaccion, refrigeracion, bomba de calor, climatizador, climatizar`. (`hvac`, `aire acondicionado` y `bomba de calor`: 0 aciertos en la muestra. `climatización` es el término dominante.)
- **CPV nicho:** los 5 de §5 (8 dígitos).
- **Nicho = palabra clave O CPV nicho.** Esta disyunción es necesaria: de los 22 únicos, **10 solo se detectan por CPV** (45 %; p. ej. "Mantenimiento integral IMDEA", "Renovación instalaciones fluidos Navantia"), **6 solo por palabra clave** y **6 por ambos**. Solo-palabras-clave perdería casi la mitad; solo-CPV perdería más de un cuarto.

### 6.2 Números (muestra: 1.401 entradas, ~1 día)

| Métrica | Valor observado |
|---|---|
| Entradas totales analizadas | **1.401** (643 p1: 504; 643 p2: 498; 1044: 399) |
| Expedientes únicos del nicho | **22** (1,6 % del total) |
| Del nicho, por feed | 643: 17 · 1044: 5 |
| Del nicho, por estado | **PUB 6 · EV 7 · ADJ 4 · RES 5** · PRE 0 · ANUL 0 |
| Del nicho, abiertos y vigentes (PUB + plazo ≥ 2026-11-14) | **6 de 6 PUB** (todos con plazo futuro) |
| Del nicho, con plazo de ofertas | 22/22 (100 %) |
| Del nicho, con alguna URI de documento | 19/22 (86 %); con PCAP 19/22; con PPT 19/22 |
| Del nicho, sin ninguna URI de documento en el feed | 3/22 (14 %; los 3 de 1044: Galicia, Andalucía ×2 — el documento vive en la plataforma autonómica) |
| Del nicho, con provincia (nombre o NUTS) | 22/22 vía NUTS; 17/22 con nombre |
| Duplicados 643 ∩ 1044 (clave expediente+órgano) | **0** (1.002 claves 643, 399 claves 1044, intersección vacía) |
| Aciertos por palabra clave | climatización 10 · calefacción 1 · refrigeración 1 · ventilación 1 |
| Aciertos por CPV | 45331000: 8 · 50720000: 5 · 50730000: 5 · 42512000: 2 · 42500000: 1 |

### 6.3 Distribución por provincia (nicho, 22 únicos; vía nombre o NUTS)

Madrid 7 · Valladolid 2 · Granada 2 · A Coruña 2 · Badajoz 1 · Almería 1 · Segovia 1 · Alicante/Alacant 1 · Región de Murcia 1 · Cataluña (NUTS2 ES51, sin provincia) 1 · Asturias 1 · Tarragona 1 · Jaén 1.

**Solo PUB (6):** Madrid 3 · Badajoz 1 · Segovia 1 · Asturias 1.

**CAVEAT — la provincia del feed no es fiable como lugar de ejecución.** Dos expedientes PUB de Paradores ("Obras para la climatización de la cocina del Parador de Turismo de **Salamanca**" y "…sustitución de los equipos de refrigeración… del Parador de Turismo de **Granada**") traen `CountrySubentity = Madrid`, NUTS `ES300` (sede central de Paradores). Lo mismo en el primer entry inspeccionado (obra en Chantada, Lugo → `RealizedLocation` Ourense, sede del órgano). **Regla:** no usar `RealizedLocation` como filtro de provincia sin contrastar con el título/objeto y, si hace falta, con la ficha de detalle. El filtro por provincia del producto necesita una capa de corrección (título > NUTS > órgano), o aceptará falsos positivos/negativos en órganos centralizados (Paradores, ministerios, mutuas, universidades). Cuantificar el error exige una muestra mayor; en esta muestra, 2 de los 6 PUB (33 %) llevan provincia engañosa.

### 6.4 Calidad de la clasificación (revisión manual de los 22)

- **Núcleo HVAC claro (título inequívoco):** ~13/22 (mantenimiento/instalación de climatización, ventilación, refrigeración).
- **Limítrofes:** ~4/22 (eficiencia energética con climatización como parte, frío industrial/cámaras, "mejora energética" con CPV 45331000).
- **Marginales / falsos positivos del clasificador amplio:** ~5/22, que un cliente de climatización probablemente descartaría: suministro de **gasóleo B para calefacción** (UMH Elche, solo por la palabra "calefacción"), **biomasa** en colegios de Cuéllar (PUB, por CPV 50720000), **mantenimiento integral** de edificios (IMDEA, PUB; Vera, EV — la climatización es una partida entre 20+ CPV), gestión integral de servicios energéticos (Hoyo de Manzanares, 21 CPV).
- **De los 6 PUB, núcleo HVAC: 3** (Badajoz, Parador Salamanca, Langreo) + **1 limítrofe** (Parador Granada, cámaras frigoríficas) + **2 marginales** (Cuéllar biomasa, IMDEA integral). Es decir, **~3–4 aperturas/día realmente aprovechables** por una pyme de climatización a nivel nacional, en esta muestra de un día.

### 6.5 Muestra: los 22 expedientes del nicho (todos, no una selección)

Importes en EUR tal como vienen en el feed: **VE = valor estimado** (`EstimatedOverallContractAmount`); **PB s/IVA** = presupuesto base sin impuestos (`TaxExclusiveAmount`); **PB c/IVA** = presupuesto base con impuestos (`TotalAmount`; vacío en 1044 porque ese feed no lo trae). Plazo = `TenderSubmissionDeadlinePeriod/EndDate` (+ hora cuando consta). Provincia = nombre del feed o, si falta, derivada del NUTS (marcada con \*).

#### Abiertas / en plazo (PUB) — 6

| # | Título | Órgano | Expediente | VE / PB s/IVA / PB c/IVA | Plazo | Prov. | URL oficial |
|---|---|---|---|---|---|---|---|
| 1 | Servicios de mantenimiento integral de las instalaciones de climatización, frigoríficas y de agua caliente sanitaria de los centros adscritos a la Vicepresidencia y Consejería de Desregulación, Servicios Sociales y Familia en Badajoz | Servicio de Coordinación Territorial | PSS/2026/0000130740 | 42.884,99 / 35.737,49 / 43.242,36 | 2026-11-24 23:59 | Badajoz | https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=QT1TZUxjkwM7%2B9FIQYNjeQ%3D%3D |
| 2 | Contrato mixto de obras de instalación y servicio de reparación de sistemas de climatización en edificios municipales | Alcaldía del Ayuntamiento de Langreo | 9124/2026 | 179.416 / 179.416 / 217.093,36 | 2026-11-30 23:59 | Asturias | https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=ktMrtf23hFQ2wEhQbcAqug%3D%3D |
| 3 | Obras para la climatización de la cocina del Parador de Turismo de Salamanca | Paradores de Turismo de España, S.M.E., S.A. | 2026-0666 | 115.500 / 105.000 / 127.050 | 2026-12-03 14:00 | Madrid\* (ejecución: Salamanca) | https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=A0pumpBPbmW9Hd5zqvq9cg%3D%3D |
| 4 | Trabajos de sustitución de los equipos de refrigeración de las cámaras y los cuartos fríos de la cocina del Parador de Turismo de Granada | Paradores de Turismo de España, S.M.E., S.A. | 2026-0667 | 154.000 / 140.000 / 169.400 | 2026-12-03 14:00 | Madrid\* (ejecución: Granada) | https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=25Jb%2BpxrPVIzjChw4z%2FXvw%3D%3D |
| 5 | Suministro de energía y servicio de mantenimiento integral de las instalaciones de biomasa en los colegios de educación infantil y primaria de Cuéllar: Colegio San Gil y Colegio La Villa | Alcaldía del Ayuntamiento de Cuéllar | 5734/2026 | 64.140 / 64.140 / 77.609,40 | 2026-11-23 23:59 | Segovia | https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=HPxhRrUHdu%2F%2B3JAijKO%2Bkg%3D%3D |
| 6 | Mantenimiento integral de la Fundación IMDEA Materiales - 2026 | Fundación IMDEA MATERIALES | 04/2026 | 760.000 / 190.000 / — | 2026-11-30 17:00 | Madrid\* (NUTS ES300) | https://contratos-publicos.comunidad.madrid/contrato-publico/mantenimiento-integral-fundacion-imdea-materiales-2026 |

#### Pendientes de adjudicación (EV, plazo cerrado) — 7

| Título | Órgano | Expediente | VE / PB s/IVA / PB c/IVA | Plazo | Prov. |
|---|---|---|---|---|---|
| Servicio de mantenimiento de las instalaciones de climatización, ventilación y tratamiento de aire en las delegaciones de Unión de Mutuas (Cataluña) | Dirección Gerencia de Unión de Mutuas | 98/2026 | 89.115 / 44.035 / 53.282,35 | 2026-11-08 23:59 | Cataluña (NUTS2) |
| Servicio de mantenimiento de las instalaciones de climatización del Hospital Universitario Río Hortega y Centro de Especialidades Arturo Eyríes | Gerencia de Atención Especializada Hospital Univ. Río Hortega de Valladolid | 8301-831-1-2026-17010 | 1.980.940,96 / 990.470,48 / 1.198.469,28 | 2026-10-20 23:59 | Valladolid |
| Obras de mejora energética y adaptación del local social de Piñeiro | Junta de Gobierno Local del Ayuntamiento de Ames | 9756/2026 | 119.790,17 / 108.900,16 / 131.769,19 | 2026-10-08 23:59 | A Coruña |
| Ejecución de los servicios habituales para prestación de los servicios públicos de competencia municipal | Pleno del Ayuntamiento de Vera | 2912/2024 | 3.380.000 / 2.535.000 / 3.067.350 | 2028-07-30 14:30 | Almería |
| Obras para la instalación de sistemas de climatización en centros cívicos Pilarica y José Luis Mosquera | Concejalía Delegada de Participación Ciudadana, Juventud y Deportes del Ayuntamiento de Valladolid | SE PC 5-2026 2026/OAN_01/000031 | 120.785,82 / 100.654,85 / 121.792,37 | 2026-10-14 23:59 | Valladolid |
| obras de climatización nave taller centro albayzín | Dirección Provincial del Servicio Andaluz de Empleo de Granada | CONTR 2026 0000268546 | 156.145,92 / 156.145,92 / — | 2026-11-10 18:00 | Granada\* (NUTS ES614) |
| Suministro e instalación de equipos de climatización para diversas salas del inmueble situado en C/ Huertas 73, de Madrid, sede del Consejo Económico y Social (CES) | Presidencia del Consejo Económico y Social | 46-2026 | 40.000 / 40.000 / 48.400 | 2026-11-11 00:00 | Madrid |

#### Adjudicadas (ADJ) — 4

| Título | Órgano | Expediente | VE / PB s/IVA / PB c/IVA | Plazo | Prov. |
|---|---|---|---|---|---|
| Gestión integral de los servicios energéticos del Ayuntamiento de Hoyo de Manzanares | Pleno del Ayuntamiento de Hoyo de Manzanares | 5988/2023 | 7.668.915,20 / 7.668.915,20 / 9.279.387,39 | 2026-07-16 23:59 | Madrid |
| Mantenimiento instalaciones D.T. Salud y Consumo Jaén y Laboratorio Jaén | Delegación Territorial de Salud y Consumo en Jaén | CONTR 2026 0000099548 | 67.032,18 / 33.526,18 / — | 2026-09-22 14:00 | Jaén\* (NUTS ES616) |
| Renovación instalaciones fluidos en mesas 1 y 2 Navantia Fene | Comité Central de Compras de Navantia S.A., S.M.E. | 5100073161 | 240.000 / 240.000 / 290.400 | 2026-09-25 11:00 | Madrid\* (ejecución: Fene, A Coruña) |
| Suministros para la adecuación de una sala para destinarla a realización de exámenes de la Dirección General de Tráfico en Loja | Alcaldía del Ayuntamiento de Loja | 2026/3575 | 41.322,31 / 41.322,31 / 50.000 | 2026-10-30 23:59 | Granada |

#### Resueltas (RES) — 5

| Título | Órgano | Expediente | VE / PB s/IVA / PB c/IVA | Plazo | Prov. |
|---|---|---|---|---|---|
| Mantenimiento preventivo y correctivo de los equipos e instalaciones de climatización de la oficina de la Mutualidad General Judicial, C/ Fuencarral 45, 6ª planta (Madrid) | Mutualidad General Judicial MUGEJU | 2025_003_ASE CLIMATIZACIÓN FUENCARRAL | 9.450 / 4.725 / 5.717,25 | 2025-07-04 14:00 | Madrid |
| Murcia / Alcantarilla / Base Aérea de Alcantarilla / Climatización sala de plegados de la Base Aérea de Alcantarilla | Jefatura de la Sección Económico-Administrativa 41 - Base Aérea de San Javier | 2026/EA41/00001656E | 43.880,18 / 43.880,18 / 53.095,02 | 2026-09-07 23:59 | Región de Murcia |
| Suministro de gasóleo tipo B como combustible para el funcionamiento de las instalaciones de grupos electrógenos y calefacción de la Universidad Miguel Hernández de Elche | Rectorado de la Universidad Miguel Hernández de Elche | 2026_034 | 74.380,17 / 24.793,39 / 30.000 | 2026-09-18 14:00 | Alicante/Alacant |
| Suministro de los aparatos (…), desmontaje de las máquinas existentes, instalación y puesta en marcha de nuevos equipos de climatización (bombas de calor de alta eficiencia energética) [Ayuntamiento del Vendrell] | Ajuntament del Vendrell | GCON2026000057 | 46.475 / 46.475 / — | 2026-09-25 23:59 | Tarragona\* (NUTS ES514) |
| ATG-2026-0018: obra Mejora de eficiencia energética del edificio de cocinas del Centro Superior de Hostelería de Galicia, A Barcia, Santiago de Compostela (FEDER 2021-2027, 60 %) | Axencia Turismo de Galicia | PcPG/2026/828059 | 3.304.921,29 / 3.998.954,75 / — | 2026-06-05 14:00 | A Coruña\* (NUTS ES111) |

URLs oficiales de las 16 no-PUB: en el JSON de trabajo (`/tmp/licitaclima/niche_unique.json`, campo `link`). Las 6 PUB están en la tabla superior con su URL completa.

### 6.6 Pliegos: ¿el enlace funciona?

Muestra: 7 URIs reales de documentos del nicho (2 expedientes: PSS/2026/0000130740 Badajoz y 46-2026 CES; mezcla de `GetDocumentByIdServlet` y `wcm/connect`), probadas con `curl` el 2026-11-14.

- **Con UA mínimo (`-A "Mozilla/5.0"`): 0/7.** Las 7 devuelven HTTP 200 con `Content-Type: text/html`, 244–245 bytes: página **"Request Rejected … Your support ID is: <…>"** (WAF de `contrataciondelestado.es`). No es un PDF ni un error 403: es un bloqueo por huella de cliente.
- **Con UA completo de navegador Chrome 120: 7/7 OK.** HTTP 200, `Content-Type: application/pdf`, tamaños 118.185–1.132.024 bytes, 1–11 páginas por documento (verificado con `file`: PDF 1.4/1.7). Tiempos 1,2–5,2 s por documento.
- **Conclusión:** la descarga de pliegos desde servidor **funciona, pero exige UA realista** (y conviene probar además `Referer` + rotación de UA si el WAF endurece). Es un riesgo operativo, no un bloqueo: el adaptador debe usar UA de navegador, reintentar con backoff y registrar el rechazo del WAF como `fuente_no_disponible`, sin presentar el HTML de rechazo como documento. No se probó descarga desde plataformas autonómicas (1044): pendiente.
- No se probó la descarga del detalle de licitación en HTML (`deeplink:detalle_licitacion`): `browser.open` sobre un deeplink devuelve solo "Debe rellenar los criterios de búsqueda para poder acceder al detalle" (requiere sesión/búsqueda previa). El Atom + los PDF son la vía de datos; la ficha web no es scrapeable directamente por URL.

## 7. Coste de extracción estimado

Medido en esta VM (2026-11-14, red compartida; tiempos orientativos):

| Operación | Medido |
|---|---|
| Feed 643, 1 página (504 ent.) | 14,9 MB · 17,7 s |
| Feed 643, pág. 2 (498 ent.) | 13,9 MB · 19,2 s |
| Feed 1044, 1 página (399 ent.) | 4,6 MB · 7,0 s |
| Pliego PDF (7 muestras, UA Chrome) | 0,12–1,13 MB · 1,2–5,2 s c/u |
| Rate limit / 429 | **Ninguno observado** en ~15 peticiones secuenciales |
| `ETag` / `Last-Modified` | **Sí en 643** (ETag `"e2d5ca-6602d57827e12"`, Last-Modified 13 nov 2026 19:21:58 GMT). En 1044 no comprobado. Sirven para GET condicional en el "first" (ahorra re-descargar si no hay cambios). |

**Estimaciones (órdenes de magnitud, a confirmar con el pull de 30 días):**
- **Backfill 30 días por Atom:** ~120–210 peticiones, **~1,2–2,5 GB** descargados, ~30–45 min secuencial a los ritmos observados (paralelizable con concurrencia baja; sin 429 observado, pero conviene limitar a 2–4 en paralelo y respetar backoff). El grueso es 643 (~14 MB/pág. × 60–120 págs.).
- **Backfill 30 días por ZIP mensual:** probablemente mucho más eficiente (un solo fichero/mes), **pero sin verificar** (hacienda.gob.es inaccesible; URL/tamaño del ZIP pendientes).
- **Incremental cada 6 h (lo que pide el prompt):** ~1 página por feed y ejecución (643 publica ~137 ent./h en horas activas; 6 h ≈ 400–800 ent. — en picos puede ser 2 páginas). ~20 MB por ejecución, ~25 s. Asumible.
- **Pliegos del nicho:** ~6 PUB/día × ~2 pliegos (PCAP+PPT) ≈ 12 PDF/día ≈ 5–10 MB/día. Si se descargan todos los documentos generales del nicho, más (los PUB traen 2–19 URIs por expediente; media del nicho ≈ 9). Descargar solo PCAP+PPT al inicio es lo sensato.
- **Almacenamiento 30 días (solo Atom):** ~1,2–2,5 GB brutos; parseado y guardado en PostgreSQL, mucho menos (los XML son verbosos: cada entry repite el árbol del órgano con toda la jerarquía).

## 8. Veredicto

### 8.1 ¿El nicho da volumen suficiente para un resumen diario útil?

**A nivel nacional, sí hay flujo diario; a nivel de cliente (3 provincias, 49 €/mes), probablemente no basta tal como está definido.**

- Nacional: **~6 aperturas/día** (muestra de 1 día), **~3–4/día de núcleo HVAC** tras quitar marginales. En 30 días serían ~180 aperturas (~90–120 de núcleo). Eso sí alimenta un boletín nacional diario con contenido real.
- Por cliente: el plan inicial cubre **hasta 3 provincias**. Con 6 aperturas/día repartidas por toda España, un cliente típico vería **~0–1 aperturas nuevas la mayoría de los días** y del orden de **5–10/mes** (extrapolación lineal 6/día × 3/52 provincias; distribución real sesgada a Madrid y con el error de provincia de §6.3). El propio prompt (§5) ya prevé "no enviar mensajes vacíos cada día; ofrecer resumen semanal de actividad sin novedades": con este volumen, **el resumen diario estaría vacío con frecuencia** y el producto se parecería más a un **aviso semanal + alertas** que a un diario.
- Además el plan vende **10 análisis completos/mes**: con ~5–10 oportunidades/mes por cliente, la cuota de análisis no sería el cuello de botella; el cuello es la **escasez de oportunidades**.
- **La muestra es de 1 día**: la estacionalidad (p. ej. más obra en primavera, cierres en agosto/diciembre) puede mover el volumen ±50 % o más. No se puede cerrar el veredicto comercial con un día. Lo que sí se puede afirmar: **el orden de magnitud es unidades por día, no decenas**.

### 8.2 Ampliación propuesta (con evidencia, por orden de preferencia)

1. **Confirmar el volumen con 30 días reales antes de construir el flujo comercial.** Pull paginado de 30 días (o ZIP mensual) con la misma regla de clasificación. Coste estimado §7. Si el mes da <100 aperturas de núcleo, el nicho estricto no sostiene el plan; si da 150–250, sí (con posicionamiento semanal). **Esto es lo primero; sin ello el resto es especulación.**
2. **Ampliar el nicho a "instalaciones térmicas y eficiencia energética"** (decisión de Jon, no técnica). Evidencia: en la muestra ya aparecen expedientes limítrofes que el clasificador estricto deja fuera o trae como marginales: eficiencia energética de edificios (Ames, ATG Galicia 3,3 M€), biomasa (Cuéllar), frío industrial/cámaras (Paradores), mantenimiento integral de edificios (IMDEA 760.000 €, Vera 3,38 M€). Añadir CPV `45330000` (fontanería/calefacción), `45259300` (reparación de calefacción), `71314000`/`71315000` (servicios energéticos), `42520000`, `50750000` y palabras como `eficiencia energética`, `instalaciones térmicas`, `frío industrial`, `aerotermia`, `geotermia` multiplicaría el volumen, a costa de diluir el encaje ("climatización" pura). Medir el incremento en el pull de 30 días antes de decidir.
3. **Ampliar territorio por cliente o cambiar la promesa:** o más provincias por plan, o alertas nacionales de grandes contratos (p. ej. >100.000 €), o resumen **semanal** como producto principal con alertas diarias solo cuando hay novedad en sus provincias. La evidencia (§6.2) apoya el formato semanal.
4. **Añadir fuentes adyacentes (Fase posterior, no MVP):** TED (licitaciones UE), plataformas autonómicas no agregadas en 1044, y BOE. **No verificado en este estudio**: no se afirma cobertura ni volumen de ninguna de ellas. Cada una necesita su propia prueba de acceso como esta.
5. **No cambiar silenciosamente de mercado** (prompt §2): si el nicho no basta, presentar estos números a Jon y que él decida la ampliación; no redefinir "climatización" por la puerta de atrás.

### 8.3 Lo que sí está probado técnicamente

- Ingesta Atom con paginación RFC 5005, deduplicación por `<id>`/expediente, estados y tipos de anuncio codificados, importes diferenciados (VE / PB s/IVA / PB c/IVA), CPV, NUTS, plazos con hora, lotes, criterios de adjudicación, y descarga de pliegos PDF con UA realista. Todo lo necesario para el MVP de datos **existe y funciona**.
- Riesgos técnicos que el diseño debe asumir: (a) WAF que rechaza UA no de navegador; (b) historial de caídas del feed de días/semanas (datos.gob.es, jul–oct 2026); (c) `hacienda.gob.es` inaccesible desde esta VM (a verificar desde Oracle); (d) provincia de ejecución no fiable en órganos centralizados; (e) 1044 sin `TotalAmount`, sin nombre de provincia y con ~28 % de entradas sin documentos en el feed; (f) la spec v1.3 no leída (solo v1.2 de 2018 + listas `.gc` vivas).

## 9. Reproducibilidad (comandos)

```bash
mkdir -p /tmp/licitaclima
cd /tmp/licitaclima
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
# Feeds (200 OK el 2026-11-14; ~18 s y ~7 s respectivamente)
curl -s -o feed643.atom  -A "$UA" "https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom"
curl -s -o feed1044.atom -A "$UA" "https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_1044/PlataformasAgregadasSinMenores.atom"
# Paginación: seguir el <link rel="next"> de cada fichero
curl -s -o feed643_p2.atom -A "$UA" "https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3_20261113_202142.atom"
# Cabeceras (ETag / Last-Modified) — 643 verificado
curl -s -D - -o /dev/null -A "$UA" "https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom"
# Listas de códigos vivas (200 OK)
curl -s -o statuscodes.gc "https://contrataciondelestado.es/codice/cl/2.04/SyndicationContractFolderStatusCode-2.04.gc"
curl -s -o noticetypes.gc "https://contrataciondelestado.es/codice/cl/2.11/TenderingNoticeTypeCode-2.11.gc"
# Contar entradas y clasificar (python3, xml.etree) — el script usado está en /tmp/licitaclima/analyze.py
python3 -c "
import xml.etree.ElementTree as ET
for f in ('feed643.atom','feed643_p2.atom','feed1044.atom'):
    r=ET.parse(f).getroot()
    print(f, len(r.findall('{http://www.w3.org/2005/Atom}entry')))"
# Pliego de ejemplo (PDF real; con UA mínimo da "Request Rejected", con UA Chrome da application/pdf)
curl -s -o pliego.pdf -A "$UA" "https://contrataciondelestado.es/FileSystem/servlet/GetDocumentByIdServlet?cifrado=QUC1GjXXSiLkydRHJBmbpw%3D%3D&DocumentIdParam=2bwz2cPXHbQPzVLVHiUToRqmEVGKeZ1HT2JAE8PkTEvUXBU147pJBieM8uxBSO1vCxGY/Hmz6yEkNvDdYx68K%2BgrDtozeOnaE2LWHZz3IT6Cx2e6p7hqtlp2aFupgHMr"
file pliego.pdf   # -> PDF document, version 1.4, 10 page(s)
```

Ficheros de trabajo de este estudio (en `/tmp/licitaclima/`, efímeros): `feed643.atom`, `feed643_p2.atom`, `feed1044.atom`, `analyze.py`, `analysis.txt`, `feed643.json`, `feed643_p2.json`, `feed1044.json`, `niche_unique.json`, `statuscodes.gc`, `noticetypes.gc`, `pliego_sample.txt`, `pliego_ok_*.bin` (7 PDF de muestra).

## 10. Probado / no probado / pendiente

**Probado con fuente real (2026-11-14):** feeds 643 y 1044 (200, paginación, ETag en 643), estructura CODICE completa por entry, estados y tipos de anuncio (listas `.gc` vivas), CPV del nicho (existen), clasificación por palabra clave + CPV (22 únicos, 6 PUB), provincia vía NUTS (100 %) con la trampa de sede vs ejecución, descarga de 7/7 pliegos PDF con UA Chrome (y 0/7 con UA mínimo), importes diferenciados y su relación (Total = base s/IVA × (1+IVA) en 88 %), duplicados 643∩1044 = 0, ritmo de publicación (~137 ent./h en 643).

**No probado:** pull de 30 días (la muestra es de ~1 día); ZIP mensuales de Hacienda (host inaccesible); descarga de pliegos desde plataformas autonómicas (1044); `ETag`/`Last-Modified` en 1044; `robots.txt` y límites de uso; comportamiento del WAF ante descargas sostenidas (muchos PDF seguidos); ficha de detalle web por deeplink (requiere búsqueda/sesión previa); verificación oficial SIMAP de las descripciones CPV (corroboradas en fuentes secundarias concordantes, no en SIMAP).

**Pendiente (requiere decisión o acceso):** leer la spec **v1.3** y el **aviso legal** de Hacienda (reutilización/atribución) — ambos en `hacienda.gob.es`, inaccesible desde esta VM; verificar el ZIP mensual desde Oracle u otra red; resolver la anomalía puntual ATG (base s/IVA > valor estimado); cuantificar el error de provincia con una muestra mayor; decidir la ampliación de nicho/territorio/formato (§8.2).

## 11. Decisiones que quedan para Jon (no tomadas aquí)

1. **¿Se hace el pull de 30 días para confirmar el volumen antes de construir?** (Recomendado: sí; es el paso que convierte este estudio de 1 día en una decisión comercial.)
2. **¿Se amplía el nicho** a eficiencia energética / instalaciones térmicas / frío industrial / mantenimiento integral, o se mantiene "climatización" estricta aunque el resumen diario quede vacío muchos días?
3. **¿Resumen diario o semanal como promesa principal?** Con ~6 aperturas/día nacionales, el diario por 3 provincias estará vacío con frecuencia; el prompt ya contempla el semanal sin novedades.
4. **¿Se amplía el territorio por plan** (más de 3 provincias) o se añaden alertas nacionales de grandes contratos para compensar el bajo volumen provincial?
5. **¿Se acepta la dependencia del feed con su historial de caídas** (jul–oct 2026) y el WAF con UA de navegador, con el diseño de "fuente no disponible" visible al cliente, o se busca una fuente espejo/comercial de respaldo?
6. **¿Se verifica la licencia de reutilización** (aviso legal de Hacienda) antes de explotar los datos comercialmente? Sin leerla no se puede afirmar que el uso comercial con atribución esté cubierto.
7. **¿Se añaden en Fase posterior TED / plataformas autonómicas no agregadas / BOE** como fuentes, con su propia prueba de viabilidad cada una?
