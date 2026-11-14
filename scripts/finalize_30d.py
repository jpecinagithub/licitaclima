#!/usr/bin/env python3
"""LicitaClima — revisión manual final del pull de 30 días.

Aplica las correcciones manuales (título a título, leídas las 196
aperturas en data/volume-30d/aperturas_review.txt) sobre la
pre-clasificación por reglas, y recalcula: serie diaria final,
distribución por provincia (NUTS->nombre derivado del propio feed 643),
importes con percentiles, detección CPV-solo y chequeo sede-vs-ejecución.

Uso: python3 finalize_30d.py  (desde ~/workspace/licitaclima)
Reescribe niche_30d.json, daily_counts.csv y summary_30d.json.
"""
import csv, json, os, re, unicodedata
from collections import Counter, defaultdict
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
DATA = os.path.join(ROOT, 'data', 'volume-30d')

# (subcadena del título normalizado, clase final, motivo)
# clase: 'núcleo' | 'limítrofe' | 'marginal'
OVERRIDES = [
    ('prolongacion de andenes', 'marginal', 'ventilación de evacuación de incendios en túnel, no climatización de edificios'),
    ('mascarillas de ventilacion', 'marginal', 'mascarillas respiratorias (ventilación médica), falso positivo por palabra clave'),
    ('red de fontaneria y electricidad para el centro penitenciario de cordoba', 'marginal', 'fontanería+electricidad, sin climatización (CPV 50720000 no corroborado)'),
    ('instalacion de un ascensor en el edificio del centro social', 'marginal', 'instalación de ascensor; CPV 45331000 no corroborado por el título'),
    ('adquisicion de mobiliario y equipamiento tecnologico', 'marginal', 'mobiliario/equipamiento genérico; CPV 42512000 no corroborado'),
    ('suministro de electrodomesticos y cocina industrial', 'marginal', 'electrodomésticos/cocina; CPV 42500000 no corroborado'),
    ('suministro de equipos mecanicos', 'marginal', 'equipos mecánicos genéricos; CPV 42500000 no corroborado'),
    ('suministro de gas natural para los elementos de calefaccion', 'marginal', 'suministro de gas (combustible/energía), no instalación ni mantenimiento'),
    ('suministro de gas natural canalizado para agua caliente y calefaccion en el edificio sede', 'marginal', 'suministro de gas, no instalación ni mantenimiento'),
    ('suministro de gas natural canalizado para calefaccion en los centros dependientes de la direccion provincial del instituto nacional de la seguridad social de burgos', 'marginal', 'suministro de gas, no instalación ni mantenimiento'),
    ('suministro de gas natural canalizado para calefaccion en los edificios de la tgss en burgos', 'marginal', 'suministro de gas, no instalación ni mantenimiento'),
    ('desarrollo del itinerario formativo', 'marginal', 'curso de formación, no obra ni servicio de climatización'),
    ('mantenimiento de diversos sistemas e instalaciones del edificio de c/ hermanos otamendi', 'marginal', 'mantenimiento multisistema genérico, climatización solo una parte'),
    ('suministro de equipamiento nuevo para implantacion del 2o curso cgm', 'limítrofe', 'suministro de equipos de formación (no obra/servicio de climatización)'),
    ('homologacion de proveedores para la adquisicion de bienes y servicios corrientes', 'limítrofe', 'homologación/marco de proveedores, sin obra concreta'),
    ('subministro, servizo e obras con inversion baixo o modelo dexestion de servizos enerxeticos', 'limítrofe', 'modelo ESCO de servicios energéticos; climatización como parte'),
    ('obras de mejora de eficiencia en edificios municipales programa inversion regional', 'limítrofe', 'eficiencia energética; climatización como parte'),
    ('suministro e instalacion de caldera para calefaccion en almacen provisional', 'núcleo', 'suministro+instalación de caldera de calefacción (la regla falló por "mantenimiento integral" en el título)'),
    ('obra de reparacion de superficie de instalacion de las torres de refrigeracion', 'núcleo', 'reparación de torres de refrigeración (la regla falló por "mantenimiento integral")'),
    ('suministro, instalacion y puesta en marcha del equipamiento necesario para mejorar la ventilacion en dos salas del centro de hemoterapia', 'núcleo', 'mejora de ventilación (la regla falló por un CPV 09111400 no relacionado con el objeto)'),
    ('servicio de mantenimiento de la instalacion de energia solar que produce el agua caliente sanitaria', 'núcleo', 'mantenimiento de instalación solar térmica/ACS (instalación térmica)'),
    ('contratacion del servicio de mantenimiento integral e inspeccion de las instalaciones termicas en edificios e instalaciones municipales del ayuntamiento de amorebieta-etxano', 'núcleo', 'el objeto son las instalaciones térmicas en sí'),
    ('servicio de mantenimiento integral de las instalaciones termicas del esaum', 'núcleo', 'el objeto son las instalaciones térmicas en sí'),
    ('obra para el cambio de la instalacion termica de el centro de salud de betanzos', 'núcleo', 'renovación térmica completa (gasóleo sustituido por aerotermia + climatización); el gasóleo es lo que se elimina'),
]

