// LicitaClima — análisis personalizado (block/api-lectura).
//
// El API encola `personalized-analyze` cuando un cliente solicita el análisis
// de un expediente (POST /opportunities/:id/analyses, con cuota ya reservada).
// Este trabajo:
//   1. Si no hay extracción determinista, ejecuta la cadena completa en línea
//      (documents → extract) con los pliegos oficiales; si el expediente no
//      tiene documentos, el análisis queda `failed` y la cuota se LIBERA.
//   2. Construye la matriz de encaje con el perfil declarado de la
//      organización (runAnalyze) y guarda el match por tenant.
//   3. Marca el análisis personalizado `done` con la matriz y CONFIRMA la
//      cuota (fila `confirm` en usage_ledger, idempotente).
// Reintentos: si un intento falla tras liberar la cuota y un reintento
// posterior tiene éxito, la liberación se elimina antes de confirmar, así
// que la contabilidad final es siempre: entregado = 1 unidad consumida,
// fallido definitivo = 0. El proveedor es determinista (sin LLM).

import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '@licitaclima/db';
import {
  companyProfiles,
  matches,
  personalizedAnalyses,
  usageLedger,
} from '@licitaclima/db';
import type { CompanyProfile } from '@licitaclima/domain';
import type { WorkerStore } from '../db.js';
import { runAnalyze } from './analyze.js';
import { runDocuments, type DocumentStorage } from './documents.js';
import { runExtract } from './extract.js';

export interface PersonalizedAnalyzeOpts {
  tenderId: string;
  organizationId: string;
  personalizedAnalysisId: string;
}

export interface PersonalizedAnalyzeResult {
  personalizedAnalysisId: string;
  tenderId: string;
  status: 'done' | 'failed';
  recomendacion: string | null;
}

async function settleQuotaSuccess(db: Db, analysis: typeof personalizedAnalyses.$inferSelect): Promise<void> {
  const key = analysis.idempotencyKey;
  if (!key) return;
  const [reserve] = await db
    .select()
    .from(usageLedger)
    .where(eq(usageLedger.idempotencyKey, key))
    .limit(1);
  if (!reserve) return;
  // Un reintento anterior pudo liberar la cuota al fallar: se elimina esa
  // liberación para que el análisis entregado cuente su unidad.
  await db.delete(usageLedger).where(eq(usageLedger.idempotencyKey, `release:${key}`));
  await db
    .insert(usageLedger)
    .values({
      organizationId: reserve.organizationId,
      subscriptionId: reserve.subscriptionId,
      kind: reserve.kind,
      referenceId: reserve.referenceId,
      periodStart: reserve.periodStart,
      periodEnd: reserve.periodEnd,
      units: 0,
      action: 'confirm',
      idempotencyKey: `confirm:${key}`,
    })
    .onConflictDoNothing();
}

async function releaseQuotaForAnalysis(db: Db, analysis: typeof personalizedAnalyses.$inferSelect): Promise<void> {
  const key = analysis.idempotencyKey;
  if (!key) return;
  const [reserve] = await db
    .select()
    .from(usageLedger)
    .where(eq(usageLedger.idempotencyKey, key))
    .limit(1);
  if (!reserve || reserve.action !== 'reserve') return;
  await db
    .insert(usageLedger)
    .values({
      organizationId: reserve.organizationId,
      subscriptionId: reserve.subscriptionId,
      kind: reserve.kind,
      referenceId: reserve.referenceId,
      periodStart: reserve.periodStart,
      periodEnd: reserve.periodEnd,
      units: 1,
      action: 'release',
      idempotencyKey: `release:${key}`,
    })
    .onConflictDoNothing();
}

export async function runPersonalizedAnalyze(
  store: WorkerStore,
  storage: DocumentStorage,
  opts: PersonalizedAnalyzeOpts,
  db?: Db,
): Promise<PersonalizedAnalyzeResult> {
  if (!db) throw new Error('personalized-analyze requiere DATABASE_URL (Db Drizzle no disponible)');
  const [analysis] = await db
    .select()
    .from(personalizedAnalyses)
    .where(eq(personalizedAnalyses.id, opts.personalizedAnalysisId))
    .limit(1);
  if (!analysis) throw new Error(`análisis personalizado desconocido: ${opts.personalizedAnalysisId}`);
  if (analysis.organizationId !== opts.organizationId || analysis.tenderId !== opts.tenderId) {
    throw new Error('el análisis no corresponde a la organización o al expediente del trabajo');
  }
  // Idempotente: un reintento tras la entrega no vuelve a consumir ni a trabajar.
  if (analysis.status === 'done') {
    const matrix = (analysis.data ?? {}) as { recomendacion?: string };
    return {
      personalizedAnalysisId: analysis.id,
      tenderId: analysis.tenderId,
      status: 'done',
      recomendacion: matrix.recomendacion ?? null,
    };
  }
  const [profileRow] = await db
    .select()
    .from(companyProfiles)
    .where(eq(companyProfiles.organizationId, opts.organizationId))
    .limit(1);
  const profile: CompanyProfile | null = profileRow
    ? {
        actividad: profileRow.actividad,
        provincias: profileRow.provincias ?? [],
        radioKm: profileRow.radioKm,
        tamanoContratosOrientativo: profileRow.tamanoContratosOrientativo,
        capacidadOperativa: profileRow.capacidadOperativa,
        experiencia: profileRow.experiencia,
        certificacionesDeclaradas: profileRow.certificacionesDeclaradas ?? [],
        preferencias: profileRow.preferencias,
      }
    : null;

  try {
    let extraction = await store.getExtraction(opts.tenderId);
    if (!extraction) {
      await runDocuments(store, storage, { tenderId: opts.tenderId });
      extraction = await store.getExtraction(opts.tenderId);
      if (!extraction) {
        await runExtract(store, storage, { tenderId: opts.tenderId });
        extraction = await store.getExtraction(opts.tenderId);
      }
    }
    if (!extraction) {
      throw new Error(
        `sin extracción determinista para ${opts.tenderId}: sin documentos descargables o fuente no disponible`,
      );
    }
    const analyzed = await runAnalyze(store, {
      tenderId: opts.tenderId,
      organizationId: opts.organizationId,
      profile,
    });
    const [match] = await db
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.organizationId, opts.organizationId),
          eq(matches.tenderId, opts.tenderId),
        ),
      )
      .orderBy(desc(matches.recalculatedAt))
      .limit(1);
    await db
      .update(personalizedAnalyses)
      .set({
        status: 'done',
        data: match?.explanation ?? null,
        provider: 'determinista-v1 (sin LLM)',
        model: null,
        updatedAt: new Date(),
      })
      .where(eq(personalizedAnalyses.id, analysis.id));
    await settleQuotaSuccess(db, analysis);
    return {
      personalizedAnalysisId: analysis.id,
      tenderId: opts.tenderId,
      status: 'done',
      recomendacion: analyzed.recomendacion,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(personalizedAnalyses)
      .set({ status: 'failed', data: { error: message }, updatedAt: new Date() })
      .where(eq(personalizedAnalyses.id, analysis.id));
    await releaseQuotaForAnalysis(db, analysis);
    throw err;
  }
}
