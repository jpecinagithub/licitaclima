// Tests de la matriz de encaje y del resumen semanal / alertas (Fase C).
import { describe, expect, it } from 'vitest';
import { InMemoryWorkerStore } from '../db.js';
import { construirMatriz, runAnalyze, runPublish } from './analyze.js';
import { runWeeklyDigest, lunesDeSemana } from './digest-weekly.js';
import { runAlerts } from './alerts.js';
import type { Extraction } from '@licitaclima/domain';
import type { CompanyProfile } from '@licitaclima/domain';

const HASH = 'c'.repeat(64);

function extractionBase(overrides: Partial<Extraction> = {}): Extraction {
  return {
    version: 'determinista-v1',
    metodo: 'determinista-v1 (sin LLM)',
    tenderId: 't-1',
    expediente: '2026-0666',
    objeto: 'Obras para la climatización de la cocina del Parador de Salamanca',
    organismo: 'Paradores',
    estado: 'PUB',
    importes: { valorEstimado: '115500', presupuestoBaseSinIva: '105000', presupuestoBaseConIva: '127050' },
    duracion: null,
    localizacion: 'Salamanca',
    plazo: { fecha: '2026-12-03', hora: '14:00:00', plazoSoloFecha: false },
    requisitos: [
      {
        id: 'solvencia-tecnica', categoria: 'solvencia_tecnica',
        descripcion: 'Solvencia técnica o profesional exigida', obligatorio: true,
        evidencia: { documentId: 'd-1', documentHash: HASH, page: 2, fragment: 'solvencia técnica: experiencia en climatización' },
        motivoAusencia: null,
      },
      {
        id: 'garantia', categoria: 'garantia',
        descripcion: 'Garantía provisional o definitiva', obligatorio: true,
        evidencia: null, motivoAusencia: 'no consta en los pliegos descargados',
      },
    ],
    conflictos: [],
    instruccionesDetectadas: [],
    extraidoEn: new Date().toISOString(),
    ...overrides,
  };
}

const PERFIL: CompanyProfile = {
  actividad: 'mantenimiento e instalación de climatización',
  provincias: ['Salamanca', 'Valladolid'],
  radioKm: null,
  tamanoContratosOrientativo: '50000-200000',
  capacidadOperativa: '2 equipos',
  experiencia: '10 años',
  certificacionesDeclaradas: ['ISO 9001'],
  preferencias: null,
};

describe('construirMatriz', () => {
  it('provincia fuera del perfil (obligatorio incompatible) bloquea la recomendación positiva', () => {
    const matriz = construirMatriz({
      tenderId: 't-1',
      extraction: extractionBase(),
      provincia: 'Madrid', // el perfil cubre Salamanca y Valladolid
      profile: PERFIL,
    });
    expect(matriz.bloqueadoPor).toContain('territorio');
    expect(matriz.recomendacion).toBe('negativa');
  });

  it('desconocido ≠ cumplido: un requisito sin evidencia no es compatible', () => {
    const matriz = construirMatriz({
      tenderId: 't-1',
      extraction: extractionBase(),
      provincia: 'Salamanca',
      profile: PERFIL,
    });
    const garantia = matriz.filas.find((f) => f.requisitoId === 'garantia');
    expect(garantia?.veredicto).toBe('desconocido');
    expect(matriz.recomendacion).toBe('revisar'); // no negativa (no es incompatible), no positiva
  });

  it('todo compatible y nada desconocido → positiva, con la advertencia del score', () => {
    const ext = extractionBase({
      requisitos: [
        {
          id: 'solvencia-tecnica', categoria: 'solvencia_tecnica',
          descripcion: 'Solvencia técnica', obligatorio: true,
          evidencia: { documentId: 'd-1', documentHash: HASH, page: 2, fragment: 'solvencia técnica' },
          motivoAusencia: null,
        },
      ],
    });
    const matriz = construirMatriz({ tenderId: 't-1', extraction: ext, provincia: 'Salamanca', profile: PERFIL });
    expect(matriz.recomendacion).toBe('positiva');
    expect(matriz.advertenciaScore).toMatch(/NO una probabilidad de ganar/);
    expect(matriz.resumen.incompatibles).toBe(0);
    expect(matriz.resumen.desconocidos).toBe(0);
  });
});

