#!/usr/bin/env python3
"""LicitaClima — pull de 30 días (2026-10-15 -> 2026-11-14) de un feed Atom PLACSP.

Descarga cada página en memoria, la parsea con xml.etree y la descarta:
nunca se escribe XML a disco. Solo se persisten agregados mínimos
(JSONL gzip por entrada + inventario de páginas + estado de reanudación).

Uso:
  python3 pull_30d.py --feed 643 --outdir data/volume-30d/feed643
  python3 pull_30d.py --feed 1044 --outdir data/volume-30d/feed1044
Reanudable: si se interrumpe, vuelve a ejecutarse con los mismos argumentos
y continúa desde la siguiente página registrada en state.json.
"""
import argparse, csv, gzip, json, os, random, re, sys, time, unicodedata
import urllib.request, urllib.error
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
ATOM = '{http://www.w3.org/2005/Atom}'
CUTOFF = datetime(2026, 10, 15, 0, 0, tzinfo=timezone(timedelta(hours=2)))  # CEST aún vigente
FEED_URLS = {
    '643': 'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom',
    '1044': 'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_1044/PlataformasAgregadasSinMenores.atom',
}


def log(outdir, msg):
    line = f"{datetime.now(timezone.utc).isoformat()} {msg}"
    print(line, flush=True)
    with open(os.path.join(outdir, 'pull_log.txt'), 'a', encoding='utf-8') as f:
        f.write(line + '\n')


def L(t):
    return t.split('}')[-1]


def find_all(el, name):
    return [e for e in el.iter() if L(e.tag) == name]


def find1(el, name):
    for e in el.iter():
        if L(e.tag) == name:
            return e
    return None


def txt(el):
    return (el.text or '').strip() if el is not None else ''


def parse_dt(s):
    try:
        return datetime.fromisoformat(s.replace('Z', '+00:00'))
    except Exception:
        return None


def parse_amount(s):
    """'1.980.940,96' -> Decimal; '' -> None."""
    if not s:
        return None
    try:
        return Decimal(s.replace('.', '').replace(',', '.'))
    except InvalidOperation:
        return None


def fetch(url, outdir, max_attempts=5):
    """GET con UA real, reintentos con backoff+jitter. Devuelve (bytes, headers, n_retries)."""
    last_err = None
    retries = 0
    for attempt in range(1, max_attempts + 1):
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': UA,
                'Accept': 'application/atom+xml,application/xml;q=0.9,*/*;q=0.8',
            })
            with urllib.request.urlopen(req, timeout=90) as r:
                body = r.read()
                if not body.lstrip()[:200].lower().startswith((b'<?xml', b'<feed')):
                    raise ValueError('respuesta no-XML (posible WAF): ' + body[:120].decode('utf-8', 'replace'))
                return body, dict(r.headers), retries
        except (urllib.error.HTTPError, urllib.error.URLError, ValueError, TimeoutError) as e:
            last_err = e
            code = getattr(e, 'code', None)
            if code not in (None, 429, 500, 502, 503, 504) and not isinstance(e, ValueError):
                raise
            retries = attempt
            wait = min(120, (2 ** attempt) * 5) + random.uniform(0, 5)
            log(outdir, f'  intento {attempt} fallido ({e}); reintento en {wait:.0f}s')
            time.sleep(wait)
    raise RuntimeError(f'fetch fallido tras {max_attempts} intentos: {last_err}')


