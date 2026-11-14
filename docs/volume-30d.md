# LicitaClima — Pull de 30 días: volumen real del nicho

**Fecha:** 2026-11-14 · **Ventana:** 2026-10-15 → 2026-11-14 (31 días naturales; el 14 nov es sábado parcial, ver §6) ·
**Fase A de referencia:** [`data-feasibility.md`](data-feasibility.md) (2026-11-14)

## 0. Resumen ejecutivo

| Magnitud | Valor |
|---|---|
| Páginas Atom descargadas | **185** (643: 129 · 1044: 56) |
| Entradas descargadas | **90.805** (643: 64.360 · 1044: 26.445) |
| Entradas en ventana (≥15 oct) | 90.049 (64.103 + 25.946; las 756 restantes son de la página de corte, 14 oct) |
| IDs Atom distintos | 57.658 |
| Expedientes únicos | **57.648** (643: 40.888 · 1044: 16.760 · solape inter-feed: 0) |
| Expedientes de nicho | **913** (1,58 %) — 643: 733 · 1044: 180 |
| **Aperturas PUB del nicho** | **196** |
| **Aperturas de núcleo HVAC (final, tras revisión manual)** | **147** |
| Aperturas núcleo + limítrofe («amplio») | 156 |
| Aperturas marginales | 40 |
| Media/día natural (31 días) | nicho 6,3 · núcleo 4,7 · amplio 5,0 |
| Media/día laborable (22 días) | nicho 8,9 · núcleo 6,7 · amplio 7,1 |
| Mediana/día laborable | núcleo 6 |
| Días con 0 aperturas | 9 — todos sábados/domingos (incl. el 14 nov parcial) |
| Días laborables con 0 núcleo | 1 — lunes 2 nov (puente) |

**Veredicto contra los umbrales de Fase A §8.2** («<100 núcleo → el nicho estricto no sostiene el plan; 150–250 → sí, con posicionamiento semanal»):

> **El núcleo queda justo por debajo del umbral: 147 aperturas en 30 días, a 3 del límite inferior de la banda (150). El «amplio» (núcleo + limítrofe) entra justo en la banda con 156.** Es el caso «entre medias» que Fase A pedía decir tal cual: ni fracaso claro ni sí rotundo. La decisión —posicionamiento semanal, ampliación de nicho, ampliación de territorio o cambio de promesa— es de Jon, con estos números delante (§8).

El pull confirma la extrapolación de Fase A (que preveía ~180 aperturas y ~90–120 de núcleo en 30 días a partir de 1 día): el nicho real es algo mayor de lo previsto (196), y el núcleo claramente mayor (147 frente a 90–120). La conclusión de Fase A §8.1 se mantiene en lo esencial: **a nivel nacional hay flujo diario; a nivel de cliente de 3 provincias, el volumen es justo** (§5).

## 1. Método

### 1.1 Fuentes y regla de clasificación

Las mismas dos fuentes de Fase A, paginación Atom siguiendo `<link rel="next">`:

- **Feed 643** — `contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom`
- **Feed 1044** — `contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_1044/PlataformasAgregadasSinMenores.atom`

**Regla de clasificación: EXACTAMENTE la de Fase A** (§5 CPV + §6.1 palabras clave), para que los números sean comparables:

- CPV de nicho (5): `45331000` (instalación de calefacción, ventilación y aire acondicionado), `42512000` (aire acondicionado), `42500000` (refrigeración y ventilación), `50730000` (reparación/mantenimiento de refrigeración), `50720000` (reparación/mantenimiento de calefacción central).
- Palabras clave en el título (9, en español): climatizacion, hvac, aire acondicionado, ventilacion, calefaccion, refrigeracion, bomba de calor, climatizador, climatizar.
- Nicho = palabra clave **O** CPV.

**Deduplicación:** por `<id>` Atom (57.658 distintos de 90.049 filas) y por (expediente + órgano) → 57.648 expedientes únicos. **Solape entre feeds: 0** — ningún expediente aparece en los dos feeds. **Apertura** = expediente cuya primera fecha PUB cae dentro de la ventana; un expediente PUB que luego pasa a EV/ADJ/RES cuenta una sola vez.

