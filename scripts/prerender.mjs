// LicitaClima — prerender estático de las páginas públicas.
//
// Genera HTML estático por ruta pública a partir de la build de Vite
// (apps/web/dist/index.html), con el contenido real de cada página
// (incluidos los datos reales del pull de 30 días en /muestra y /cobertura).
// No se sirve una SPA vacía a buscadores ni se hace render distinto para
// bots: el mismo HTML estático lo recibe todo el mundo y React lo hidrata.
//
// Uso: se ejecuta al final de `pnpm --filter @licitaclima/web build`, o bien:
//   node scripts/prerender.mjs
//
// NOTA: el dominio canónico (LICITACLIMA_SITE_URL) está pendiente de
// confirmación por Jon; el valor por defecto es solo un marcador.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'apps', 'web', 'dist');
export const SITE_URL = (process.env.LICITACLIMA_SITE_URL ?? 'https://licitaclima.es').replace(/\/$/, '');

const MENSAJE_PRINCIPAL =
  'Encuentra licitaciones de climatización que encajan con tu empresa y entiende sus requisitos antes de dedicar tiempo a preparar una oferta';

/** Rutas públicas prerenderizadas: path, título, descripción y cuerpo estático. */
export const PUBLIC_ROUTES = [
  {
    path: '/',
    title: 'LicitaClima — Licitaciones de climatización para tu empresa',
    description: MENSAJE_PRINCIPAL + '.',
    body: `<h1>${MENSAJE_PRINCIPAL}</h1>
<p>LicitaClima localiza licitaciones públicas españolas de climatización, lee los pliegos y te explica qué piden, con referencias verificables al documento, la página y el fragmento.</p>
<p>Plan único: 49 €/mes + impuestos · 3 provincias · 10 análisis personalizados al mes · 100 consultas de chat por periodo. Resumen semanal + alertas.</p>
<p><a href="/muestra">Ver una muestra real sin registro</a> · <a href="/precios">Ver precios</a> · <a href="/como-funciona">Cómo funciona</a></p>
<h2>Un ejemplo real de la ventana de validación</h2>
<p>Expediente PSS/2026/0000130740 — Servicios de mantenimiento integral de las instalaciones de climatización, frigoríficas y de agua caliente sanitaria de los centros adscritos a la Vicepresidencia y Consejería de Desregulación, Servicios Sociales y Familia en Badajoz. Publicado el 13 de noviembre de 2026. Valor estimado: 42.884,99 €. Presupuesto base sin IVA: 35.737,49 €. Plazo: 24 de noviembre de 2026.</p>`,
  },
  {
    path: '/como-funciona',
    title: 'Cómo funciona — LicitaClima',
    description:
      'Muestra sin registro, onboarding guiado, selección semanal, análisis personalizado con evidencias y chat con citas. Así funciona LicitaClima.',
    body: `<h1>Cómo funciona</h1>
<p>LicitaClima convierte los anuncios oficiales de contratación pública en oportunidades comprensibles para tu empresa, con evidencias verificables en cada afirmación.</p>
<ol><li>Muestra sin registro con tu actividad y tu provincia.</li><li>Registro con magic link (un solo uso, 15 minutos).</li><li>Onboarding guiado y formulario editable, con resumen para confirmación.</li><li>Resumen semanal + alertas cuando hay novedad en tus provincias.</li><li>Análisis personalizado con evidencias: documento, página y fragmento.</li><li>Chat con citas sobre los documentos del expediente.</li><li>Decides tú: pendiente, a estudiar, descartada o presentada.</li></ol>`,
  },
  {
    path: '/precios',
    title: 'Precios — LicitaClima',
    description:
      'Plan único: 49 €/mes + impuestos. 1 usuario, 1 perfil, 3 provincias, 10 análisis personalizados al mes y 100 consultas de chat por periodo.',
    body: `<h1>Precios</h1>
<p><strong>49 €/mes + impuestos</strong>. Un único plan: 1 usuario, 1 perfil de empresa, hasta 3 provincias, 10 análisis personalizados completos al mes, 100 consultas de chat por periodo, resumen semanal + alertas, vigilancia de rectificaciones, favoritos, estados personales y exportación PDF del análisis.</p>
<p>Muestra gratuita: una oportunidad real, sin tarjeta y sin registro. Cancelar mantiene el acceso hasta el final del periodo pagado.</p>`,
  },
  {
    path: '/muestra',
    title: 'Muestra gratuita — LicitaClima',
    description:
      'Una oportunidad real de climatización, sin registro y sin tarjeta. Expediente PSS/2026/0000130740 de Badajoz y otras aperturas reales de la ventana 15 oct – 14 nov 2026.',
    body: `<h1>Muestra gratuita</h1>
<p>Una oportunidad real, sin registro y sin tarjeta. Datos reales de la ventana de validación (15 oct – 14 nov 2026), procedentes de los feeds oficiales 643 y 1044.</p>
<h2>Expediente PSS/2026/0000130740 — Badajoz</h2>
<p>Servicios de mantenimiento integral de las instalaciones de climatización, frigoríficas y de agua caliente sanitaria de los centros adscritos a la Vicepresidencia y Consejería de Desregulación, Servicios Sociales y Familia en Badajoz.</p>
<p>Órgano: Servicio de Coordinación Territorial. Publicado el 13 de noviembre de 2026. Plazo: 24 de noviembre de 2026. Valor estimado: 42.884,99 €. Presupuesto base sin IVA: 35.737,49 €. CPV 50720000 y 50730000. 5 documentos.</p>
<p><a href="https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&amp;idEvl=QT1TZUxjkwM7%2B9FIQYNjeQ%3D%3D">Ver anuncio oficial</a></p>
<p>Otras aperturas reales de la muestra: PSS/2026/0000099250 (Cáceres, valor estimado 486.764,26 €), 78/26 (Cádiz, 35.700 €), 26/152 OB (Santa Cruz de Tenerife, 859.275,12 €), PASA 1_2027 (Illes Balears, 6.611,57 €) y 2026/17/SUBM/OSA/CLIMA_PALAF (Girona, 34.843,44 €). Los plazos corresponden a la ventana de validación y pueden estar vencidos.</p>`,
  },
  {
    path: '/cobertura',
    title: 'Cobertura — LicitaClima',
    description:
      'Fuentes 643 y 1044 de la Plataforma de Contratación del Sector Público. 147 aperturas de núcleo en la ventana 15 oct – 14 nov 2026. Sin cobertura exhaustiva de plataformas autonómicas.',
    body: `<h1>Cobertura</h1>
<p>LicitaClima cubre las licitaciones publicadas en la Plataforma de Contratación del Sector Público a través de dos conjuntos oficiales, excluyendo los contratos menores. No afirmamos cobertura exhaustiva de las plataformas autonómicas.</p>
<h2>Fuentes cubiertas</h2>
<p>643 — Licitaciones de perfiles de contratante (158 aperturas de nicho en la ventana). 1044 — Plataformas agregadas sin menores (38 aperturas de nicho en la ventana).</p>
<h2>Volumen observado (15 oct – 14 nov 2026)</h2>
<p>90.049 entradas Atom descargadas, 57.648 expedientes únicos, 913 expedientes del nicho, 196 aperturas publicadas del nicho, 147 aperturas de núcleo y 156 publicables (núcleo + limítrofe). Última sincronización del pull de validación: 14 nov 2026. La ingesta automática cada 6 h está pendiente de despliegue.</p>
<p>Provincias con más aperturas publicables: Madrid 21, Alicante 10, Valladolid 8, Barcelona 8, Sevilla 7.</p>`,
  },
  {
    path: '/faq',
    title: 'Preguntas frecuentes — LicitaClima',
    description:
      '¿La muestra es gratuita? ¿Cuánto cuesta? ¿Cada cuánto recibo el resumen? ¿Cubrís todas las licitaciones de España? Respuestas.',
    body: `<h1>Preguntas frecuentes</h1>
<h2>¿La muestra es gratuita de verdad?</h2><p>Sí: una oportunidad real, sin registro y sin tarjeta, con límites contra el abuso.</p>
<h2>¿Cuánto cuesta?</h2><p>49 € al mes + impuestos. Un usuario, un perfil, hasta 3 provincias, 10 análisis al mes y 100 consultas de chat por periodo.</p>
<h2>¿Cada cuánto recibo el resumen?</h2><p>Resumen semanal + alertas cuando hay novedad en tus provincias. No enviamos resúmenes diarios ni mensajes vacíos.</p>
<h2>¿Cubrís todas las licitaciones de España?</h2><p>No. Cubrimos los conjuntos oficiales 643 y 1044 de la Plataforma de Contratación del Sector Público, sin contratos menores. No afirmamos cobertura exhaustiva de las plataformas autonómicas.</p>
<h2>¿Me garantiza ganar licitaciones?</h2><p>No. LicitaClima no promete ventas, adjudicaciones ni probabilidad de ganar.</p>`,
  },
  {
    path: '/contacto',
    title: 'Contacto — LicitaClima',
    description:
      'Preguntas sobre el servicio, la cobertura de tu provincia o la contratación. El correo de contacto se publicará cuando esté configurada la cuenta dedicada.',
    body: `<h1>Contacto</h1>
<p>Escríbenos para preguntar por el servicio, la cobertura de tu provincia o la contratación. La dirección de correo de contacto está pendiente de configurar (cuenta dedicada, Fase D).</p>`,
  },
  {
    path: '/legal/condiciones',
    title: 'Condiciones de contratación — LicitaClima',
    description: 'Condiciones de contratación de LicitaClima. Texto pendiente de revisión legal y fiscal.',
    body: `<h1>Condiciones de contratación</h1>
<p><strong>PENDIENTE DE REVISIÓN.</strong> Este texto es una plantilla sin datos comerciales reales y no debe considerarse vigente hasta su revisión legal y fiscal.</p>
<p>Plan único: 49 €/mes + impuestos. El servicio no presenta ofertas, no firma documentos ni garantiza adjudicaciones. Cancelar mantiene el acceso hasta el final del periodo pagado.</p>`,
  },
  {
    path: '/legal/privacidad',
    title: 'Política de privacidad — LicitaClima',
    description: 'Política de privacidad de LicitaClima. Texto pendiente de revisión.',
    body: `<h1>Política de privacidad</h1>
<p><strong>PENDIENTE DE REVISIÓN.</strong> Este texto es una plantilla sin datos del responsable y no debe considerarse vigente hasta su revisión.</p>
<p>Tratamos el correo, el perfil de empresa declarado, las oportunidades seguidas y los consentimientos (con versión del texto y fecha). Los pagos se tratan a través de Stripe; no almacenamos tarjetas.</p>`,
  },
  {
    path: '/legal/consentimiento',
    title: 'Consentimiento — LicitaClima',
    description: 'Consentimiento para correo comercial y analítica en LicitaClima. Texto pendiente de revisión.',
    body: `<h1>Consentimiento</h1>
<p><strong>PENDIENTE DE REVISIÓN.</strong> Este texto es una plantilla y no debe considerarse vigente hasta su revisión.</p>
<p>El correo comercial solo se envía con consentimiento separado, opcional, no premarcado y registrado con la versión del texto y la fecha. La baja de marketing no cancela las comunicaciones necesarias de cuenta.</p>`,
  },
];

