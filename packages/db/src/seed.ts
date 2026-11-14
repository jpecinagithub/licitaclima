// LicitaClima — seed con datos REALES del pull de 30 días (Fase C).
//
// Fuente: data/volume-30d/niche_30d.json — 913 expedientes de nicho,
// ventana 2026-10-15 → 2026-11-14, feeds 643 + 1044, regla de Fase A
// (5 CPV + 9 palabras clave), clase_final tras revisión manual título a
// título (volume-30d.md §1.2). Cada fila sembrada documenta su procedencia
// en tender_versions.data (ventana, fuente, clase_final y motivo manual).
//
// Esquema: el Drizzle de FASE B (tenders + tender_versions + sources +
// ingestion_runs). El expediente NO tiene external_id Atom en el JSON (el
// pull guardó agregados, no los <id>), así que external_id es
// `seed-30d:<expediente>` (estable y documentado); la deduplicación con la
// ingesta en vivo se hace por (expediente+órgano), que el worker comprueba
// antes de insertar por external_id.
//
// Los 913 se siembran TODOS (núcleo 709, limítrofe 42, marginal 162 —
// clases sobre el total del nicho, no solo aperturas). Los marginales quedan
// en pipeline revision_requerida y NO se publican. Los no-PUB quedan en
// validado (no son oportunidades abiertas). Solo núcleo/limítrofe PUB quedan
// en descubierto para que el worker los mueva por documentos/extracción.
//
// Fixtures sintéticos: NO se mezclan aquí. Viven aparte en
// ./fixtures-demo.ts, marcados DEMO, y solo se siembran con --demo.
//
// Uso:
//   DATABASE_URL=postgres://licitaclima:licitaclima@localhost:5432/licitaclima \
//     pnpm --filter @licitaclima/db seed
// Requiere PostgreSQL real con el esquema de Fase B aplicado.
// Idempotente: re-ejecutar no duplica (se busca por expediente+órgano).

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { clasificarNicho, resolverProvincia } from '@licitaclima/domain';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SOURCE_PATH = join(ROOT, 'data', 'volume-30d', 'niche_30d.json');
const MANIFEST_PATH = join(ROOT, 'data', 'seed', 'seed-manifest.json');

export interface NicheRow {
  expediente: string;
  org: string;
  title: string;
  link: string;
  feeds: string[];
  status_final: string;
  first_pub: string;
  last_updated: string;
  deadline: string;
  deadline_time: string;
  prov: string;
  nuts: string;
  amt_est: string;
  amt_taxexcl: string;
  amt_total: string;
  cpv: string[];
  cpv_niche: string[];
  keywords: string[];
  n_doc_uris: number;
  n_lots: number;
  preclass: string;
  preclass_motivo: string;
  clase_final: string;
  motivo_manual: string;
  provincia: string;
}

const CLASE_FINAL_A_NICHO: Record<string, string> = {
  núcleo: 'nucleo',
  limítrofe: 'limitrofe',
  marginal: 'marginal',
};

export function loadNicheRows(path = SOURCE_PATH): NicheRow[] {
  const raw = readFileSync(path, 'utf-8');
  const rows = JSON.parse(raw) as NicheRow[];
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`seed vacío o inválido: ${path}`);
  }
  return rows;
}

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * Expediente del seed. El feed a veces trae ContractFolderID vacío (1 caso
 * en el pull de 30 días: Navarra, PRE, feed 1044): se deriva un identificador
 * trazable `SIN-EXPEDIENTE-<sha256 del enlace>` y se deja constancia en
 * procedencia. Nunca se inventa un número de expediente real.
 */
export function expedienteSeed(row: NicheRow): string {
  if (row.expediente) return row.expediente;
  const hash = createHash('sha256').update(row.link).digest('hex').slice(0, 12);
  return `SIN-EXPEDIENTE-${hash}`;
}

/**
 * Fecha + hora del feed (hora local Europe/Madrid, sin offset) a ISO con el
 * offset correcto. Misma lógica que apps/worker/src/pg-store.ts (madridIso);
 * duplicada aquí porque el seed no depende del worker.
 */
export function madridIsoSeed(fecha: string | null, hora: string | null): string | null {
  if (!fecha || !hora) return null;
  const wall = `${fecha}T${hora.slice(0, 8)}`;
  for (const offset of ['+02:00', '+01:00']) {
    const iso = `${wall}${offset}`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) continue;
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Madrid',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(d);
    const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';
    if (`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}` === wall) return iso;
  }
  return `${wall}+01:00`;
}

/** Pipeline inicial del seed: marginal → revisión; resto no-PUB → validado; PUB núcleo/limítrofe → descubierto. */
export function pipelineInicialSeed(claseNicho: string, estado: string): string {
  if (claseNicho === 'marginal') return 'revision_requerida';
  if (estado !== 'PUB') return 'validado'; // no es una oportunidad abierta; no pasa por documentos
  return 'descubierto';
}