**Descarga:** script `scripts/pull_30d.py` — UA de navegador real (el WAF rechaza UA mínimo), parseo de cada página con `xml.etree` nada más descargarla, XML descartado tras parsear, checkpoint por página en `state.json` (reanudable), backoff con jitter ante 429/5xx, inventario por página (`pages_inventory.csv`: URL, entradas, rango `updated`, bytes, HTTP, reintentos). Agregación en `scripts/aggregate_30d.py`; revisión manual y cifras finales en `scripts/finalize_30d.py`.

### 1.2 Revisión manual de las 196 aperturas

La preclasificación por reglas (núcleo 157 · limítrofe 5 · marginal 34) se revisó **título a título** contra el criterio de Fase A §6.4 (fuera del núcleo: gasóleo/biomasa/combustibles, mantenimiento integral genérico donde la climatización es una partida entre muchas, servicios energéticos). Resultado: **24 correcciones** (`niche_30d.json`: campo `clase_final` + `motivo_manual`; `preclass` se conserva intacta).

**Núcleo → marginal (13):** suministro de gas natural ×4 (Siero, JCCM Ciudad Real, INSS Burgos, TGSS Burgos — suministro de combustible, no instalación); mascarillas de ventilación no invasiva (Parc Taulí — ventilación médica, falso positivo por palabra clave); ventilación de evacuación de incendios en andenes ADIF (VE 44,29 M€ — solo la palabra «ventilación»); itinerario formativo de fontanería/climatización (Cáceres — un curso, no una obra); ascensor (Algora), mobiliario (Jarandilla), electrodomésticos/cocina industrial y equipos mecánicos (Navantia ×2) — CPV de nicho no corroborado por el título; mantenimiento de fontanería+electricidad del C. Penitenciario de Córdoba y mantenimiento multisistema genérico de la TGSS en Gipuzkoa.

**Núcleo → limítrofe (4):** homologación de proveedores de Cetursa (VE 24,33 M€ — marco, sin obra concreta); servicios energéticos ESCO de Mos (VE 42,09 M€); eficiencia energética en edificios municipales de Rivas Vaciamadrid; suministro de equipamiento para un curso de FP de frigoríficas/climatización (Soria).

**Marginal → núcleo (7):** la regla se había equivocado en sentido contrario — Betanzos (renovación térmica completa: se retira el gasóleo y se pone aerotermia + climatización; el «gasóleo» del título es lo que se elimina); caldera de Renfe y torres de refrigeración de Renfe (la regla falló por «mantenimiento integral» en el título, que es el nombre de la base); mejora de ventilación del Centro de Hemoterapia (la regla falló por un CPV 09111400 no relacionado con el objeto); mantenimiento de la instalación solar térmica/ACS de Sevilla; y dos mantenimientos integrales **cuyo objeto son las instalaciones térmicas en sí** (Amorebieta-Etxano y ESAUM León).

**Neto: núcleo 157 → 147 · limítrofe 5 → 9 · marginal 34 → 40.** Los 5 limítrofes originales se mantienen (eficiencia energética con climatización como parte: A Fonsagrada, Berga, Quintana de la Serena, Autoridad Portuaria de Málaga, Boecillo).

