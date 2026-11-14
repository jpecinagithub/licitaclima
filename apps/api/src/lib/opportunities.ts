// LicitaClima — API de lectura: serialización de oportunidades (block/api-lectura).
//
// La web espera la forma de `apps/web/src/lib/types.ts` (Opportunity):
// titulo = objeto, clase = clase_nicho, fuente '643' | '1044', importes en EUR
// como número o null, plazo como fecha YYYY-MM-DD (nunca se inventa una hora:
// plazoHora es null cuando la fuente solo da fecha).
// Regla de visibilidad (prompt §3 y §5): SOLO se listan como oportunidades
// núcleo + limítrofe. Los marginales NO se listan ni se fichan (404 genérico).
// Los datos públicos (tenders) no llevan organization_id; el encaje, el
// favorito y el estado personal son privados y se resuelven por organización.

import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '@licitaclima/db';
import {
  documents,
  favorites,
  lots,
  matches,
  tenders,
} from '@licitaclima/db';
import { notFound } from './errors.js';

export type TenderRow = typeof tenders.$inferSelect;
export type MatchRow = typeof matches.$inferSelect;
export type FavoriteRow = typeof favorites.$inferSelect;

export const VISIBLE_CLASSES = ['nucleo', 'limitrofe'] as const;
export const TENDER_STATES = ['PRE', 'PUB', 'EV', 'ADJ', 'RES', 'ANUL'] as const;

/** Una oportunidad listable es núcleo o limítrofe (los marginales, nunca). */
export function isVisibleTender(row: TenderRow): boolean {
  return row.claseNicho === 'nucleo' || row.claseNicho === 'limitrofe';
}

export function sourceFeed(sourceKey: string): '643' | '1044' {
  return sourceKey.includes('1044') ? '1044' : '643';
}

function eur(value: string | null): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function plazoFecha(row: TenderRow): string | null {
  if (!row.deadlineAt) return null;
  return new Date(row.deadlineAt).toISOString().slice(0, 10);
}

export function plazoHora(row: TenderRow): string | null {
  if (!row.deadlineAt || row.deadlineDateOnly) return null;
  return new Date(row.deadlineAt).toISOString().slice(11, 19);
}

export interface EncajeJson {
  score: number | null;
  motivo: string;
  bloqueante: boolean;
}

export function encajeFromMatch(match: MatchRow | null | undefined): EncajeJson | null {
  if (!match) return null;
  const explanation = (match.explanation ?? {}) as {
    resumen?: { compatibles?: number; incompatibles?: number; desconocidos?: number };
    recomendacion?: string;
  };
  const resumen = explanation.resumen ?? {};
  const motivo =
    match.verdict === 'compatible'
      ? `Encaje compatible: ${resumen.compatibles ?? 0} requisitos compatibles.`
      : match.verdict === 'incompatible'
        ? 'Encaje incompatible: hay un requisito obligatorio incompatible.'
        : `Encaje ${match.verdict}: ${resumen.compatibles ?? 0} compatibles, ${resumen.desconocidos ?? 0} desconocidos. Revisar el pliego.`;
  return {
    score: match.score === null ? null : Number(match.score),
    motivo,
    bloqueante: match.blocking,
  };
}

export interface OpportunityJson {
  id: string;
  expediente: string;
  organo: string;
  titulo: string;
  urlOficial: string;
  fuente: '643' | '1044';
  estado: string;
  clase: string | null;
  provincia: string | null;
  fechaPublicacion: string | null;
  fechaModificacion: string | null;
  plazo: string | null;
  plazoHora: string | null;
  valorEstimadoEur: number | null;
  presupuestoBaseSinIvaEur: number | null;
  presupuestoBaseConIvaEur: number | null;
  cpv: string[];
  nDocumentos: number;
  nLotes: number;
  encaje: EncajeJson | null;
  favorito: boolean;
  estadoPersonal: string | null;
}

