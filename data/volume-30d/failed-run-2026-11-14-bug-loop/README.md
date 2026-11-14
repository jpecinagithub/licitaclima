# Intento fallido 2026-11-14 11:21–12:46 — bug de bucle en pull_30d.py

La variable `url` del bucle no se reasignaba con el enlace `next` de cada
página: el script descargó la primera página una y otra vez (643: 229×,
1044: 584×; 6.078 MB en total) hasta que ambos procesos se detuvieron a la
vez (~84 min, sin llegar al corte 2026-10-15). Los JSONL resultantes solo
contenían 504 (643) y 399 (1044) IDs distintos — es decir, nada nuevo
respecto a la Fase A — y se borraron; se conservan inventario, estado y log
como evidencia.

Fix aplicado: `url = state['next_url']` al final de cada iteración +
detección de ciclo (URL ya visitada → parada con error) + `--max-pages`.
Paginación verificada manualmente antes de relanzar: pág. 2 de 643 cubre
12:55–14:03 del 13 nov (498 entradas, IDs distintos de pág. 1); pág. 2 de
1044 cubre 00:25–13:41 del 13 nov (500 entradas).

## Nota sobre el archivo (2026-11-14 12:48)

El intento fallido se detuvo a las ~12:46 sin llegar al corte; su log
(pull_log.txt: 234 líneas en 643, 589 en 1044) se conserva aquí. Su
state.json y pages_inventory.csv originales ya no están: el relanzamiento
posterior los reseteó. El JSONL del intento fallido solo contenía 504/399
IDs distintos (nada nuevo sobre la Fase A) y se borró.
