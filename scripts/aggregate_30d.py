#!/usr/bin/env python3
"""LicitaClima — agregación del pull de 30 días (2026-10-15 -> 2026-11-14).

Lee data/volume-30d/feed643/entries.jsonl.gz y feed1044/entries.jsonl.gz,
deduplica por <id> Atom (quedándose con el <updated> mayor) y por
(expediente, órgano), clasifica el nicho con la regla EXACTA de Fase A
(5 CPV + 9 palabras clave) y emite:
  - niche_30d.json (expedientes únicos del nicho, con pre-clasificación
    núcleo/limítrofe/marginal por reglas + campos para revisión manual)
  - daily_counts.csv (serie diaria de aperturas y volumen de feed)
  - summary_30d.json (todos los agregados)
Uso: python3 aggregate_30d.py  (desde ~/workspace/licitaclima)
"""
import csv, gzip, json, os, re, unicodedata
from collections import Counter, defaultdict
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation

BASE = os.path.dirname(os.path.abspath(__file__))  # scripts/
ROOT = os.path.dirname(BASE)
DATA = os.path.join(ROOT, 'data', 'volume-30d')
CUTOFF = datetime(2026, 10, 15, 0, 0, tzinfo=timezone(timedelta(hours=2)))
END = datetime(2026, 11, 15, 0, 0, tzinfo=timezone(timedelta(hours=1)))

KEYWORDS = ['climatizacion', 'hvac', 'aire acondicionado', 'ventilacion',
            'calefaccion', 'refrigeracion', 'bomba de calor', 'climatizador',
            'climatizar']
CPV_NICHE = {'45331000', '42512000', '42500000', '50730000', '50720000'}


def norm(s):
    return unicodedata.normalize('NFKD', s or '').encode('ascii', 'ignore').decode().lower()


def parse_dt(s):
    try:
        return datetime.fromisoformat(s.replace('Z', '+00:00'))
    except Exception:
        return None


def parse_amt(s):
    """Importes del feed: el XML mezcla formato español ('42.884,99') y
    decimal plano ('44294455.44', '27249.6', '179416'). Regla por valor:
    con coma -> español; con punto + 1-2 decimales -> decimal plano;
    punto + grupos de 3 -> miles; entero -> tal cual.
    Validado: ratio Total/Base s/IVA plausible (1,00/1,04/1,10/1,21) en el
    91,1% de 62.921 registros con ambos importes (vs 57,9% con la regla
    vieja de quitar todos los puntos, que inflaba x100 los decimales)."""
    import re
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


def kwmatch(title):
    t = norm(title)
    return [k for k in KEYWORDS if k in t]


# --- pre-clasificación núcleo / limítrofe / marginal (reglas Fase A §6.4) ---
def preclass(title, cpvs):
    t = norm(title)
    c = set(cpvs)
    # marginales: combustible, biomasa, mantenimiento integral genérico
    if ('gasoleo' in t or 'gasoil' in t or 'combustible' in t
            or c & {'09134000', '09134100', '09134200', '09133000'}):
        return 'marginal', 'combustible/gasóleo'
    if ('biomasa' in t or 'pellet' in t or 'astilla' in t or 'lena' in t
            or '09111400' in c):
        return 'marginal', 'biomasa/leña'
    if ('mantenimiento integral' in t or 'gestion integral' in t
            or 'gestión integral' in t or 'mantenimiento de edificios' in t
            or 'facility' in t or '79993000' in c or '50700000' in c) \
            and 'climatizacion' not in t:
        return 'marginal', 'mantenimiento/gestión integral genérica (climatización no es el objeto principal)'
    # limítrofes: frío industrial/cámaras, eficiencia energética con climatización como parte
    if ('camara frigorifica' in t or 'cámara frigorífica' in t or 'camara fria' in t
            or 'cuarto frio' in t or 'frio industrial' in t or 'frío industrial' in t):
        return 'limítrofe', 'frío industrial / cámaras'
    if ('eficiencia energetica' in t or 'mejora energetica' in t
            or 'rehabilitacion energetica' in t or 'ahorro energetico' in t):
        return 'limítrofe', 'eficiencia energética (climatización como parte)'
    return 'núcleo', ''


