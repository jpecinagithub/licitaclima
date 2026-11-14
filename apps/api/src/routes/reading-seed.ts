// Helpers de siembra para los tests de la API de lectura (SOLO tests).
// Insertan expedientes reales en la BD de test (PostgreSQL real, por fichero).
import { eq } from 'drizzle-orm';
import type { Db } from '@licitaclima/db';
import { documents, extractedPages, sources, tenders } from '@licitaclima/db';

export async function seedSource(db: Db, key = 'feed643'): Promise<string> {
  const [row] = await db
    .insert(sources)
    .values({
      key,
      name: key === 'feed643' ? 'Perfiles en PLACSP (643)' : 'Plataformas agregadas sin menores (1044)',
      url: `https://example.es/${key}.atom`,
      kind: 'atom',
      active: true,
    })
    .onConflictDoNothing()
    .returning();
  if (row) return row.id;
  const [existing] = await db.select().from(sources).where(eq(sources.key, key)).limit(1);
  return existing.id;
}

export interface SeedTenderOpts {
  expediente?: string;
  organo?: string;
  objeto?: string;
  estado?: string;
  claseNicho?: string | null;
  provincia?: string | null;
  urlOficial?: string;
  valorEstimado?: string | null;
  presupuestoBaseSinIva?: string | null;
  presupuestoBaseConIva?: string | null;
  publishedAt?: Date | null;
  deadlineAt?: Date | null;
  deadlineDateOnly?: boolean;
  sourceKey?: string;
}

export async function seedTender(
  db: Db,
  sourceId: string,
  opts: SeedTenderOpts = {},
): Promise<typeof tenders.$inferSelect> {
  const expediente = opts.expediente ?? `TEST-${Math.random().toString(36).slice(2, 8)}`;
  const [row] = await db
    .insert(tenders)
    .values({
      sourceId,
      sourceKey: opts.sourceKey ?? 'feed643',
      externalId: `test:${expediente}`,
      expediente,
      organo: opts.organo ?? 'Ayuntamiento de Test',
      objeto: opts.objeto ?? 'Mantenimiento e instalación de climatización',
      estado: opts.estado ?? 'PUB',
      claseNicho: opts.claseNicho ?? 'nucleo',
      provincia: opts.provincia ?? 'Madrid',
      provinciaPorVerificar: false,
      cpv: ['45331000'],
      urlOficial: opts.urlOficial ?? 'https://example.es/licitacion',
      publishedAt: opts.publishedAt ?? new Date('2026-11-10T09:00:00Z'),
      modifiedAt: new Date('2026-11-10T09:00:00Z'),
      deadlineAt: opts.deadlineAt ?? new Date('2026-12-03T14:00:00Z'),
      deadlineDateOnly: opts.deadlineDateOnly ?? false,
      valorEstimado: opts.valorEstimado ?? '100000',
      presupuestoBaseSinIva: opts.presupuestoBaseSinIva ?? '90000',
      presupuestoBaseConIva: opts.presupuestoBaseConIva ?? '108900',
      duracion: '12 meses',
      pipeline: 'descubierto',
    })
    .returning();
  return row;
}

export async function seedDocumentWithPages(
  db: Db,
  tenderId: string,
  pages: { pageNumber: number; textContent: string }[],
): Promise<string> {
  const sha = 'a'.repeat(64);
  const [doc] = await db
    .insert(documents)
    .values({
      tenderId,
      url: 'https://example.es/pliego.pdf',
      filename: 'pliego.pdf',
      mime: 'application/pdf',
      sizeBytes: 12345,
      sha256: sha,
      status: 'downloaded',
    })
    .returning();
  for (const p of pages) {
    await db.insert(extractedPages).values({
      documentId: doc.id,
      pageNumber: p.pageNumber,
      textContent: p.textContent,
      charCount: p.textContent.length,
    });
  }
  return doc.id;
}
