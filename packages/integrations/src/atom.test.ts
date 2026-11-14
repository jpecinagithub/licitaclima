// Tests del adaptador Atom (Fase C).
import { describe, expect, it } from 'vitest';
import { paginateFeed, parseAmount, parseAtomPage } from './atom.js';

const FEED_643_PAGE_1 = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <updated>2026-11-13T20:21:42+01:00</updated>
  <link rel="self" href="https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom"/>
  <link rel="next" href="https://example.invalid/feed643-p2.atom"/>
  <entry>
    <id>tag:example,2026:licitacion-1</id>
    <link rel="alternate" href="https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&amp;idEvl=ABC"/>
    <title>Obras para la climatización de la cocina del Parador de Turismo de Salamanca</title>
    <updated>2026-11-13T14:04:00+01:00</updated>
    <ContractFolderStatus>
      <ContractFolderID>2026-0666</ContractFolderID>
      <ContractFolderStatusCode>PUB</ContractFolderStatusCode>
      <LocatedContractingParty><Party><PartyName><Name>Paradores de Turismo de España, S.M.E., S.A.</Name></PartyName></Party></LocatedContractingParty>
      <ProcurementProject>
        <Name>Obras para la climatización de la cocina del Parador de Turismo de Salamanca</Name>
        <BudgetAmount>
          <EstimatedOverallContractAmount>115500</EstimatedOverallContractAmount>
          <TaxExclusiveAmount>105000</TaxExclusiveAmount>
          <TotalAmount>127050</TotalAmount>
        </BudgetAmount>
        <RequiredCommodityClassification><ItemClassificationCode>45331000-6</ItemClassificationCode></RequiredCommodityClassification>
        <RealizedLocation><CountrySubentity>Madrid</CountrySubentity><CountrySubentityCode>ES300</CountrySubentityCode></RealizedLocation>
      </ProcurementProject>
      <TenderingProcess><TenderSubmissionDeadlinePeriod><EndDate>2026-12-03</EndDate><EndTime>14:00:00</EndTime></TenderSubmissionDeadlinePeriod></TenderingProcess>
      <LegalDocumentReference><Attachment><ExternalReference><URI>https://contrataciondelestado.es/FileSystem/servlet/GetDocumentByIdServlet?cifrado=AAA</URI><DocumentHash>abc123</DocumentHash></ExternalReference></Attachment></LegalDocumentReference>
      <ValidNoticeInfo><NoticeTypeCode>DOC_CN</NoticeTypeCode></ValidNoticeInfo>
    </ContractFolderStatus>
  </entry>
  <entry>
    <id>tag:example,2026:licitacion-2</id>
    <link rel="alternate" href="https://example.invalid/detalle-2"/>
    <title>Suministro de gasóleo tipo B para calefacción</title>
    <updated>2026-11-13T13:00:00+01:00</updated>
    <ContractFolderStatus>
      <ContractFolderID>2026_034</ContractFolderID>
      <ContractFolderStatusCode>RES</ContractFolderStatusCode>
      <LocatedContractingParty><Party><PartyName><Name>Universidad Miguel Hernández de Elche</Name></PartyName></Party></LocatedContractingParty>
      <ProcurementProject>
        <Name>Suministro de gasóleo tipo B para calefacción</Name>
        <BudgetAmount>
          <EstimatedOverallContractAmount>74.380,17</EstimatedOverallContractAmount>
          <TaxExclusiveAmount>24.793,39</TaxExclusiveAmount>
          <TotalAmount>30000</TotalAmount>
        </BudgetAmount>
        <RequiredCommodityClassification><ItemClassificationCode>09134100-7</ItemClassificationCode></RequiredCommodityClassification>
        <RealizedLocation><CountrySubentity>Alicante/Alacant</CountrySubentity><CountrySubentityCode>ES521</CountrySubentityCode></RealizedLocation>
      </ProcurementProject>
      <TenderingProcess><TenderSubmissionDeadlinePeriod><EndDate>2026-09-18</EndDate><EndTime>14:00:00</EndTime></TenderSubmissionDeadlinePeriod></TenderingProcess>
    </ContractFolderStatus>
  </entry>