describe('runAnalyze + runPublish', () => {
  async function preparar() {
    const store = new InMemoryWorkerStore();
    const { tender } = await store.upsertTender({
      source: 'feed643', sourceId: 'atom-1', expediente: 'E-TEST-2', organo: 'Org Test',
      objeto: 'Obras de climatización', estado: 'PUB', valorEstimado: '115500',
      presupuestoBaseSinIva: '105000', presupuestoBaseConIva: '127050', duracion: null,
      provincia: 'Salamanca', provinciaPorVerificar: true, nuts: 'ES415',
      plazoFecha: '2026-12-03', plazoHora: '14:00:00', plazoSoloFecha: false,
      cpv: ['45331000'], claseNicho: 'nucleo', urlOficial: 'https://contrataciondelestado.es/detalle-1',
      documentUris: [], notices: ['DOC_CN'], firstPubAt: null, feedUpdatedAt: '2026-11-13T14:00:00+01:00',
    });
    await store.saveExtraction(tender.id, 'determinista-v1', extractionBase({ tenderId: tender.id }), 'extraido');
    return { store, tender };
  }

  it('analiza, publica (PUB + núcleo) y encola alertas', async () => {
    const { store, tender } = await preparar();
    const analyzed = await runAnalyze(store, { tenderId: tender.id, profile: PERFIL });
    expect(analyzed.nextPipeline).toBe('analizado');
    const published = await runPublish(store, { tenderId: tender.id });
    expect(published.published).toBe(true);
    const actualizado = await store.getTender(tender.id);
    expect(actualizado?.pipeline).toBe('publicado');
    expect(store.jobs.some((j) => j.type === 'alerts')).toBe(true);
  });

  it('un expediente no-PUB no se publica (queda validado)', async () => {
    const { store, tender } = await preparar();
    await store.upsertTender({
      source: 'feed643', sourceId: 'atom-1', expediente: 'E-TEST-2', organo: 'Org Test',
      objeto: 'Obras de climatización', estado: 'EV', valorEstimado: '115500',
      presupuestoBaseSinIva: '105000', presupuestoBaseConIva: '127050', duracion: null,
      provincia: 'Salamanca', provinciaPorVerificar: true, nuts: 'ES415',
      plazoFecha: '2026-12-03', plazoHora: '14:00:00', plazoSoloFecha: false,
      cpv: ['45331000'], claseNicho: 'nucleo', urlOficial: 'https://contrataciondelestado.es/detalle-1',
      documentUris: [], notices: [], firstPubAt: null, feedUpdatedAt: '2026-11-13T15:00:00+01:00',
    });
    await runAnalyze(store, { tenderId: tender.id, profile: PERFIL });
    const published = await runPublish(store, { tenderId: tender.id });
    expect(published.published).toBe(false);
    expect((await store.getTender(tender.id))?.pipeline).toBe('validado');
  });
});

describe('resumen semanal y alertas (outbox, sin envío)', () => {
  async function preparar(publicado = true) {
    const store = new InMemoryWorkerStore();
    const org = await store.upsertOrganization({ name: 'Clima Salamanca SL', email: 'hola@climasalamanca.example', provincias: ['Salamanca'] });
    const otra = await store.upsertOrganization({ name: 'Frío Sevilla SL', email: 'hola@friosevilla.example', provincias: ['Sevilla'] });
    const { tender } = await store.upsertTender({
      source: 'feed643', sourceId: 'atom-9', expediente: 'E-TEST-9', organo: 'Org Test',
      objeto: 'Obras de climatización en Salamanca', estado: 'PUB', valorEstimado: '115500',
      presupuestoBaseSinIva: '105000', presupuestoBaseConIva: '127050', duracion: null,
      provincia: 'Salamanca', provinciaPorVerificar: false, nuts: 'ES415',
      plazoFecha: '2026-12-03', plazoHora: '14:00:00', plazoSoloFecha: false,
      cpv: ['45331000'], claseNicho: 'nucleo', urlOficial: 'https://contrataciondelestado.es/detalle-9',
      documentUris: [], notices: ['DOC_CN'], firstPubAt: null, feedUpdatedAt: '2026-11-13T14:00:00+01:00',
    });
    if (publicado) await store.setPipeline(tender.id, 'publicado');
    return { store, org, otra, tender };
  }

  it('lunesDeSemana: el lunes de un viernes es el lunes anterior', () => {
    expect(lunesDeSemana(new Date('2026-11-13T12:00:00+01:00'))).toBe('2026-11-09');
    expect(lunesDeSemana(new Date('2026-11-09T12:00:00+01:00'))).toBe('2026-11-09');
  });

  it('sin novedades NO se envía resumen vacío: se registra sin_novedades y no hay outbox', async () => {
    const { store, org } = await preparar(false); // sin publicados
    const result = await runWeeklyDigest(store, { organizationId: org.id, weekStart: '2026-11-09' });
    expect(result.status).toBe('sin_novedades');
    expect(await store.listOutbox()).toHaveLength(0);
    const digest = await store.getLastDigest(org.id);
    expect(digest?.status).toBe('sin_novedades');
  });

  it('con novedades: una fila en outbox (pending) y digest enviado; idempotente', async () => {
    const { store, org } = await preparar(true);
    const first = await runWeeklyDigest(store, { organizationId: org.id, weekStart: '2026-11-09' });
    expect(first.status).toBe('enviado');
    expect(first.tenderIds).toHaveLength(1);
    const outbox = await store.listOutbox('pending');
    expect(outbox).toHaveLength(1);
    expect(outbox[0].kind).toBe('resumen_semanal');
    expect(outbox[0].subject).toMatch(/resumen semanal/);
    const second = await runWeeklyDigest(store, { organizationId: org.id, weekStart: '2026-11-09' });
    expect(second.status).toBe('enviado');
    expect(await store.listOutbox()).toHaveLength(1); // no duplica
  });

  it('alertas solo a organizaciones de esa provincia, con clave idempotente', async () => {
    const { store, org, otra, tender } = await preparar(true);
    const result = await runAlerts(store, { tenderId: tender.id });
    expect(result.alertsQueued).toBe(1);
    expect(result.organizationsNotified).toEqual([org.id]);
    expect(otra.id).not.toBe(org.id);
    const outbox = await store.listOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].kind).toBe('alerta');
    // Segunda ejecución: no duplica.
    const again = await runAlerts(store, { tenderId: tender.id });
    expect(again.alertsQueued).toBe(0);
    expect(await store.listOutbox()).toHaveLength(1);
  });
});
