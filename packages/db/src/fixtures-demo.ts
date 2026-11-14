// LicitaClima — fixtures sintéticos DEMO (Fase C).
//
// ⚠️ DATOS INVENTADOS, solo para desarrollo y tests. Van marcados DEMO en
// procedencia y en la interfaz, y NUNCA se mezclan con los datos reales del
// seed (packages/db/src/seed.ts no los carga salvo --demo explícito).
// Si un fixture aparece en una pantalla, debe llevar la etiqueta DEMO visible.

import type { Pool } from 'pg';

export const DEMO_TENDERS = [
  {
    expediente: 'DEMO-2026-001',
    organo: 'Ayuntamiento DEMO de Villaficticia',
    objeto: 'DEMO — Mantenimiento de las instalaciones de climatización del polideportivo municipal',
    estado: 'PUB',
    provincia: 'Madrid',
    urlOficial: 'https://example.invalid/demo-001',
  },
  {
    expediente: 'DEMO-2026-002',
    organo: 'Diputación DEMO de Villaficticia',
    objeto: 'DEMO — Instalación de aire acondicionado en la biblioteca provincial',
    estado: 'PUB',
    provincia: 'Valladolid',
    urlOficial: 'https://example.invalid/demo-002',
  },
] as const;

export async function seedDemo(pool: Pool): Promise<{ insertados: number }> {
  const source = await pool.query("SELECT id FROM sources WHERE key = 'feed643'");
  if (source.rows.length === 0) throw new Error('fuente feed643 no existe: ejecuta antes el seed real');
  const sourceId = String(source.rows[0]['id']);
  let insertados = 0;
  for (const demo of DEMO_TENDERS) {
    const prev = await pool.query('SELECT id FROM tenders WHERE expediente = $1 AND organo = $2', [demo.expediente, demo.organo]);
    if (prev.rows.length > 0) continue;
    const inserted = await pool.query(
      `INSERT INTO tenders (id, source_id, source_key, external_id, expediente, organo, objeto, estado,
         clase_nicho, provincia, provincia_por_verificar, cpv, url_oficial, pipeline)
       VALUES (gen_random_uuid(), $1, 'feed643', $2, $3, $4, $5, $6, 'nucleo', $7, false, ARRAY['45331000'], $8, 'descubierto')
       RETURNING id`,
      [`DEMO:${demo.expediente}`, `DEMO:${demo.expediente}`, demo.expediente, demo.organo, demo.objeto, demo.estado, demo.provincia, demo.urlOficial],
    );
    const tenderId = String(inserted.rows[0]['id']);
    await pool.query(
      'INSERT INTO tender_versions (id, tender_id, version, data, change_kind) VALUES (gen_random_uuid(), $1, 1, $2, $3)',
      [tenderId, JSON.stringify({ ...demo, procedencia: 'DEMO (sintético, inventado para desarrollo — no es una licitación real)' }), 'created'],
    );
    insertados += 1;
  }
  return { insertados };
}