export function buildPageHtml(shell, route) {
  let html = shell;
  const canonical = `${SITE_URL}${route.path === '/' ? '/' : `${route.path}/`}`;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${route.title}</title>`);
  // La etiqueta description puede ocupar varias líneas en la plantilla.
  html = html.replace(
    /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
    `<meta name="description" content="${route.description.replace(/"/g, '&quot;')}" />`,
  );
  html = html.replace(
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/,
    `<link rel="canonical" href="${canonical}" />`,
  );
  const prerendered = `<!-- Contenido estático prerenderizado (scripts/prerender.mjs). React hidrata esta página al cargar. -->\n<main>${route.body}</main>`;
  html = html.replace('<div id="root"></div>', `<div id="root">${prerendered}</div>`);
  return html;
}

export async function prerender() {
  const shell = await readFile(join(DIST, 'index.html'), 'utf8');
  if (!shell.includes('<div id="root"></div>')) {
    throw new Error('La plantilla dist/index.html no contiene <div id="root"></div>; ejecuta `vite build` antes.');
  }
  for (const route of PUBLIC_ROUTES) {
    const dir = route.path === '/' ? DIST : join(DIST, ...route.path.split('/').filter(Boolean));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.html'), buildPageHtml(shell, route), 'utf8');
    console.log(`prerender: ${route.path} -> ${join(dir, 'index.html')}`);
  }
  // sitemap.xml (solo páginas públicas con contenido real; sin miles de páginas vacías)
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${PUBLIC_ROUTES.map(
    (r) => `  <url><loc>${SITE_URL}${r.path === '/' ? '/' : `${r.path}/`}</loc></url>`,
  ).join('\n')}\n</urlset>\n`;
  await writeFile(join(DIST, 'sitemap.xml'), sitemap, 'utf8');
  await writeFile(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}/sitemap.xml\n`, 'utf8');
  console.log(`prerender: sitemap.xml + robots.txt (${PUBLIC_ROUTES.length} rutas)`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  prerender().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
