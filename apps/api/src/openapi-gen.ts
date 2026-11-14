import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildOpenApiDocument } from './openapi.js';

/** Genera apps/api/openapi.json desde los esquemas Zod (ver src/openapi.ts). */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'openapi.json');
  writeFileSync(out, `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`, 'utf8');
  console.log(`OpenAPI generado en ${out}`);
}