def main():
    # ---- carga + dedupe por <id> (mayor updated) ----
    by_id = {}
    rows_total = 0
    per_feed_rows = Counter()
    per_feed_ids = Counter()
    daily_feed = Counter()  # (feed, date) -> entries (rows, antes de dedupe)
    for feed in ('643', '1044'):
        with gzip.open(os.path.join(DATA, f'feed{feed}', 'entries.jsonl.gz'),
                       'rt', encoding='utf-8') as fh:
            for line in fh:
                e = json.loads(line)
                rows_total += 1
                per_feed_rows[feed] += 1
                u = parse_dt(e['updated'])
                if u:
                    daily_feed[(feed, u.date().isoformat())] += 1
                prev = by_id.get(e['id'])
                if prev is None or (u and parse_dt(prev['updated']) and u > parse_dt(prev['updated'])):
                    by_id[e['id']] = e
    for e in by_id.values():
        per_feed_ids[e['feed']] += 1
    print(f'filas leídas: {rows_total} | ids distintos: {len(by_id)} '
          f'(643: {per_feed_ids["643"]}, 1044: {per_feed_ids["1044"]})')

    # ---- dedupe por (expediente, órgano) ----
    exps = {}
    for e in by_id.values():
        k = (norm(e['expediente']), norm(e['org']))
        rec = exps.get(k)
        u = parse_dt(e['updated'])
        if rec is None:
            exps[k] = {'key': k, 'expediente': e['expediente'], 'org': e['org'],
                       'title': e['title'], 'link': e['link'], 'feeds': set(),
                       'entries': [], 'cpv': set(), 'status_first': {},
                       'first_pub': None, 'last_updated': None, 'last_status': None,
                       'prov': '', 'nuts': '', 'deadline': '', 'deadline_time': '',
                       'amt_est': '', 'amt_taxexcl': '', 'amt_total': '',
                       'n_doc_uris': 0, 'n_lots': 0}
            rec = exps[k]
        rec['feeds'].add(e['feed'])
        rec['entries'].append(e)
        rec['cpv'] |= set(e['cpv'])
        if u and (rec['last_updated'] is None or u > rec['last_updated']):
            rec['last_updated'] = u
            rec['last_status'] = e['status']
            rec['title'] = e['title']
            rec['link'] = e['link']
            rec['prov'] = e['prov']
            rec['nuts'] = e['nuts']
            rec['deadline'] = e['deadline']
            rec['deadline_time'] = e['deadline_time']
            rec['amt_est'] = e['amt_est']
            rec['amt_taxexcl'] = e['amt_taxexcl']
            rec['amt_total'] = e['amt_total']
            rec['n_doc_uris'] = e['n_doc_uris']
            rec['n_lots'] = e['n_lots']
        if e['status'] == 'PUB' and u:
            if rec['first_pub'] is None or u < rec['first_pub']:
                rec['first_pub'] = u
    print(f'expedientes únicos (expediente+órgano): {len(exps)}')

    # solapes inter-feed
    keys643 = {(norm(e['expediente']), norm(e['org'])) for e in by_id.values() if e['feed'] == '643'}
    keys1044 = {(norm(e['expediente']), norm(e['org'])) for e in by_id.values() if e['feed'] == '1044'}
    print(f'expedientes 643: {len(keys643)} | 1044: {len(keys1044)} | solape: {len(keys643 & keys1044)}')

    # ---- nicho (regla Fase A) ----
    niche = []
    for rec in exps.values():
        kws = kwmatch(rec['title'])
        cpv_hit = sorted(set(rec['cpv']) & CPV_NICHE)
        if kws or cpv_hit:
            cls, why = preclass(rec['title'], rec['cpv'])
            niche.append({
                'expediente': rec['expediente'], 'org': rec['org'],
                'title': rec['title'], 'link': rec['link'],
                'feeds': sorted(rec['feeds']),
                'status_final': rec['last_status'],
                'first_pub': rec['first_pub'].isoformat() if rec['first_pub'] else None,
                'last_updated': rec['last_updated'].isoformat() if rec['last_updated'] else None,
                'deadline': rec['deadline'], 'deadline_time': rec['deadline_time'],
                'prov': rec['prov'], 'nuts': rec['nuts'],
                'amt_est': rec['amt_est'], 'amt_taxexcl': rec['amt_taxexcl'],
                'amt_total': rec['amt_total'],
                'cpv': sorted(rec['cpv']), 'cpv_niche': cpv_hit,
                'keywords': kws, 'n_entries': len(rec['entries']),
                'n_doc_uris': rec['n_doc_uris'], 'n_lots': rec['n_lots'],
                'preclass': cls, 'preclass_motivo': why,
            })
    print(f'nicho único: {len(niche)}')
    print('  por estado final:', dict(Counter(n['status_final'] for n in niche)))
    print('  por feed:', dict(Counter(tuple(n['feeds']) for n in niche)))
    print('  preclass:', dict(Counter(n['preclass'] for n in niche)))

    apertures = [n for n in niche if n['first_pub']]
    print(f'aperturas PUB en ventana: {len(apertures)}')
    print('  preclass aperturas:', dict(Counter(n['preclass'] for n in apertures)))

    # ---- serie diaria de aperturas ----
    days = []
    d = date(2026, 10, 15)
    while d <= date(2026, 11, 14):
        days.append(d)
        d += timedelta(days=1)
    daily = {}
    for day in days:
        ap = [n for n in apertures if n['first_pub'][:10] == day.isoformat()]
        daily[day.isoformat()] = {
            'date': day.isoformat(), 'weekday': day.strftime('%a'),
            'aperturas_nicho': len(ap),
            'aperturas_nucleo': sum(1 for n in ap if n['preclass'] == 'núcleo'),
            'aperturas_nucleo_amplio': sum(1 for n in ap if n['preclass'] in ('núcleo', 'limítrofe')),
            'aperturas_marginales': sum(1 for n in ap if n['preclass'] == 'marginal'),
            'entries_643': daily_feed.get(('643', day.isoformat()), 0),
            'entries_1044': daily_feed.get(('1044', day.isoformat()), 0),
        }
    with open(os.path.join(DATA, 'daily_counts.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=list(next(iter(daily.values())).keys()))
        w.writeheader()
        for day in days:
            w.writerow(daily[day.isoformat()])

    # ---- importes de aperturas ----
    def stats(vals):
        vals = sorted(vals)
        if not vals:
            return {'n': 0, 'mediana': None, 'min': None, 'max': None}
        m = len(vals)
        med = vals[m // 2] if m % 2 else (vals[m // 2 - 1] + vals[m // 2]) / 2
        return {'n': m, 'mediana': str(med), 'min': str(vals[0]), 'max': str(vals[-1])}

    def amt_stats(subset):
        return {
            'valor_estimado': stats([parse_amt(n['amt_est']) for n in subset if parse_amt(n['amt_est']) is not None]),
            'ppto_base_sin_iva': stats([parse_amt(n['amt_taxexcl']) for n in subset if parse_amt(n['amt_taxexcl']) is not None]),
            'ppto_base_con_iva': stats([parse_amt(n['amt_total']) for n in subset if parse_amt(n['amt_total']) is not None]),
        }

    core_ap = [n for n in apertures if n['preclass'] == 'núcleo']
    core_amp_ap = [n for n in apertures if n['preclass'] in ('núcleo', 'limítrofe')]

    summary = {
        'ventana': '2026-10-15 -> 2026-11-14 (31 días naturales, ambos incluidos)',
        'filas_descargadas': rows_total,
        'filas_por_feed': dict(per_feed_rows),
        'ids_distintos': len(by_id),
        'expedientes_unicos': len(exps),
        'expedientes_por_feed': {'643': len(keys643), '1044': len(keys1044)},
        'solape_inter_feed': len(keys643 & keys1044),
        'nicho_unico': len(niche),
        'nicho_por_estado_final': dict(Counter(n['status_final'] for n in niche)),
        'nicho_preclass': dict(Counter(n['preclass'] for n in niche)),
        'aperturas_nicho': len(apertures),
        'aperturas_nucleo': len(core_ap),
        'aperturas_nucleo_amplio': len(core_amp_ap),
        'aperturas_marginales': len(apertures) - len(core_amp_ap),
        'aperturas_por_feed': {','.join(k): v for k, v in Counter(tuple(n['feeds']) for n in apertures).items()},
        'importes_aperturas_nicho': amt_stats(apertures),
        'importes_aperturas_nucleo': amt_stats(core_ap),
        'importes_aperturas_nucleo_amplio': amt_stats(core_amp_ap),
        'daily': daily,
    }
    json.dump(summary, open(os.path.join(DATA, 'summary_30d.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    json.dump(sorted(niche, key=lambda n: (n['first_pub'] or '9999', n['title'])),
              open(os.path.join(DATA, 'niche_30d.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    # lista de aperturas para revisión manual
    with open(os.path.join(DATA, 'aperturas_review.txt'), 'w', encoding='utf-8') as f:
        for n in sorted(apertures, key=lambda x: x['first_pub'] or ''):
            f.write(f"[{n['first_pub'][:10]}] {n['preclass']:9} | {n['title']} | org={n['org'][:60]} | "
                    f"exp={n['expediente']} | VE={n['amt_est']} PBsIVA={n['amt_taxexcl']} | "
                    f"prov={n['prov'] or n['nuts'] or '?'} | cpv_nicho={n['cpv_niche']} kw={n['keywords']} | "
                    f"motivo={n['preclass_motivo']}\n")
    print('escrito: niche_30d.json, daily_counts.csv, summary_30d.json, aperturas_review.txt')


if __name__ == '__main__':
    main()