**Caveat — núcleo detectado solo por CPV (30 de 147):** 19 de esos 30 mencionan la climatización en el título en catalán (`climatització`, `calefacció`, `refrigeració`, `tèrmiques`) o con variantes que la lista española no incluye (`acondicionamiento de aires`, `refredadores`, `instalaciones frigoríficas`); solo **5 son reformas genéricas** (edificio cultural de Vilanova de l'Aguda, escuela infantil La Jordana, mercado de Fuente de Cantos, centro cultural El Fito de Cabanillas, acabados de quirófanos de Castellón) que entran únicamente por el CPV 45331000 y podrían ser errores de codificación del órgano. La lista de palabras clave es la de Fase A (solo español) por comparabilidad; ampliarla a catalán/gallego/vasco y a `acondicionamiento`/`frigorífico` reduciría los «solo CPV» a ~5. En todo el nicho hay 30 expedientes con `climatització` en el título.

## 2. Totales y deduplicación

| | Feed 643 | Feed 1044 | Total |
|---|---|---|---|
| Páginas | 129 | 56 | **185** |
| Entradas descargadas | 64.360 | 26.445 | **90.805** |
| Entradas en ventana (≥15 oct) | 64.103 | 25.946 | 90.049 |
| Bytes descargados (corridas buenas) | 1.953 MB | 286 MB | **2.239 MB** |
| Expedientes únicos | 40.888 | 16.760 | **57.648** |
| Expedientes de nicho | 733 | 180 | **913 (1,58 %)** |
| Aperturas PUB de nicho | 158 | 38 | **196** |
| Aperturas de núcleo | 118 | 29 | **147** |
| Aperturas núcleo+limítrofe | 124 | 32 | **156** |

Solape inter-feed: **0 expedientes**. El feed 1044 aporta el 20 % del nicho y el 20 % del núcleo: no es redundante, hay que mantenerlo.

## 3. Serie diaria de aperturas

Fecha de primera publicación PUB. 22 días laborables, 9 de fin de semana. (Tabla completa en `data/volume-30d/daily_counts.csv`.)

| Fecha | Día | Nicho | Núcleo | Amplio | Marginal | Entradas 643 | Entradas 1044 |
|---|---|---|---|---|---|---|---|
| 2026-10-15 | jue | 5 | 3 | 3 | 2 | 2.877 | 1.086 |
| 2026-10-16 | vie | 4 | 4 | 4 | 0 | 2.963 | 1.080 |
| 2026-10-17 | sáb | 0 | 0 | 0 | 0 | 80 | 33 |
| 2026-10-18 | dom | 0 | 0 | 0 | 0 | 38 | 22 |
| 2026-10-19 | lun | 4 | 2 | 2 | 2 | 2.910 | 1.081 |
| 2026-10-20 | mar | 4 | 2 | 3 | 1 | 2.749 | 885 |
| 2026-10-21 | mié | 8 | 4 | 4 | 4 | 3.095 | 2.062 |
| 2026-10-22 | jue | 3 | 3 | 3 | 0 | 2.948 | 1.336 |
| 2026-10-23 | vie | 8 | 7 | 8 | 0 | 2.887 | 1.730 |
| 2026-10-24 | sáb | 0 | 0 | 0 | 0 | 55 | 46 |
| 2026-10-25 | dom | 0 | 0 | 0 | 0 | 155 | 28 |
| 2026-10-26 | lun | 13 | 11 | 11 | 2 | 3.132 | 1.197 |
| 2026-10-27 | mar | 13 | 12 | 12 | 1 | 2.959 | 1.173 |
| 2026-10-28 | mié | 4 | 2 | 2 | 2 | 3.103 | 1.100 |
| 2026-10-29 | jue | 7 | 4 | 7 | 0 | 2.869 | 1.079 |
| 2026-10-30 | vie | 7 | 6 | 7 | 0 | 3.072 | 1.077 |
| 2026-10-31 | sáb | 0 | 0 | 0 | 0 | 48 | 48 |
| 2026-11-01 | dom | 0 | 0 | 0 | 0 | 181 | 17 |
| 2026-11-02 | lun | 2 | 0 | 0 | 2 | 1.078 | 689 |
| 2026-11-03 | mar | 9 | 6 | 6 | 3 | 2.931 | 1.206 |
| 2026-11-04 | mié | 9 | 7 | 7 | 2 | 3.129 | 1.271 |
| 2026-11-05 | jue | 16 | 12 | 12 | 4 | 3.080 | 1.092 |
| 2026-11-06 | vie | 9 | 6 | 6 | 3 | 3.047 | 1.225 |
| 2026-11-07 | sáb | 0 | 0 | 0 | 0 | 52 | 42 |
| 2026-11-08 | dom | 0 | 0 | 0 | 0 | 194 | 19 |
| 2026-11-09 | lun | 8 | 6 | 7 | 1 | 2.426 | 1.061 |
| 2026-11-10 | mar | 11 | 11 | 11 | 0 | 3.119 | 1.176 |
| 2026-11-11 | mié | 20 | 14 | 16 | 4 | 3.096 | 971 |
| 2026-11-12 | jue | 19 | 15 | 15 | 4 | 2.976 | 1.204 |
| 2026-11-13 | vie | 13 | 10 | 10 | 3 | 2.854 | 889 |
| 2026-11-14 | sáb | 0 | 0 | 0 | 0 | 0 | 21 |

**Lectura:**

- **Fines de semana: 0 aperturas en los 9 días.** No es un hueco de datos: los feeds publican muy poco en fin de semana (17–194 entradas/día en 643, frente a ~2.900–3.100 en laborable). El producto no tiene nada que enviar sábado ni domingo; el resumen semanal cubre esos días sin esfuerzo.
- **Media por día laborable: 8,9 nicho · 6,7 núcleo · 7,1 amplio** (mediana de núcleo en laborable: 6). Por día natural: 6,3 · 4,7 · 5,0.
- **Picos:** 11 nov (20 nicho / 14 núcleo / 16 amplio), 12 nov (19 / 15 / 15), 5 nov (16 / 12 / 12). No hay un patrón semanal estable: el rango laborable de núcleo es 0–15.
- **2 nov (lunes, puente tras Todos los Santos): 0 aperturas de núcleo** (2 marginales) y solo 1.078 entradas en 643 (un laborable típico trae ~2.900–3.100). Efecto festivo, no caída del feed. Es el único día laborable con 0 núcleo.
- **14 nov (sábado, parcial):** 0 entradas en 643 y 21 en 1044 a la hora del pull (13:03–13:52). La ventana es de 31 días naturales; la ventana estricta de 30 días (15 oct–13 nov) da **exactamente los mismos totales** (196 / 147 / 156), porque el 14 nov aporta 0 aperturas.

## 4. Distribución por estado final del nicho (913 expedientes)

| Estado final | Expedientes |
|---|---|
| PUB (abierto) | 196 |
| EV (en evaluación) | 208 |
| ADJ (adjudicado) | 126 |
| RES (resuelto/formalizado) | 378 |
| PRE (previo/anuncio previo) | 4 |
| ANUL (anulado) | 1 |

Solo el 21 % del nicho seguía abierto (PUB) al final de la ventana; el resto ya había avanzado. Las 196 aperturas son expedientes cuya primera PUB cae en la ventana, con independencia de su estado final.

## 5. Distribución por provincia y estimación por cliente

Provincia canónica derivada del código NUTS 3 del feed (islas canarias y baleares agrupadas en su provincia). **13 de las 147 aperturas de núcleo (9 %) no tienen provincia usable** (ámbito nacional: el feed trae `ESPAÑA` o equivalente); 17 de 196 en el nicho.

**Aperturas de núcleo por provincia (mes completo):**

| Provincia | Núcleo | Provincia | Núcleo |
|---|---|---|---|
| Madrid | 20 | Cádiz | 2 |
| *(sin provincia)* | *13* | Illes Balears | 2 |
| Alicante | 10 | Lleida | 2 |
| Barcelona | 8 | Toledo | 2 |
| Valladolid | 7 | Palencia | 2 |
| Sevilla | 7 | Córdoba | 2 |
| Murcia | 5 | Navarra | 2 |
| Santa Cruz de Tenerife | 4 | Bizkaia | 2 |
| Málaga | 4 | Tarragona, Salamanca, Teruel, Huelva, Las Palmas, Huesca, La Rioja, Cáceres, Álava, Guadalajara, Gipuzkoa, León | 1 c/u |
| Ciudad Real | 4 | | |
| Zaragoza | 4 | | |
| Granada | 4 | | |
| Valencia | 4 | | |
| A Coruña | 4 | | |
| Girona | 3 | | |
| Asturias | 3 | | |
| Burgos | 3 | | |
| Badajoz | 3 | | |
| Castellón | 3 | | |
| Pontevedra | 3 | | |
| Almería | 3 | | |

41 provincias con al menos 1 apertura de núcleo; **12 de 52 provincias con 0** (Albacete, Ávila, Cantabria, Cuenca, Jaén, Lugo, Ourense, Segovia, Soria, Zamora, Ceuta y Melilla; Soria y Lugo sí aparecen en el «amplio» con 1 cada una).

**Lo que vería un cliente de 3 provincias (nº/mes, no promesas):**

| Escenario | Núcleo/mes | Amplio/mes |
|---|---|---|
| Mejor caso: las 3 provincias con más aperturas (Madrid + Alicante + Barcelona) | **38** | 39 (Madrid + Alicante + Valladolid) |
| Cliente medio (media por provincia 2,8 × 3) | ~8–9 | ~9 |
| Cliente mediano (mediana provincial 2 × 3) | **~6** | ~6 |

La distribución está muy sesgada: Madrid concentra 20 de 147 (14 %), y 24 de las 52 provincias tienen 1 o 0 aperturas de núcleo al mes. Un cliente en 3 provincias medianas vería ~6 oportunidades de núcleo al mes — y varias semanas vacías. Con la cuota del plan (10 análisis/mes), el cuello de botella sigue siendo la escasez de oportunidades, no los análisis (Fase A §8.1). Además, el 9 % de aperturas sin provincia no llegaría a un cliente filtrado solo por provincia, salvo que el servicio las asigne por el lugar de ejecución (que el feed no da).

**Sede vs. ejecución (chequeo, Fase A §6.3):** 12 aperturas de núcleo mencionan en el título una provincia distinta de la del feed. Los casos claros: **5 de Paradores** (Baiona/Pontevedra, Bielsa/Huesca, Málaga, Granada y Salamanca — el feed dice Madrid, sede de Paradores, pero la obra es en el parador); 1 en Toledo con sede en Madrid; 1 en El Hierro con NUTS de Las Palmas; 1 canaria con mención a Las Palmas desde Tenerife; y 4 de ámbito nacional (Renfe, AEAT Murcia) cuyo título revela la provincia real (Madrid, Murcia, Tenerife). Es una cota inferior — el chequeo solo detecta provincias nombradas explícitamente en el título —, pero confirma el patrón de Fase A: **en órganos centralizados, la provincia del feed es la sede, no la ejecución**. Para un cliente por provincias, Paradores y organismos nacionales son sistemáticamente engañosos.

## 6. Importes de las aperturas

VE = valor estimado · PB s/IVA = presupuesto base sin IVA · PB c/IVA = presupuesto base con IVA. **Nunca mezclados.** Percentiles calculados con el parse corregido (ver §7.2).

**Núcleo (147 aperturas):**

| | n | p10 | p25 | Mediana | p75 | p90 | Mín–máx |
|---|---|---|---|---|---|---|---|
| VE | 146 | 16.364 € | 47.052 € | **113.171 €** | 266.679 € | 803.058 € | 0 – 14.138.800 € |
| PB s/IVA | 147 | 12.317 € | 40.000 € | **91.148 €** | 215.492 € | 538.820 € | 0 – 13.595.000 € |
| PB c/IVA | 118 | 9.680 € | 47.629 € | **91.591 €** | 251.680 € | 586.463 € | 0 – 16.449.950 € |

**Núcleo+limítrofe (156):** VE mediana 123.431 € (n=155, máx 42.091.753 € — Mos, ESCO); PB s/IVA mediana 95.540 € (n=156, máx 35.076.461 €); PB c/IVA mediana 94.841 € (n=124, máx 42.442.518 €).

**Nicho (196):** VE mediana 125.846 € (n=195, máx 44.294.455 € — ADIF, reclasificado a marginal); PB s/IVA mediana 100.000 € (n=196); PB c/IVA mediana 91.591 € (n=158).

Notas:

- PB c/IVA solo tiene n=118 de 147 en núcleo porque **el feed 1044 no trae `TotalAmount`** (29 aperturas de núcleo son de 1044).
- VE = 0 en 2 aperturas de núcleo (SERGAS `PcPG/2026/829388` y `PcPG/2026/829403` — VE ausente/0 en el feed, PB presente). PB s/IVA = 0 en 1 (mantenimiento de aire acondicionado del material rodante de Renfe).
- La mitad de las aperturas de núcleo está entre ~47.000 € y ~267.000 € de VE; el 10 % supera los 800.000 €. Es un nicho de contratos medianos, con una cola larga de grandes obras.
- La mediana de VE subió respecto a la preclasificación (107.035 €) porque la revisión sacó del núcleo los grandes contratos no-HVAC (ADIF 44,29 M€, Cetursa 24,33 M€ y Mos 42,09 M€ pasaron a marginal/limítrofe).

## 7. Coste real del pull e incidentes

### 7.1 Coste (corridas buenas)

| | Feed 643 | Feed 1044 | Total |
|---|---|---|---|
| Peticiones (páginas) | 129 | 56 | **185** |
| Bytes descargados | 1.953 MB | 286 MB | **2.239 MB** |
| Tiempo (reloj, con reanudaciones) | ~60 min (12:52–13:52) | ~10 min (12:53–13:03) | ~1 h |
| Reintentos en tramos finales | 0 | 0 | 0 |
| 429 observados | 0 | 0 | **0** |

Gran total descargado contando el intento fallido (§7.3.1): **≈ 8,3 GB**. Los contadores `errors` de `state.json` (643: 2 · 1044: 1) son heredados de paradas intencionales/errores previos, no errores de los tramos finales.

### 7.2 Bug de parseo de importes (encontrado y corregido)

El `parse_amt` original quitaba todos los puntos: inflaba ×100 los valores en formato decimal plano (`44294455.44` → 4.429.445.544). El feed mezcla formato español con coma (`42.884,99`) y decimal plano (`27249.6`, `44294455.44`); en este pull solo hay decimales planos (149.866 valores) y enteros (94.180), sin comas. Regla corregida por valor: coma → formato español; punto + 1–2 decimales → decimal plano; punto + grupos de 3 → miles; entero → tal cual. Validación con el ratio IVA (Total/Base): **91,1 % plausible (1,00/1,04/1,10/1,21) con la regla nueva frente a 57,9 % con la vieja**, sobre 62.921 registros con ambos importes (coherente con el 88 % de Fase A). Corregido en `scripts/aggregate_30d.py` y reagregado; todas las medianas y percentiles de este informe usan el parse correcto.

### 7.3 Incidentes durante el pull

1. **Bug de bucle en `pull_30d.py` (11:21–12:46):** la variable `url` no se reasignaba con el enlace `next`; descargó la primera página una y otra vez (643: 229×, 1044: 584×, **6.078 MB**). Evidencia archivada en `data/volume-30d/failed-run-2026-11-14-bug-loop/` (README + `pull_log.txt` de cada feed). Fix: `url = state['next_url']` al final de cada iteración + detección de ciclo + `--max-pages 400`.
2. **Relanzamiento vía `setsid nohup` (12:46–12:47, PIDs 10836/10866):** murió por **403 transitorio del proxy de salida** (`Tunnel connection failed: 403 Forbidden`) en todos los reintentos, sin completar ni una página. Sonda posterior: 200. Causa de la muerte de los procesos no determinada con certeza.
3. **Interferencia al archivar (12:48):** se movieron sin querer ficheros del relanzamiento ya en marcha; se restauró `stdout.log` a su sitio; el nuevo run recreó sus ficheros en append. No tocar los directorios `feed643/`/`feed1044/` mientras corran.
4. **Página 83 de 643: 5 timeouts seguidos (~11 min, 13:25–13:36)**, salida con error y estado guardado (82 páginas). Sonda posterior a la misma URL: 200, 14,1 MB en 13 s — transitorio, no fichero roto.
5. **SIGTERM al reanudado de 643 (~13:49:45, tras pág. 121, 60.373 entradas):** tercer proceso muerto sin explicación clara (sin OOM; VM con uptime 2h04 a las 12:52, sin reinicio). Se reanudó de nuevo y **completó 13:52:50** (129 págs).
6. **14 nov parcial:** el pull se hizo en sábado; el feed 643 no tenía entradas del 14 nov a las 13:52 (0 entradas) y el 1044 solo 21. No afecta a los totales (ver §3).

## 8. Veredicto y decisiones pendientes

**El pull de 30 días era el paso 1 de Fase A §8.2 («esto es lo primero; sin ello el resto es especulación»). Ya está hecho, con números reales:**

- **Nicho estricto (núcleo): 147 aperturas en 30 días.** El umbral «sí» de Fase A empezaba en 150. Queda **3 por debajo** — dentro del margen de error de la propia revisión manual (bastaría que 3 de los 5 genéricos «solo CPV» fuesen realmente HVAC, o que 3 limítrofes fuesen núcleo, para cruzar el umbral; y al revés).
- **Núcleo + limítrofe: 156.** Dentro de la banda 150–250.
- **Por cliente de 3 provincias:** mejor caso 38/mes (Madrid+Alicante+Barcelona); cliente mediano ~6/mes; cliente medio ~8–9/mes. El formato diario por cliente seguiría vacío la mayoría de los días; el semanal es el que encaja con este volumen.
- **Estacionalidad desconocida:** una ventana de oct–nov no dice nada de primavera ni de agosto/diciembre. Fase A ya advertía de ±50 %.

**Decisiones que quedan para Jon (no técnicas):**

1. **Posicionamiento:** ¿resumen semanal como producto principal + alertas diarias solo con novedad en sus provincias (opción 3 de §8.2)?
2. **Ampliación del nicho** a «instalaciones térmicas y eficiencia energética» (opción 2 de §8.2): los 9 limítrofes + los 40 marginales de este pull son la cantera medida — eficiencia energética, biomasa, servicios energéticos, mantenimiento integral y frío industrial/cámaras. Habría que medir el incremento con la regla ampliada antes de decidir.
3. **Territorio por cliente:** ¿más de 3 provincias por plan, o alertas nacionales de grandes contratos?
4. **Fuentes adyacentes** (TED, plataformas autonómicas, BOE): sin verificar; cada una necesita su propia prueba de acceso.

**No se cambia silenciosamente de mercado:** si el nicho no basta, se presentan estos números y decide Jon (Fase A §8.2.5).

## 9. Limitaciones

- **Ventana de 31 días naturales** (15 oct–14 nov), no exactamente 30; la ventana estricta de 30 días da los mismos totales porque el 14 nov aporta 0 aperturas. Un solo mes (otoño): sin estacionalidad.
- **Primera fecha PUB = primer PUB visto dentro de la ventana.** Un expediente publicado antes del 15 oct y republicado dentro no se distingue de una primera publicación; y un expediente PUB antes de la ventana que solo se actualiza (EV/ADJ) dentro no cuenta como apertura.
- **Provincia del feed no fiable en órganos centralizados** (§5): sede ≠ ejecución. 9 % de aperturas sin provincia usable.
- **1044 sin `TotalAmount`** (PB c/IVA incompleto) y sin nombre de provincia (solo NUTS; el mapa NUTS→nombre se derivó del propio feed 643, 107 códigos).
- **hacienda.gob.es / spec v1.3 / aviso legal siguen sin verificar** (inaccesible desde esta VM; no se intentó el ZIP). No se probó el ZIP mensual como vía alternativa.
- **La regla es la de Fase A, en español:** los títulos en catalán/gallego/vasco solo entran por CPV (ver §1.2). Es una decisión de comparabilidad, no un olvido.
- **Revisión manual = juicio sobre títulos y CPV**, sin leer pliegos. Los 5 genéricos «solo CPV» y los casos límite (extracción industrial, alquiler de generadores, filtros, torres de refrigeración) llevan ese grado de incertidumbre.

## 10. Entregables

En `~/workspace/licitaclima/`:

- `docs/volume-30d.md` — este informe.
- `data/volume-30d/niche_30d.json` — 913 expedientes de nicho (expediente, órgano, título, estado final, fechas, importes, provincia/NUTS, URL oficial, CPV, palabras clave, `preclass` y `clase_final` con `motivo_manual`).
- `data/volume-30d/daily_counts.csv` — serie diaria 15 oct–14 nov (nicho/núcleo/amplio/marginal + entradas por feed).
- `data/volume-30d/pages_inventory.csv` — inventario combinado, 185 páginas.
- `data/volume-30d/pull_log.txt` — log combinado de las corridas buenas (logs por feed en `feed643/` y `feed1044/`).
- `data/volume-30d/summary_30d.json` — resumen numérico completo (totales, revisión manual, provincias, importes con percentiles).
- `data/volume-30d/aperturas_review.txt` — las 196 aperturas con su preclasificación (base de la revisión manual).
- `data/volume-30d/feed643/` y `feed1044/` — `entries.jsonl.gz` (entradas crudas parseadas), `pages_inventory.csv`, `state.json`, `pull_log.txt`, `stdout.log` por feed.
- `data/volume-30d/failed-run-2026-11-14-bug-loop/` — evidencia del intento fallido por el bug de bucle.
- `scripts/pull_30d.py`, `scripts/aggregate_30d.py`, `scripts/finalize_30d.py` — scripts del pull, la agregación y la revisión final.