</feed>`;

describe('parseAmount (regla corregida del pull de 30 días)', () => {
  it('formato español con coma', () => {
    expect(parseAmount('42.884,99')).toBe('42884.99');
    expect(parseAmount('74.380,17')).toBe('74380.17');
    expect(parseAmount('1.980.940,96')).toBe('1980940.96');
  });
  it('decimal plano (sin coma)', () => {
    expect(parseAmount('44294455.44')).toBe('44294455.44');
    expect(parseAmount('27249.6')).toBe('27249.6');
  });
  it('miles con puntos y enteros', () => {
    expect(parseAmount('1.234.567')).toBe('1234567');
    expect(parseAmount('115500')).toBe('115500');
  });
  it('ausente → null, nunca 0', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
  });
});

describe('parseAtomPage', () => {
  it('parsea entradas 643 con importes diferenciados, CPV, NUTS, plazo y pliegos', () => {
    const page = parseAtomPage(FEED_643_PAGE_1, '643');
    expect(page.nextUrl).toBe('https://example.invalid/feed643-p2.atom');
    expect(page.entries).toHaveLength(2);
    const [parador, gasoleo] = page.entries;
    expect(parador.expediente).toBe('2026-0666');
    expect(parador.estado).toBe('PUB');
    expect(parador.organo).toBe('Paradores de Turismo de España, S.M.E., S.A.');
    expect(parador.valorEstimado).toBe('115500');
    expect(parador.presupuestoBaseSinIva).toBe('105000');
    expect(parador.presupuestoBaseConIva).toBe('127050');
    expect(parador.cpv).toEqual(['45331000-6']);
    expect(parador.nuts).toBe('ES300');
    expect(parador.provinciaNombre).toBe('Madrid');
    expect(parador.plazoFecha).toBe('2026-12-03');
    expect(parador.plazoHora).toBe('14:00:00');
    expect(parador.documentUris).toHaveLength(1);
    expect(parador.documentUris[0].kind).toBe('pcap');
    expect(parador.noticeTypes).toEqual(['DOC_CN']);
    // El segundo: importe español con coma, parseado sin inflar ×100.
    expect(gasoleo.valorEstimado).toBe('74380.17');
    expect(gasoleo.presupuestoBaseSinIva).toBe('24793.39');
  });

  it('sin DOCTYPE ni entidades externas: el XML con <!ENTITY> no se resuelve ni rompe', () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE feed [<!ENTITY xxe "CONTENIDO_SECRETO">]>
<feed xmlns="http://www.w3.org/2005/Atom"><updated>2026-11-13T20:00:00+01:00</updated>
<entry><id>x</id><title>Climatización &xxe;</title><updated>2026-11-13T20:00:00+01:00</updated>
<ContractFolderStatus><ContractFolderID>E1</ContractFolderID><ContractFolderStatusCode>PUB</ContractFolderStatusCode></ContractFolderStatus></entry></feed>`;
    const page = parseAtomPage(xml, '643');
    expect(page.entries).toHaveLength(1);
    expect(page.entries[0].title).not.toContain('CONTENIDO_SECRETO');
  });
});

describe('paginateFeed: protecciones anti-bucle', () => {
  const page1 = FEED_643_PAGE_1;
  const page2 = FEED_643_PAGE_1.replace(
    'https://example.invalid/feed643-p2.atom',
    'https://example.invalid/feed643-p3.atom',
  ).replace('tag:example,2026:licitacion-1', 'tag:example,2026:licitacion-3');

  function mockFetch(urls: Record<string, string>): typeof fetch {
    return (async (url: unknown) => {
      const body = urls[String(url)];
      if (!body) return new Response('Not found', { status: 404 });
      return new Response(body, { status: 200, headers: { 'content-type': 'application/atom+xml' } });
    }) as typeof fetch;
  }

  it('avanza por next y para al final', async () => {
    // La pág. 2 no trae enlace next → fin de paginación.
    const page2Fin = page2.replace(
      '<link rel="next" href="https://example.invalid/feed643-p3.atom"/>',
      '',
    );
    const fetchFn = mockFetch({
      'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom': page1,
      'https://example.invalid/feed643-p2.atom': page2Fin,
    });
    let seen = 0;
    const result = await paginateFeed('643', () => { seen += 1; }, { userAgent: 'test', fetchFn });
    expect(result.pages).toBe(2);
    expect(result.stoppedBy).toBe('fin');
    expect(seen).toBe(2);
  });

  it('ciclo: la misma URL dos veces → parada "ciclo" sin bucle infinito', async () => {
    const loop = page1.replace(
      'https://example.invalid/feed643-p2.atom',
      'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom',
    );
    const fetchFn = mockFetch({
      'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom': loop,
    });
    const result = await paginateFeed('643', () => {}, { userAgent: 'test', fetchFn });
    expect(result.stoppedBy).toBe('ciclo');
    expect(result.pages).toBe(1);
  });

  it('maxPages: para aunque queden páginas', async () => {
    const fetchFn = mockFetch({
      'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom': page1,
      'https://example.invalid/feed643-p2.atom': page2,
    });
    const result = await paginateFeed('643', () => {}, { userAgent: 'test', fetchFn, maxPages: 1 });
    expect(result.stoppedBy).toBe('max-paginas');
    expect(result.pages).toBe(1);
  });
});