# NUTS 3 -> provincia canónica (52 provincias; Canarias/Baleares: islas -> provincia)
def norm(s):
    s = unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()
    return re.sub(r'\s+', ' ', s).strip()


NUTS3_PROV = {
    'ES111': 'A Coruña', 'ES112': 'Lugo', 'ES113': 'Ourense', 'ES114': 'Pontevedra',
    'ES120': 'Asturias', 'ES130': 'Cantabria', 'ES211': 'Álava', 'ES212': 'Gipuzkoa',
    'ES213': 'Bizkaia', 'ES220': 'Navarra', 'ES230': 'La Rioja', 'ES241': 'Huesca',
    'ES242': 'Teruel', 'ES243': 'Zaragoza', 'ES300': 'Madrid', 'ES411': 'Ávila',
    'ES412': 'Burgos', 'ES413': 'León', 'ES414': 'Palencia', 'ES415': 'Salamanca',
    'ES416': 'Segovia', 'ES417': 'Soria', 'ES418': 'Valladolid', 'ES419': 'Zamora',
    'ES421': 'Albacete', 'ES422': 'Ciudad Real', 'ES423': 'Cuenca', 'ES424': 'Guadalajara',
    'ES425': 'Toledo', 'ES431': 'Badajoz', 'ES432': 'Cáceres', 'ES511': 'Barcelona',
    'ES512': 'Girona', 'ES513': 'Lleida', 'ES514': 'Tarragona', 'ES521': 'Alicante',
    'ES522': 'Castellón', 'ES523': 'Valencia', 'ES531': 'Illes Balears',
    'ES532': 'Illes Balears', 'ES533': 'Illes Balears', 'ES611': 'Almería',
    'ES612': 'Cádiz', 'ES613': 'Córdoba', 'ES614': 'Granada', 'ES615': 'Huelva',
    'ES616': 'Jaén', 'ES617': 'Málaga', 'ES618': 'Sevilla', 'ES620': 'Murcia',
    'ES630': 'Ceuta', 'ES640': 'Melilla', 'ES701': 'Las Palmas', 'ES702': 'Las Palmas',
    'ES703': 'Las Palmas', 'ES704': 'Santa Cruz de Tenerife',
    'ES705': 'Santa Cruz de Tenerife', 'ES706': 'Santa Cruz de Tenerife',
    'ES707': 'Santa Cruz de Tenerife',
}
# nombre del feed -> provincia canónica (cuando no hay NUTS usable)
PROV_NAME_CANON = {}
for _p in ['Álava', 'Albacete', 'Alicante', 'Almería', 'Ávila', 'Badajoz', 'Barcelona',
           'Burgos', 'Cáceres', 'Cádiz', 'Cantabria', 'Castellón', 'Ciudad Real',
           'Córdoba', 'Cuenca', 'Girona', 'Granada', 'Guadalajara', 'Gipuzkoa',
           'Huelva', 'Huesca', 'Jaén', 'León', 'Lleida', 'La Rioja', 'Lugo', 'Madrid',
           'Málaga', 'Murcia', 'Navarra', 'Ourense', 'Asturias', 'Palencia',
           'Pontevedra', 'Salamanca', 'Segovia', 'Sevilla', 'Soria', 'Tarragona',
           'Teruel', 'Toledo', 'Valencia', 'Valladolid', 'Bizkaia', 'Zamora',
           'Zaragoza', 'Ceuta', 'Melilla', 'Gran Canaria', 'Tenerife', 'Mallorca',
           'Menorca', 'Ibiza', 'Fuerteventura', 'Lanzarote', 'La Palma', 'La Gomera',
           'El Hierro']:
    PROV_NAME_CANON[norm(_p)] = _p
