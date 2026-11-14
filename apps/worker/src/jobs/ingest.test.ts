// Tests del job de ingesta (Fase C) con feed simulado.
import { describe, expect, it } from 'vitest';
import { InMemoryWorkerStore } from '../db.js';
import { runIngest } from './ingest.js';

const PAGE_1 = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <updated>2026-11-13T20:21:42+01:00</updated>
  <link rel="next" href="https://example.invalid/p2.atom"/>
  <entry>
    <id>tag:example,2026:nicho-1</id>
    <link rel="alternate" href="https://contrataciondelestado.es/detalle-1"/>
    <title>Obras para la climatización de la cocina del Parador de Turismo de Salamanca</title>
    <updated>2026-11-13T14:04:00+01:00</updated>
    <ContractFolderStatus>
      <ContractFolderID>2026-0666</ContractFolderID>
      <ContractFolderStatusCode>PUB</ContractFolderStatusCode>
      <LocatedContractingParty><Party><PartyName><Name>Paradores de Turismo de España</Name></PartyName></Party></LocatedContractingParty>
      <ProcurementProject>
        <Name>Obras para la climatización</Name>
        <BudgetAmount><EstimatedOverallContractAmount>115500</EstimatedOverallContractAmount><TaxExclusiveAmount>105000</TaxExclusiveAmount><TotalAmount>127050</TotalAmount></BudgetAmount>
        <RequiredCommodityClassification><ItemClassificationCode>45331000-6</ItemClassificationCode></RequiredCommodityClassification>
        <RealizedLocation><CountrySubentity>Madrid</CountrySubentity><CountrySubentityCode>ES300</CountrySubentityCode></RealizedLocation>
      </ProcurementProject>
      <TenderingProcess><TenderSubmissionDeadlinePeriod><EndDate>2026-12-03</EndDate><EndTime>14:00:00</EndTime></TenderSubmissionDeadlinePeriod></TenderingProcess>
      <LegalDocumentReference><Attachment><ExternalReference><URI>https://contrataciondelestado.es/FileSystem/servlet/GetDocumentByIdServlet?cifrado=AAA</URI></ExternalReference></Attachment></LegalDocumentReference>
      <ValidNoticeInfo><NoticeTypeCode>DOC_CN</NoticeTypeCode></ValidNoticeInfo>
    </ContractFolderStatus>
  </entry>
  <entry>
    <id>tag:example,2026:marginal-1</id>
    <link rel="alternate" href="https://contrataciondelestado.es/detalle-2"/>
    <title>Suministro de gasóleo tipo B para calefacción</title>
    <updated>2026-11-13T13:00:00+01:00</updated>
    <ContractFolderStatus>
      <ContractFolderID>2026_034</ContractFolderID>
      <ContractFolderStatusCode>PUB</ContractFolderStatusCode>
      <LocatedContractingParty><Party><PartyName><Name>Universidad Miguel Hernández de Elche</Name></PartyName></Party></LocatedContractingParty>
      <ProcurementProject>
        <Name>Suministro de gasóleo</Name>
        <BudgetAmount><EstimatedOverallContractAmount>74380.17</EstimatedOverallContractAmount></BudgetAmount>
        <RequiredCommodityClassification><ItemClassificationCode>09134100-7</ItemClassificationCode></RequiredCommodityClassification>
        <RealizedLocation><CountrySubentity>Alicante</CountrySubentity><CountrySubentityCode>ES521</CountrySubentityCode></RealizedLocation>
      </ProcurementProject>
      <TenderingProcess><TenderSubmissionDeadlinePeriod><EndDate>2026-09-18</EndDate><EndTime>14:00:00</EndTime></TenderSubmissionDeadlinePeriod></TenderingProcess>
    </ContractFolderStatus>
  </entry>
  <entry>
    <id>tag:example,2026:fuera-1</id>
    <link rel="alternate" href="https://contrataciondelestado.es/detalle-3"/>
    <title>Suministro de material de oficina</title>
    <updated>2026-11-13T12:00:00+01:00</updated>
    <ContractFolderStatus>
      <ContractFolderID>OF-1</ContractFolderID>
      <ContractFolderStatusCode>PUB</ContractFolderStatusCode>
      <LocatedContractingParty><Party><PartyName><Name>Ayuntamiento de Logroño</Name></PartyName></Party></LocatedContractingParty>
      <ProcurementProject>
        <Name>Material de oficina</Name>
        <BudgetAmount><EstimatedOverallContractAmount>10000</EstimatedOverallContractAmount></BudgetAmount>
        <RequiredCommodityClassification><ItemClassificationCode>30192000-1</ItemClassificationCode></RequiredCommodityClassification>
        <RealizedLocation><CountrySubentity>La Rioja</CountrySubentity><CountrySubentityCode>ES230</CountrySubentityCode></RealizedLocation>
      </ProcurementProject>
    </ContractFolderStatus>
  </entry>