def parse_page(body):
    import xml.etree.ElementTree as ET
    root = ET.fromstring(body)
    links = {l.get('rel'): l.get('href') for l in root.findall(f'{ATOM}link')}
    entries = []
    for e in root.findall(f'{ATOM}entry'):
        cfs = find1(e, 'ContractFolderStatus')
        pp = find1(cfs, 'ProcurementProject') if cfs is not None else None
        ba = find1(pp, 'BudgetAmount') if pp is not None else None
        rl = find1(pp, 'RealizedLocation') if pp is not None else None
        tp = find1(cfs, 'TenderingProcess') if cfs is not None else None
        dl = find1(tp, 'TenderSubmissionDeadlinePeriod') if tp is not None else None
        org = ''
        if cfs is not None:
            for pe in cfs.iter():
                if L(pe.tag) == 'PartyName':
                    for ch in pe:
                        if L(ch.tag) == 'Name':
                            org = txt(ch)
                            break
                    break
        uris = []
        if cfs is not None:
            for ref in find_all(cfs, 'ExternalReference'):
                u = find1(ref, 'URI')
                if u is not None:
                    uris.append(txt(u))
        entries.append({
            'id': txt(e.find(f'{ATOM}id')),
            'link': (e.find(f'{ATOM}link').get('href') if e.find(f'{ATOM}link') is not None else ''),
            'title': txt(e.find(f'{ATOM}title')),
            'updated': txt(e.find(f'{ATOM}updated')),
            'expediente': txt(find1(cfs, 'ContractFolderID')) if cfs is not None else '',
            'status': txt(find1(cfs, 'ContractFolderStatusCode')) if cfs is not None else '',
            'org': org,
            'cpv': [txt(x) for x in find_all(pp, 'ItemClassificationCode')] if pp is not None else [],
            'amt_est': txt(find1(ba, 'EstimatedOverallContractAmount')) if ba is not None else '',
            'amt_taxexcl': txt(find1(ba, 'TaxExclusiveAmount')) if ba is not None else '',
            'amt_total': txt(find1(ba, 'TotalAmount')) if ba is not None else '',
            'prov': txt(find1(rl, 'CountrySubentity')) if rl is not None else '',
            'nuts': txt(find1(rl, 'CountrySubentityCode')) if rl is not None else '',
            'deadline': txt(find1(dl, 'EndDate')) if dl is not None else '',
            'deadline_time': txt(find1(dl, 'EndTime')) if dl is not None else '',
            'notices': [txt(x) for x in find_all(cfs, 'NoticeTypeCode')] if cfs is not None else [],
            'n_doc_uris': len(uris),
            'n_lots': len(find_all(cfs, 'ProcurementProjectLot')) if cfs is not None else 0,
        })
    return links, entries


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--feed', required=True, choices=['643', '1044'])
    ap.add_argument('--outdir', required=True)
    ap.add_argument('--max-pages', type=int, default=400)
    args = ap.parse_args()
    outdir = args.outdir
    os.makedirs(outdir, exist_ok=True)
    state_path = os.path.join(outdir, 'state.json')
    inv_path = os.path.join(outdir, 'pages_inventory.csv')
    data_path = os.path.join(outdir, 'entries.jsonl.gz')
    state = {'next_url': FEED_URLS[args.feed], 'pages': 0, 'entries': 0,
             'entries_in_window': 0, 'bytes': 0, 'retries_total': 0, 'errors': 0,
             'visited': []}
    if os.path.exists(state_path):
        state = json.load(open(state_path, encoding='utf-8'))
        state.setdefault('visited', [])
        log(outdir, f"reanudando feed {args.feed}: {state['pages']} páginas ya procesadas, next={state['next_url'][:100]}")
    if not os.path.exists(inv_path):
        with open(inv_path, 'w', newline='', encoding='utf-8') as f:
            csv.writer(f).writerow(['page_no', 'url', 'http', 'bytes', 'n_entries',
                                    'n_in_window', 'updated_min', 'updated_max', 'seconds',
                                    'retries', 'etag'])
    t0 = time.time()
    url = state['next_url']
    visited = set(state.get('visited', []))
    while url:
        if url in visited:
            log(outdir, f'ERROR: ciclo de paginación — URL ya visitada: {url[:120]} — parada')
            state['errors'] += 1
            json.dump(state, open(state_path, 'w'), indent=1)
            sys.exit(3)
        if state['pages'] >= args.max_pages:
            log(outdir, f'ERROR: límite --max-pages={args.max_pages} alcanzado sin llegar al corte — parada')
            state['errors'] += 1
            json.dump(state, open(state_path, 'w'), indent=1)
            sys.exit(4)
        visited.add(url)
        page_no = state['pages'] + 1
        t1 = time.time()
        try:
            body, headers, retries = fetch(url, outdir)
        except Exception as e:
            state['errors'] += 1
            log(outdir, f'PÁGINA {page_no} ERROR FATAL fetch {url[:120]}: {e}')
            json.dump(state, open(state_path, 'w'), indent=1)
            sys.exit(2)
        secs = time.time() - t1
        links, entries = parse_page(body)
        ups = [parse_dt(e['updated']) for e in entries]
        ups = [u for u in ups if u]
        in_window = [e for e in entries if parse_dt(e['updated']) and parse_dt(e['updated']) >= CUTOFF]
        # persistir registros mínimos (solo ventana) y soltar el XML de memoria
        with gzip.open(data_path, 'at', encoding='utf-8') as gz:
            for e in in_window:
                e['feed'] = args.feed
                e['page_no'] = page_no
                gz.write(json.dumps(e, ensure_ascii=False) + '\n')
        with open(inv_path, 'a', newline='', encoding='utf-8') as f:
            csv.writer(f).writerow([page_no, url, 200, len(body), len(entries), len(in_window),
                                    min(ups).isoformat() if ups else '',
                                    max(ups).isoformat() if ups else '',
                                    round(secs, 1), retries, headers.get('ETag', '')])
        state['pages'] = page_no
        state['entries'] += len(entries)
        state['entries_in_window'] += len(in_window)
        state['bytes'] += len(body)
        state['retries_total'] += retries
        state['next_url'] = links.get('next', '')
        state['visited'] = sorted(visited)
        url = state['next_url']  # avanzar a la siguiente página (antes se re-descargaba siempre la pág. 1)
        json.dump(state, open(state_path, 'w'), indent=1)
        del body, entries, in_window
        log(outdir, f"feed {args.feed} pág {page_no}: {state['entries_in_window']} en ventana acumuladas, "
                    f"rango {min(ups).date() if ups else '?'}..{max(ups).date() if ups else '?'} "
                    f"({secs:.0f}s, {state['bytes']/1e6:.0f} MB acum.)")
        if not state['next_url']:
            log(outdir, f'feed {args.feed}: sin enlace next — fin de paginación')
            break
        if ups and min(ups) < CUTOFF:
            log(outdir, f"feed {args.feed}: página {page_no} cruza el corte 2026-10-15 "
                        f"(mín updated {min(ups).isoformat()}) — parada")
            break
    state['finished'] = True
    state['total_seconds'] = round(time.time() - t0, 1)
    state['finished_at'] = datetime.now(timezone.utc).isoformat()
    json.dump(state, open(state_path, 'w'), indent=1)
    log(outdir, f"feed {args.feed} COMPLETADO: {state['pages']} páginas, {state['entries']} entradas "
                f"({state['entries_in_window']} en ventana), {state['bytes']/1e6:.0f} MB, "
                f"{state['total_seconds']:.0f}s, reintentos={state['retries_total']}, errores={state['errors']}")


if __name__ == '__main__':
    main()