async function getOrCreateSource(client: { query: Pool['query'] }, key: string, name: string, url: string, kind: string): Promise<string> {
  const res = await client.query(
    `INSERT INTO sources (id, key, name, url, kind, active) VALUES (gen_random_uuid(), $1,$2,$3,$4,true)
     ON CONFLICT (key) DO UPDATE SET url = EXCLUDED.url RETURNING id`,
    [key, name, url, kind],
  );
  return String(res.rows[0]['id']);
}

export async function seed(pool: Pool, rows: NicheRow[]): Promise<{
  insertados: number;
  actualizados: number;
  porClase: Record<string, number>;
  porEstado: Record<string, number>;
  sinProvincia: number;
  provinciaPorVerificar: number;
}> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const source643 = await getOrCreateSource(client, 'feed643', 'Perfiles en PLACSP (643)', 'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom', 'atom');
    const source1044 = await getOrCreateSource(client, 'feed1044', 'Plataformas agregadas sin menores (1044)', 'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_1044/PlataformasAgregadasSinMenores.atom', 'atom');
    const sourceSeed = await getOrCreateSource(client, 'seed-30d', 'Seed pull 30 días (2026-10-15 → 2026-11-14)', '', 'seed');

    let insertados = 0;
    let actualizados = 0;
    const porClase: Record<string, number> = {};
    const porEstado: Record<string, number> = {};
    let sinProvincia = 0;
    let provinciaPorVerificar = 0;

    for (const row of rows) {
      const claseNicho = CLASE_FINAL_A_NICHO[row.clase_final] ?? 'marginal';
      const clasificacion = clasificarNicho(row.title, row.cpv);
      if (clasificacion.clase !== claseNicho && !row.motivo_manual) {
        console.warn(`[seed] ${row.expediente}: preclass=${clasificacion.clase} ≠ clase_final=${claseNicho} sin motivo_manual`);
      }
      const provincia = resolverProvincia({ titulo: row.title, nuts: row.nuts, nombreFeed: row.prov });
      if (provincia.provincia === null) sinProvincia += 1;
      if (provincia.provinciaPorVerificar) provinciaPorVerificar += 1;
      const expediente = expedienteSeed(row);
      const plazoFecha = row.deadline || null;
      const plazoHora = row.deadline_time || null;
      const procedencia = [
        'pull-30d 2026-10-15→2026-11-14',
        `feeds ${row.feeds.join('+')}`,
        `clase_final=${row.clase_final} (preclass=${row.preclass})`,
        row.motivo_manual ? `motivo_manual=${row.motivo_manual}` : null,
        `provincia_feed=${row.provincia}`,
        row.expediente ? null : 'expediente ausente en el feed (identificador derivado del enlace)',
      ]
        .filter(Boolean)
        .join(' · ');
      const snapshot = {
        expediente,
        organo: row.org,
        objeto: row.title,
        estado: row.status_final,
        valorEstimado: row.amt_est || null,
        presupuestoBaseSinIva: row.amt_taxexcl || null,
        presupuestoBaseConIva: row.amt_total || null,
        provincia: provincia.provincia,
        provinciaPorVerificar: provincia.provinciaPorVerificar,
        nuts: row.nuts || null,
        plazoFecha,
        plazoHora,
        plazoSoloFecha: plazoFecha !== null && plazoHora === null,
        cpv: row.cpv,
        cpvNicho: row.cpv_niche,
        keywords: row.keywords,
        claseNicho,
        claseManual: row.clase_final,
        motivoManual: row.motivo_manual || null,
        urlOficial: row.link,
        documentUris: [],
        notices: [],
        nDocUris: row.n_doc_uris,
        nLotes: row.n_lots,
        firstPubAt: row.first_pub || null,
        feedUpdatedAt: row.last_updated || null,
        procedencia,
      };
      const sourceId = row.feeds[0] === '643' ? source643 : source1044;
      const sourceKey = row.feeds[0] === '643' ? 'feed643' : 'feed1044';
      // El número de expediente se reutiliza entre órganos (4 casos en el
      // pull: p. ej. '62/2026' en Andújar y en Unión de Mutuas), así que el
      // external_id incluye un hash del órgano para ser único por
      // (expediente+órgano), igual que la deduplicación.
      const externalId = `seed-30d:${expediente}:${createHash('sha256').update(row.org).digest('hex').slice(0, 8)}`;

      // Deduplicación por (expediente+órgano) antes que por external_id: el
      // seed no conoce los <id> Atom del pull.
      const prev = await client.query(
        'SELECT id FROM tenders WHERE expediente = $1 AND organo = $2 LIMIT 1',
        [expediente, row.org],
      );
      let tenderId: string;
      if (prev.rows.length === 0) {
        const inserted = await client.query(
          `INSERT INTO tenders (id, source_id, source_key, external_id, expediente, organo, objeto, estado,
             clase_nicho, provincia, provincia_por_verificar, nuts, cpv, url_oficial,
             published_at, modified_at, deadline_at, deadline_date_only,
             valor_estimado, presupuesto_base_sin_iva, presupuesto_base_con_iva, currency,
             duracion, pipeline, content_hash)
           VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'EUR',NULL,$21,$22)
           RETURNING id`,
          [
            sourceId, sourceKey, externalId, expediente, row.org, row.title, row.status_final,
            claseNicho, provincia.provincia, provincia.provinciaPorVerificar, row.nuts || null, row.cpv, row.link,
            row.first_pub || null, row.last_updated || null,
            madridIsoSeed(plazoFecha, plazoHora), plazoFecha !== null && plazoHora === null,
            row.amt_est || null, row.amt_taxexcl || null, row.amt_total || null,
            pipelineInicialSeed(claseNicho, row.status_final),
            createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
          ],
        );
        tenderId = String(inserted.rows[0]['id']);
        await client.query(
          'INSERT INTO tender_versions (id, tender_id, version, data, change_kind) VALUES (gen_random_uuid(), $1, 1, $2, $3)',
          [tenderId, JSON.stringify(snapshot), 'created'],
        );
        insertados += 1;
      } else {
        tenderId = String(prev.rows[0]['id']);
        await client.query(
          `UPDATE tenders SET objeto=$2, estado=$3, clase_nicho=$4, provincia=$5,
             provincia_por_verificar=$6, nuts=$7, cpv=$8, url_oficial=$9,
             published_at=$10, modified_at=$11, deadline_at=$12, deadline_date_only=$13,
             valor_estimado=$14, presupuesto_base_sin_iva=$15, presupuesto_base_con_iva=$16,
             pipeline=$17, updated_at = now() WHERE id=$1`,
          [
            tenderId, row.title, row.status_final, claseNicho, provincia.provincia,
            provincia.provinciaPorVerificar, row.nuts || null, row.cpv, row.link,
            row.first_pub || null, row.last_updated || null,
            madridIsoSeed(plazoFecha, plazoHora), plazoFecha !== null && plazoHora === null,
            row.amt_est || null, row.amt_taxexcl || null, row.amt_total || null,
            pipelineInicialSeed(claseNicho, row.status_final),
          ],
        );
        const maxV = await client.query('SELECT COALESCE(MAX(version), 0) AS m FROM tender_versions WHERE tender_id = $1', [tenderId]);
        await client.query(
          'INSERT INTO tender_versions (id, tender_id, version, data, change_kind) VALUES (gen_random_uuid(), $1, $2, $3, $4) ON CONFLICT (tender_id, version) DO NOTHING',
          [tenderId, Number(maxV.rows[0]['m']) + 1, JSON.stringify(snapshot), 'rectification'],
        );
        actualizados += 1;
      }
      porClase[claseNicho] = (porClase[claseNicho] ?? 0) + 1;
      porEstado[row.status_final] = (porEstado[row.status_final] ?? 0) + 1;
    }

    await client.query(
      `INSERT INTO ingestion_runs (id, source_id, status, cursor_checkpoint, entries_seen, entries_new, entries_updated, entries_skipped, error, finished_at)
       VALUES (gen_random_uuid(), $1, 'ok', $2, 90049, $3, $4, 0, NULL, now())`,
      [
        sourceSeed,
        JSON.stringify({ ventana: '2026-10-15 → 2026-11-14', paginas: 185, fuente: 'data/volume-30d/niche_30d.json' }),
        insertados,
        actualizados,
      ],
    );
    await client.query('COMMIT');
    return { insertados, actualizados, porClase, porEstado, sinProvincia, provinciaPorVerificar };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL no definida. Ejemplo: postgres://licitaclima:licitaclima@localhost:5432/licitaclima');
  }
  const withDemo = process.argv.includes('--demo');
  const rows = loadNicheRows();
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const resumen = await seed(pool, rows);
    console.log(JSON.stringify({ fuente: 'data/volume-30d/niche_30d.json', filas: rows.length, ...resumen }, null, 2));
    mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
    writeFileSync(
      MANIFEST_PATH,
      JSON.stringify(
        {
          fuente: 'data/volume-30d/niche_30d.json',
          sha256Fuente: sha256File(SOURCE_PATH),
          ventana: '2026-10-15 → 2026-11-14',
          filas: rows.length,
          sembradoEn: new Date().toISOString(),
          ...resumen,
        },
        null,
        2,
      ),
    );
    console.log(`manifiesto: ${MANIFEST_PATH}`);
    if (withDemo) {
      const { seedDemo } = await import('./fixtures-demo.js');
      const demo = await seedDemo(pool);
      console.log(JSON.stringify({ demo }, null, 2));
    }
  } finally {
    await pool.end();
  }
}

const isMain = process.argv[1]?.endsWith('seed.ts');
if (isMain) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