PROV_NAME_CANON.update({'gran canaria': 'Las Palmas', 'tenerife': 'Santa Cruz de Tenerife',
                        'mallorca': 'Illes Balears', 'menorca': 'Illes Balears',
                        'ibiza': 'Illes Balears', 'fuerteventura': 'Las Palmas',
                        'lanzarote': 'Las Palmas', 'la palma': 'Santa Cruz de Tenerife',
                        'la gomera': 'Santa Cruz de Tenerife', 'el hierro': 'Santa Cruz de Tenerife',
                        'illes balears': 'Illes Balears', 'balears': 'Illes Balears',
                        'a coruna': 'A Coruña', 'coruna': 'A Coruña'})

PROVINCIAS = ['Alava', 'Albacete', 'Alicante', 'Almeria', 'Avila', 'Badajoz',
              'Balears', 'Barcelona', 'Burgos', 'Caceres', 'Cadiz', 'Cantabria',
              'Castellon', 'Ciudad Real', 'Cordoba', 'Coruña', 'Cuenca',
              'Girona', 'Granada', 'Guadalajara', 'Gipuzkoa', 'Huelva', 'Huesca',
              'Jaen', 'Leon', 'Lleida', 'Rioja', 'Lugo', 'Madrid', 'Malaga',
              'Murcia', 'Navarra', 'Ourense', 'Asturias', 'Palencia',
              'Palmas', 'Pontevedra', 'Salamanca', 'Tenerife', 'Segovia',
              'Sevilla', 'Soria', 'Tarragona', 'Teruel', 'Toledo', 'Valencia',
              'Valladolid', 'Bizkaia', 'Zamora', 'Zaragoza', 'Ceuta', 'Melilla',
              'Hierro', 'Gomera', 'Fuerteventura', 'Lanzarote', 'Menorca',
              'Mallorca', 'Ibiza', 'Formentera']


def parse_amt(s):
    if not s:
        return None
    s = s.strip()
    try:
        if ',' in s:
            return Decimal(s.replace('.', '').replace(',', '.'))
        if re.fullmatch(r'\d+\.\d{1,2}', s):
            return Decimal(s)
        if re.fullmatch(r'\d{1,3}(\.\d{3})+', s):
            return Decimal(s.replace('.', ''))
        return Decimal(s)
    except InvalidOperation:
        return None


def pct(vals, p):
    vals = sorted(vals)
    if not vals:
        return None
    return vals[min(len(vals) - 1, int(p * (len(vals) - 1)))]