export function toOpportunityJson(
  row: TenderRow,
  ctx: {
    nDocumentos?: number;
    nLotes?: number;
    match?: MatchRow | null;
    favorite?: FavoriteRow | null;
  } = {},
): OpportunityJson {
  return {
    id: row.id,
    expediente: row.expediente,
    organo: row.organo,
    titulo: row.objeto,
    urlOficial: row.urlOficial,
    fuente: sourceFeed(row.sourceKey),
    estado: row.estado,
    clase: row.claseNicho,
    provincia: row.provincia,
    fechaPublicacion: row.publishedAt ? new Date(row.publishedAt).toISOString() : null,
    fechaModificacion: row.modifiedAt ? new Date(row.modifiedAt).toISOString() : null,
    plazo: plazoFecha(row),
    plazoHora: plazoHora(row),
    valorEstimadoEur: eur(row.valorEstimado),
    presupuestoBaseSinIvaEur: eur(row.presupuestoBaseSinIva),
    presupuestoBaseConIvaEur: eur(row.presupuestoBaseConIva),
    cpv: row.cpv ?? [],
    nDocumentos: ctx.nDocumentos ?? 0,
    nLotes: ctx.nLotes ?? 0,
    encaje: encajeFromMatch(ctx.match),
    favorito: Boolean(ctx.favorite),
    estadoPersonal: ctx.favorite?.state ?? null,
  };
}

/** Contexto privado de una organización para una lista de expedientes. */
export async function loadOpportunityContext(
  db: Db,
  organizationId: string,
  tenderIds: string[],
): Promise<{
  counts: Map<string, { documentos: number; lotes: number }>;
  matchesByTender: Map<string, MatchRow>;
  favoritesByTender: Map<string, FavoriteRow>;
}> {
  const counts = new Map<string, { documentos: number; lotes: number }>();
  const matchesByTender = new Map<string, MatchRow>();
  const favoritesByTender = new Map<string, FavoriteRow>();
  if (tenderIds.length === 0) return { counts, matchesByTender, favoritesByTender };
  const [docRows, lotRows, matchRows, favRows] = await Promise.all([
    db.select({ tenderId: documents.tenderId }).from(documents).where(inArray(documents.tenderId, tenderIds)),
    db.select({ tenderId: lots.tenderId }).from(lots).where(inArray(lots.tenderId, tenderIds)),
    db
      .select()
      .from(matches)
      .where(and(eq(matches.organizationId, organizationId), inArray(matches.tenderId, tenderIds))),
    db
      .select()
      .from(favorites)
      .where(and(eq(favorites.organizationId, organizationId), inArray(favorites.tenderId, tenderIds))),
  ]);
  for (const r of docRows) {
    const c = counts.get(r.tenderId) ?? { documentos: 0, lotes: 0 };
    c.documentos += 1;
    counts.set(r.tenderId, c);
  }
  for (const r of lotRows) {
    const c = counts.get(r.tenderId) ?? { documentos: 0, lotes: 0 };
    c.lotes += 1;
    counts.set(r.tenderId, c);
  }
  // Si hay varias versiones de perfil, quedarse con el match más reciente.
  for (const m of matchRows) {
    const prev = matchesByTender.get(m.tenderId);
    if (!prev || new Date(m.recalculatedAt ?? m.updatedAt) >= new Date(prev.recalculatedAt ?? prev.updatedAt)) {
      matchesByTender.set(m.tenderId, m);
    }
  }
  for (const f of favRows) favoritesByTender.set(f.tenderId, f);
  return { counts, matchesByTender, favoritesByTender };
}

/** Carga un expediente visible o 404 genérico (marginal o inexistente). */
export async function loadVisibleTender(db: Db, tenderId: string): Promise<TenderRow> {
  const [row] = await db.select().from(tenders).where(eq(tenders.id, tenderId)).limit(1);
  if (!row || !isVisibleTender(row)) throw notFound('Oportunidad no encontrada.');
  return row;
}
