// LicitaClima — alertas de nuevas oportunidades (Fase C).
//
// Cuando se publica una oportunidad nueva (núcleo/limítrofe, PUB) en las
// provincias de una organización, se escribe UNA fila en email_outbox
// (estado pending, clave idempotente alerta:{org}:{tender}). El proveedor de
// correo NO está configurado (Fase D): este job NO envía nada.

import type { WorkerStore } from '../db.js';

export interface AlertsResult {
  tenderId: string;
  alertsQueued: number;
  organizationsNotified: string[];
}

export async function runAlerts(
  store: WorkerStore,
  opts: { tenderId: string },
): Promise<AlertsResult> {
  const tender = await store.getTender(opts.tenderId);
  if (!tender) throw new Error(`expediente desconocido: ${opts.tenderId}`);
  if (tender.pipeline !== 'publicado' || tender.provincia === null) {
    return { tenderId: tender.id, alertsQueued: 0, organizationsNotified: [] };
  }
  const orgs = await store.listOrganizations();
  const destinatarias = orgs.filter((o) => o.provincias.includes(tender.provincia as string));
  let queued = 0;
  const notified: string[] = [];
  for (const org of destinatarias) {
    const key = `alert:${org.id}:${tender.id}`;
    if (await store.outboxExists(key)) continue;
    await store.insertOutbox({
      organizationId: org.id,
      kind: 'alerta',
      subject: `LicitaClima — nueva oportunidad en ${tender.provincia}: ${tender.objeto.slice(0, 80)}`,
      body: [
        `Nueva licitación de climatización en ${tender.provincia}:`,
        '',
        tender.objeto,
        `Expediente: ${tender.expediente} · Órgano: ${tender.organo}`,
        `Plazo: ${tender.plazoFecha ?? 'sin fecha en el feed'}${tender.plazoHora ? ` ${tender.plazoHora}` : ' (solo fecha; sin hora inventada)'}`,
        `Ficha oficial: ${tender.urlOficial}`,
        '',
        'Consulta la ficha en LicitaClima para ver requisitos y evidencias.',
      ].join('\n'),
      idempotencyKey: key,
    });
    queued += 1;
    notified.push(org.id);
  }
  return { tenderId: tender.id, alertsQueued: queued, organizationsNotified: notified };
}