</feed>`;

const PAGE_2 = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><updated>2026-11-13T12:00:00+01:00</updated>
<entry>
  <id>tag:example,2026:nicho-1</id>
  <link rel="alternate" href="https://contrataciondelestado.es/detalle-1"/>
  <title>Obras para la climatización de la cocina del Parador de Turismo de Salamanca</title>
  <updated>2026-11-13T15:00:00+01:00</updated>
  <ContractFolderStatus>
    <ContractFolderID>2026-0666</ContractFolderID>
    <ContractFolderStatusCode>EV</ContractFolderStatusCode>
    <LocatedContractingParty><Party><PartyName><Name>Paradores de Turismo de España</Name></PartyName></Party></LocatedContractingParty>
    <ProcurementProject>
      <Name>Obras para la climatización</Name>
      <BudgetAmount><EstimatedOverallContractAmount>115500</EstimatedOverallContractAmount></BudgetAmount>
      <RequiredCommodityClassification><ItemClassificationCode>45331000-6</ItemClassificationCode></RequiredCommodityClassification>
      <RealizedLocation><CountrySubentity>Madrid</CountrySubentity><CountrySubentityCode>ES300</CountrySubentityCode></RealizedLocation>
    </ProcurementProject>
    <ValidNoticeInfo><NoticeTypeCode>DOC_MOD</NoticeTypeCode></ValidNoticeInfo>
  </ContractFolderStatus>
</entry>
</feed>`;

function mockFetch(pages: Record<string, string>): typeof fetch {
  return (async (url: unknown) => {
    const body = pages[String(url)];
    if (!body) return new Response('Not found', { status: 404 });
    return new Response(body, { status: 200, headers: { 'content-type': 'application/atom+xml' } });
  }) as typeof fetch;
}

describe('runIngest', () => {
  it('ingiere el nicho, corrige la provincia, aparta el marginal y no guarda fuera del nicho', async () => {
    const store = new InMemoryWorkerStore();
    const fetchFn = mockFetch({
      'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom': PAGE_1,
      'https://example.invalid/p2.atom': PAGE_2,
    });
    const result = await runIngest(store, { feed: '643', fetchFn });
    expect(result.pages).toBe(2);
    expect(result.entries).toBe(4); // 3 en pág. 1 + 1 republicada en pág. 2
    expect(result.newTenders).toBe(2); // Paradores + gasóleo; oficina fuera del nicho
    expect(result.rectified).toBe(1); // la republicación de Paradores (PUB→EV, DOC_MOD)

    const parador = await store.getTenderByExpedienteOrgano('2026-0666', 'Paradores de Turismo de España');
    expect(parador).not.toBeNull();
    expect(parador?.provincia).toBe('Salamanca'); // título corrige ES300 Madrid
    expect(parador?.provinciaPorVerificar).toBe(true);
    expect(parador?.pipeline).toBe('documentos_pendientes');
    expect(parador?.valorEstimado).toBe('115500');
    expect(parador?.presupuestoBaseSinIva).toBe('105000'); // la republicación no lo trae: se conserva
    expect(parador?.estado).toBe('EV'); // rectificación aplicada
    expect(parador?.version).toBe(2);
    expect(parador?.plazoHora).toBe('14:00:00');
    expect(parador?.plazoSoloFecha).toBe(false);

    const gasoleo = await store.getTenderByExpedienteOrgano('2026_034', 'Universidad Miguel Hernández de Elche');
    expect(gasoleo?.claseNicho).toBe('marginal');
    expect(gasoleo?.pipeline).toBe('revision_requerida'); // marginal no se publica

    const oficina = await store.getTenderByExpedienteOrgano('OF-1', 'Ayuntamiento de Logroño');
    expect(oficina).toBeNull();
  });

  it('la republicación con el mismo <id> y <updated> mayor se reprocesa: rectificación (DOC_MOD) sube versión', async () => {
    const store = new InMemoryWorkerStore();
    const fetchFn = mockFetch({
      'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom': PAGE_1,
      'https://example.invalid/p2.atom': PAGE_2,
    });
    const result = await runIngest(store, { feed: '643', fetchFn });
    // La entrada nicho-1 aparece en pág. 1 (PUB, 14:04) y republicada en pág. 2
    // (EV, 15:00, DOC_MOD): mismo <id> pero <updated> mayor → se reprocesa.
    expect(result.seen).toBe(0);
    expect(result.newTenders).toBe(2);
    expect(result.rectified).toBe(1);
    const parador = await store.getTenderByExpedienteOrgano('2026-0666', 'Paradores de Turismo de España');
    expect(parador?.version).toBe(2);
    expect(parador?.estado).toBe('EV');
    expect(parador?.pipeline).toBe('documentos_pendientes'); // vuelve a documentos para re-extraer
  });

  it('segunda ingesta con el mismo feed no duplica (checkpoint por <id>)', async () => {
    const store = new InMemoryWorkerStore();
    const fetchFn = mockFetch({
      'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom': PAGE_1,
      'https://example.invalid/p2.atom': PAGE_2,
    });
    await runIngest(store, { feed: '643', fetchFn });
    const second = await runIngest(store, { feed: '643', fetchFn });
    expect(second.newTenders).toBe(0);
    expect(second.seen).toBe(4);
  });

  it('plazo solo con fecha: plazoSoloFecha=true y hora null (nunca inventada)', async () => {
    const store = new InMemoryWorkerStore();
    const pageSinHora = PAGE_1.replace('<EndTime>14:00:00</EndTime>', '');
    const fetchFn = mockFetch({
      'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom': pageSinHora,
      'https://example.invalid/p2.atom': PAGE_2,
    });
    await runIngest(store, { feed: '643', fetchFn });
    const parador = await store.getTenderByExpedienteOrgano('2026-0666', 'Paradores de Turismo de España');
    expect(parador?.plazoFecha).toBe('2026-12-03');
    expect(parador?.plazoHora).toBeNull();
    expect(parador?.plazoSoloFecha).toBe(true);
  });
});