def main():
    niche = json.load(open(os.path.join(DATA, 'niche_30d.json'), encoding='utf-8'))
    apertures = [n for n in niche if n['first_pub']]
    # --- aplicar overrides (cada uno debe casar con exactamente 1 apertura) ---
    applied = []
    for sub, cls, why in OVERRIDES:
        hits = [n for n in apertures if sub in norm(n['title'])]
        assert len(hits) == 1, f'override "{sub[:40]}" casa con {len(hits)} aperturas'
        n = hits[0]
        n['clase_final'] = cls
        n['motivo_manual'] = why
        n['preclass_previa'] = n['preclass']
        applied.append((n['expediente'], n['preclass'], cls))
    for n in niche:
        n.setdefault('clase_final', n['preclass'])
        n.setdefault('motivo_manual', '')
        n.setdefault('preclass_previa', n['preclass'])
    changes = [(e, a, b) for e, a, b in applied if a != b]
    print(f'overrides aplicados: {len(applied)} ({len(changes)} cambian la clase)')
    for e, a, b in changes:
        print(f'  {e}: {a} -> {b}')

    # --- mapa NUTS -> nombre de provincia (del propio feed: 643 trae nombre en ~92%) ---
    import gzip
    nuts_name = {}
    for feed in ('feed643', 'feed1044'):
        with gzip.open(os.path.join(DATA, feed, 'entries.jsonl.gz'), 'rt', encoding='utf-8') as fh:
            for line in fh:
                e = json.loads(line)
                if e.get('nuts') and e.get('prov'):
                    nuts_name.setdefault(e['nuts'], e['prov'])
    print(f'NUTS con nombre derivado del feed: {len(nuts_name)}')

    def provincia(n):
        # 1) NUTS 3 (5 caracteres) -> provincia canónica
        if n['nuts'] and n['nuts'] in NUTS3_PROV:
            return NUTS3_PROV[n['nuts']]
        # 2) nombre del feed -> canónica (islas -> provincia)
        if n['prov'] and norm(n['prov']) in PROV_NAME_CANON:
            return PROV_NAME_CANON[norm(n['prov'])]
        # 3) sin provincia usable (ámbito nacional/regional, p. ej. 'ESPAÑA')
        return '(sin provincia)'

    for n in niche:
        n['provincia'] = provincia(n)

    core = [n for n in apertures if n['clase_final'] == 'núcleo']
    amplio = [n for n in apertures if n['clase_final'] in ('núcleo', 'limítrofe')]
    marg = [n for n in apertures if n['clase_final'] == 'marginal']
    print(f"\nFINAL aperturas: nicho={len(apertures)} núcleo={len(core)} "
          f"núcleo+limítrofe={len(amplio)} marginales={len(marg)}")
    print('  por estado final nicho:', dict(Counter(n['status_final'] for n in niche)))

    # --- serie diaria final ---
    days = []
    d = date(2026, 10, 15)
    while d <= date(2026, 11, 14):
        days.append(d)
        d += timedelta(days=1)
    import csv as _csv
    old = {r['date']: r for r in _csv.DictReader(open(os.path.join(DATA, 'daily_counts.csv'), encoding='utf-8'))}
    with open(os.path.join(DATA, 'daily_counts.csv'), 'w', newline='', encoding='utf-8') as f:
        w = _csv.writer(f)
        w.writerow(['date', 'weekday', 'aperturas_nicho', 'aperturas_nucleo',
                    'aperturas_nucleo_amplio', 'aperturas_marginales',
                    'entries_643', 'entries_1044'])
        for day in days:
            iso = day.isoformat()
            ap = [n for n in apertures if n['first_pub'][:10] == iso]
            w.writerow([iso, day.strftime('%a'), len(ap),
                        sum(1 for n in ap if n['clase_final'] == 'núcleo'),
                        sum(1 for n in ap if n['clase_final'] in ('núcleo', 'limítrofe')),
                        sum(1 for n in ap if n['clase_final'] == 'marginal'),
                        old[iso]['entries_643'], old[iso]['entries_1044']])
    wd = [d for d in days if d.weekday() < 5]
    n_wd = len(wd)
    print(f"  media/día natural (31 días): nicho {len(apertures)/31:.2f} | núcleo {len(core)/31:.2f} | amplio {len(amplio)/31:.2f}")
    print(f"  media/día laborable ({n_wd} días): nicho {len(apertures)/n_wd:.2f} | núcleo {len(core)/n_wd:.2f} | amplio {len(amplio)/n_wd:.2f}")
    print(f"  días con 0 aperturas de nicho: {sum(1 for day in days if not [n for n in apertures if n['first_pub'][:10]==day.isoformat()])} "
          f"(todos sábados/domingos + 14 nov parcial)")

    # --- provincias ---
    def prov_table(subset, label):
        c = Counter(n['provincia'] for n in subset)
        print(f'\n{label} por provincia (top 15):')
        for p, v in c.most_common(15):
            print(f'  {p}: {v}')
        print(f'  provincias distintas: {len(c)} | sin provincia: {c.get("(sin provincia)", 0)}')
        return c
    c_core = prov_table(core, 'NÚCLEO')
    c_amp = prov_table(amplio, 'NÚCLEO+LIMÍTROFE')
    # cliente típico: top-3 y mediana provincial (52 provincias + sin-provincia aparte)
    top3 = sum(v for p, v in c_core.most_common() if p != '(sin provincia)') if False else \
        sum(v for p, v in sorted(((p, v) for p, v in c_core.items() if p != '(sin provincia)'),
                                 key=lambda kv: -kv[1])[:3])
    top3a = sum(v for p, v in sorted(((p, v) for p, v in c_amp.items() if p != '(sin provincia)'),
                                     key=lambda kv: -kv[1])[:3])
    print(f'  top-3 provincias reales: {sorted(((p, v) for p, v in c_core.items() if p != "(sin provincia)"), key=lambda kv: -kv[1])[:3]}')
    print(f'  top-3 provincias reales (amplio): {sorted(((p, v) for p, v in c_amp.items() if p != "(sin provincia)"), key=lambda kv: -kv[1])[:3]}')
    all_prov = ['Álava', 'Albacete', 'Alicante', 'Almería', 'Ávila', 'Badajoz',
                'Illes Balears', 'Barcelona', 'Burgos', 'Cáceres', 'Cádiz', 'Cantabria',
                'Castellón', 'Ciudad Real', 'Córdoba', 'A Coruña', 'Cuenca',
                'Girona', 'Granada', 'Guadalajara', 'Gipuzkoa', 'Huelva', 'Huesca',
                'Jaén', 'León', 'Lleida', 'La Rioja', 'Lugo', 'Madrid', 'Málaga',
                'Murcia', 'Navarra', 'Ourense', 'Asturias', 'Palencia', 'Las Palmas',
                'Pontevedra', 'Salamanca', 'Santa Cruz de Tenerife', 'Segovia',
                'Sevilla', 'Soria', 'Tarragona', 'Teruel', 'Toledo', 'Valencia',
                'Valladolid', 'Bizkaia', 'Zamora', 'Zaragoza', 'Ceuta', 'Melilla']
    print(f'\n  top-3 provincias (núcleo): {top3}/mes | (amplio): {top3a}/mes')
    med = sorted([c_core.get(p, 0) for p in all_prov])
    meda = sorted([c_amp.get(p, 0) for p in all_prov])
    print(f'  mediana provincial (52 prov., núcleo): {med[len(med)//2]} | (amplio): {meda[len(meda)//2]}')
    print(f'  provincias con 0 aperturas de núcleo: {sum(1 for p in all_prov if c_core.get(p, 0)==0)} de 52')

    # --- CPV-solo en núcleo + chequeo sede vs ejecución ---
    cpv_only = [n for n in core if not n['keywords']]
    print(f'\n  núcleo detectado SOLO por CPV (sin palabra clave en título): {len(cpv_only)} de {len(core)}')
    sede_flag = []
    for n in core:
        t = norm(n['title'])
        mentioned = [p for p in PROVINCIAS if norm(p) in t]
        feed_prov = norm(n['provincia'])
        # exclusiones de falsos positivos conocidos:
        # - 'León' dentro de 'Castilla y León' (nombre de comunidad, no provincia de ejecución)
        # - 'Palmas' cuando la provincia del feed es Las Palmas (Gran Canaria etc.)
        mentioned = [p for p in mentioned
                     if not (norm(p) == 'leon' and 'castilla y leon' in t)
                     and not (norm(p) == 'palmas' and feed_prov == 'las palmas')
                     and not (norm(p) in ('mallorca', 'menorca', 'ibiza', 'formentera')
                              and feed_prov == 'illes balears')
                     and not (norm(p) in ('tenerife', 'palma', 'gomera', 'hierro')
                              and feed_prov == 'santa cruz de tenerife')
                     and not (norm(p) in ('gran canaria', 'lanzarote', 'fuerteventura')
                              and feed_prov == 'las palmas')]
        others = [p for p in mentioned if norm(p) not in feed_prov and feed_prov not in norm(p)]
        if others:
            sede_flag.append((n['title'][:80], n['provincia'], others))
    print(f'  aperturas núcleo con provincia en título distinta a la del feed (sospecha sede): {len(sede_flag)}')
    for t, p, o in sede_flag:
        print(f'    feed={p} título menciona {o}: {t}')

    # --- importes finales ---
    def stats(subset, key):
        vals = [parse_amt(n[key]) for n in subset]
        vals = [v for v in vals if v is not None]
        if not vals:
            return {'n': 0}
        return {'n': len(vals), 'p10': str(pct(vals, .1)), 'p25': str(pct(vals, .25)),
                'mediana': str(pct(vals, .5)), 'p75': str(pct(vals, .75)),
                'p90': str(pct(vals, .9)), 'min': str(min(vals)), 'max': str(max(vals))}

    summary = json.load(open(os.path.join(DATA, 'summary_30d.json'), encoding='utf-8'))
    summary['revision_manual'] = {
        'overrides_aplicados': len(applied), 'cambios_de_clase': len(changes),
        'aperturas_nicho': len(apertures), 'aperturas_nucleo_final': len(core),
        'aperturas_nucleo_amplio_final': len(amplio), 'aperturas_marginales_final': len(marg),
        'nucleo_solo_cpv': len(cpv_only),
        'sospecha_sede_vs_ejecucion': len(sede_flag),
        'top3_provincias_nucleo_mes': top3,
        'top3_provincias_amplio_mes': top3a,
        'mediana_provincial_nucleo_mes': med[len(med) // 2],
        'mediana_provincial_amplio_mes': meda[len(meda) // 2],
        'distribucion_provincias_nucleo': dict(c_core),
        'distribucion_provincias_amplio': dict(c_amp),
        'importes_nucleo_final': {k: stats(core, k) for k in ('amt_est', 'amt_taxexcl', 'amt_total')},
        'importes_amplio_final': {k: stats(amplio, k) for k in ('amt_est', 'amt_taxexcl', 'amt_total')},
        'importes_nicho_final': {k: stats(apertures, k) for k in ('amt_est', 'amt_taxexcl', 'amt_total')},
        'media_dia_natural_31d': {'nicho': round(len(apertures) / 31, 2),
                                  'nucleo': round(len(core) / 31, 2),
                                  'amplio': round(len(amplio) / 31, 2)},
        'media_dia_laborable_22d': {'nicho': round(len(apertures) / 22, 2),
                                    'nucleo': round(len(core) / 22, 2),
                                    'amplio': round(len(amplio) / 22, 2)},
        'dias_laborables': 22, 'dias_fin_semana': 9,
        'sin_provincia_nucleo': sum(1 for n in core if n['provincia'] == '(sin provincia)'),
        'sin_provincia_amplio': sum(1 for n in amplio if n['provincia'] == '(sin provincia)'),
        'sin_provincia_nicho': sum(1 for n in apertures if n['provincia'] == '(sin provincia)'),
    }
    # ventana estricta 30 días (15 oct-13 nov): 14 nov aporta 0 aperturas
    ap30 = [n for n in apertures if n['first_pub'][:10] <= '2026-11-13']
    summary['ventana_estricta_30d_15oct_13nov'] = {
        'nicho': len(ap30),
        'nucleo': sum(1 for n in ap30 if n['clase_final'] == 'núcleo'),
        'amplio': sum(1 for n in ap30 if n['clase_final'] in ('núcleo', 'limítrofe')),
    }
    json.dump(summary, open(os.path.join(DATA, 'summary_30d.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    json.dump(sorted(niche, key=lambda n: (n['first_pub'] or '9999', n['title'])),
              open(os.path.join(DATA, 'niche_30d.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print('\nactualizados: niche_30d.json, daily_counts.csv, summary_30d.json')


if __name__ == '__main__':
    main()
