// LicitaClima — resumen semanal + alertas (Fase C). NO diario.
//
// DECISIÓN 2026-11-14 (Jon): resumen SEMANAL como producto principal +
// alertas cuando hay novedad en las provincias del cliente. El volumen del
// nicho (~6 aperturas de núcleo/día laborable a nivel nacional, ~6/mes para
// un cliente de 3 provincias medianas) no sostiene un diario útil.
// Regla: si no hay novedades desde el último resumen, NO se envía un resumen
// vacío: se registra "sin_novedades" y se ofrece el semanal.
// Los envíos van al outbox (email_outbox, estado pending): el proveedor de
// correo NO está configurado (Fase D). Este job NO envía nada.

import type { WorkerStore } from '../db.js';

/** Lunes de la semana (Europe/Madrid) de una fecha, en YYYY-MM-DD. */
export function lunesDeSemana(fecha: Date): string {
  const d = new Date(fecha);
  const dia = (d.getDay() + 6) % 7; // lunes = 0
  d.setDate(d.getDate() - dia);
  return d.toISOString().slice(0, 10);
}

export interface DigestResult {
  organizationId: string;
  weekStart: string;
  status: 'enviado' | 'sin_novedades';
  tenderIds: string[];
}

export function construirCuerpoResumen(input: {
  organizationName: string;
  weekStart: string;
  tenders: Array<{ expediente: string; objeto: string; provincia: string | null; urlOficial: string; plazoFecha: string | null }>;
}): { subject: string; body: string } {
  const subject = `LicitaClima — resumen semanal (${input.weekStart}): ${input.tenders.length} ${input.tenders.length === 1 ? 'novedad' : 'novedades'} en tus provincias`;
  const lineas = input.tenders.map(
    (t) =>
      `- ${t.objeto} (${t.provincia ?? 'provincia sin resolver'}; exp. ${t.expediente}; plazo ${t.plazoFecha ?? 'sin fecha en el feed'})\n  ${t.urlOficial}`,
  );
  const body = [
    `Hola ${input.organizationName},`,
    '',
    `Estas son las novedades de climatización en tus provincias desde el último resumen semanal (semana del ${input.weekStart}):`,
    '',
    ...lineas,
    '',
    'Consulta cada ficha en LicitaClima para ver requisitos y evidencias.',
    'Este resumen es semanal: no recibirás un correo vacío los días sin novedades.',
  ].join('\n');
  return { subject, body };
}

/**
 * Genera el resumen semanal de una organización. Solo novedades en sus
 * provincias desde el último resumen (por updatedAt). Idempotente por
 * (organización, semana): si ya existe, no se duplica.
 */
export async function runWeeklyDigest(
  store: WorkerStore,
  opts: { organizationId: string; weekStart?: string; now?: Date },
): Promise<DigestResult> {
  const now = opts.now ?? new Date();
  const weekStart = opts.weekStart ?? lunesDeSemana(now);
  const orgs = await store.listOrganizations();
  const org = orgs.find((o) => o.id === opts.organizationId);
  if (!org) throw new Error(`organización desconocida: ${opts.organizationId}`);

  // Idempotencia por (organización, semana): si el resumen de esta semana ya
  // existe (enviado o sin novedades), se devuelve tal cual, sin duplicar.
  const existente = await store.getDigest(org.id, weekStart);
  if (existente) {
    return { organizationId: org.id, weekStart: existente.weekStart, status: existente.status, tenderIds: existente.tenderIds };
  }

  const lastDigest = await store.getLastDigest(org.id);
  const since = lastDigest ? lastDigest.createdAt : new Date(0).toISOString();
  const publicados = await store.listTenders({ pipeline: 'publicado', limit: 500 });
  const novedades = publicados.filter(
    (t) =>
      t.claseNicho !== 'marginal' &&
      t.provincia !== null &&
      org.provincias.includes(t.provincia) &&
      t.updatedAt > since,
  );

  if (novedades.length === 0) {
    const digest = await store.recordDigest(org.id, weekStart, 'sin_novedades', []);
    return { organizationId: org.id, weekStart: digest.weekStart, status: 'sin_novedades', tenderIds: [] };
  }

  const { subject, body } = construirCuerpoResumen({
    organizationName: org.name,
    weekStart,
    tenders: novedades,
  });
  await store.insertOutbox({
    organizationId: org.id,
    kind: 'resumen_semanal',
    subject,
    body,
    idempotencyKey: `digest:${org.id}:${weekStart}`,
    tenderIds: novedades.map((t) => t.id),
  });
  const digest = await store.recordDigest(org.id, weekStart, 'enviado', novedades.map((t) => t.id));
  return { organizationId: org.id, weekStart: digest.weekStart, status: 'enviado', tenderIds: digest.tenderIds };
}
