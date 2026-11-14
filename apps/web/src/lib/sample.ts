// Datos REALES del pull de 30 días (Fase A), fuente:
// data/volume-30d/niche_30d.json y data/volume-30d/summary_30d.json
// Ventana: 15 oct – 14 nov 2026. Solo expedientes PUB de clase núcleo.
// Estos datos se muestran en la página pública /muestra y en /cobertura.
// NO son datos inventados ni de demostración: cada campo procede del feed Atom
// oficial (643/1044). Los plazos ya vencidos se muestran como tales: son
// oportunidades históricas de la ventana de validación, no ofertas vigentes.

import type { Opportunity } from './types.js';

export const PULL_VENTANA = '15 oct – 14 nov 2026';
export const PULL_ULTIMA_SINCRONIZACION = '14 nov 2026';

export const COVERAGE = {
  ventana: PULL_VENTANA,
  filasDescargadas: 90049,
  expedientesUnicos: 57648,
  nichoUnico: 913,
  aperturasPub: 196,
  aperturasNucleo: 147,
  aperturasNucleoAmplio: 156, // núcleo + limítrofe (publicables)
  aperturasPorFeed: { feed643: 158, feed1044: 38 },
  ultimaSincronizacion: PULL_ULTIMA_SINCRONIZACION,
  // La ingesta automática cada 6 h está pendiente de despliegue (Fase C).
  ingestionAutomatica: 'Pendiente de despliegue',
} as const;

/** Aperturas de núcleo por provincia en la ventana (solo PUB núcleo+limítrofe). */
export const APERTURAS_POR_PROVINCIA: { provincia: string; aperturas: number }[] = [
  { provincia: 'Madrid', aperturas: 21 },
  { provincia: 'Alicante', aperturas: 10 },
  { provincia: 'Valladolid', aperturas: 8 },
  { provincia: 'Barcelona', aperturas: 8 },
  { provincia: 'Sevilla', aperturas: 7 },
  { provincia: 'Málaga', aperturas: 5 },
  { provincia: 'Murcia', aperturas: 5 },
  { provincia: 'Granada', aperturas: 5 },
  { provincia: 'Santa Cruz de Tenerife', aperturas: 4 },
  { provincia: 'Badajoz', aperturas: 4 },
  { provincia: 'Ciudad Real', aperturas: 4 },
  { provincia: 'Zaragoza', aperturas: 4 },
  { provincia: 'Pontevedra', aperturas: 4 },
  { provincia: 'Valencia', aperturas: 4 },
  { provincia: 'A Coruña', aperturas: 4 },
  { provincia: 'Girona', aperturas: 3 },
  { provincia: 'Asturias', aperturas: 3 },
  { provincia: 'Burgos', aperturas: 3 },
  { provincia: 'Castellón', aperturas: 3 },
  { provincia: 'Almería', aperturas: 3 },
  { provincia: 'Cádiz', aperturas: 2 },
  { provincia: 'Illes Balears', aperturas: 2 },
  { provincia: 'Lleida', aperturas: 2 },
  { provincia: 'Toledo', aperturas: 2 },
  { provincia: 'Palencia', aperturas: 2 },
  { provincia: 'Córdoba', aperturas: 2 },
  { provincia: 'Navarra', aperturas: 2 },
  { provincia: 'Bizkaia', aperturas: 2 },
  { provincia: 'Soria', aperturas: 1 },
  { provincia: 'Tarragona', aperturas: 1 },
  { provincia: 'Salamanca', aperturas: 1 },
  { provincia: 'Teruel', aperturas: 1 },
  { provincia: 'Lugo', aperturas: 1 },
  { provincia: 'Huelva', aperturas: 1 },
  { provincia: 'Las Palmas', aperturas: 1 },
  { provincia: 'Huesca', aperturas: 1 },
  { provincia: 'La Rioja', aperturas: 1 },
  { provincia: 'Cáceres', aperturas: 1 },
  { provincia: 'Álava', aperturas: 1 },
  { provincia: 'Guadalajara', aperturas: 1 },
  { provincia: 'Gipuzkoa', aperturas: 1 },
  { provincia: 'León', aperturas: 1 },
  { provincia: 'Sin provincia asignada', aperturas: 14 },
];

/** Muestra pública: 6 expedientes reales PUB de clase núcleo. */
export const SAMPLE_OPPORTUNITIES: Opportunity[] = [
  {
    id: 'PSS/2026/0000130740',
    expediente: 'PSS/2026/0000130740',
    organo: 'Servicio de Coordinación Territorial',
    titulo:
      'Servicios de mantenimiento integral de las instalaciones de climatización, frigoríficas y de agua caliente sanitaria de los centros adscritos a la Vicepresidencia y Consejería de Desregulación, Servicios Sociales y Familia en Badajoz.',
    urlOficial:
      'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=QT1TZUxjkwM7%2B9FIQYNjeQ%3D%3D',
    fuente: '643',
    estado: 'PUB',
    clase: 'núcleo',
    provincia: 'Badajoz',
    fechaPublicacion: '2026-11-13T17:26:16+01:00',
    fechaModificacion: '2026-11-13T17:26:16+01:00',
    plazo: '2026-11-24',
    plazoHora: '23:59:00',
    valorEstimadoEur: 42884.99,
    presupuestoBaseSinIvaEur: 35737.49,
    presupuestoBaseConIvaEur: 43242.36,
    cpv: ['50720000', '50730000'],
    nDocumentos: 5,
    nLotes: 0,
  },
  {
    id: 'PSS/2026/0000099250',
    expediente: 'PSS/2026/0000099250',
    organo:
      'Servicio Extremeño de Promoción de la Autonomía y Atención a la Dependencia (SEPAD). Gerencia Territorial de Cáceres',
    titulo:
      'Servicio del mantenimiento integral de las instalaciones de climatización y frigoríficas y generación de agua caliente sanitaria (ACS) para diversos centros adscritos a la Gerencia territorial del Servicio Extremeño de Promoción de la Autonomía y Atención a la Dependencia (SEPAD) de la provincia de Cáceres.',
    urlOficial:
      'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=zI8LcPDbNzRSYrkJkLlFdw%3D%3D',
    fuente: '643',
    estado: 'PUB',
    clase: 'núcleo',
    provincia: 'Cáceres',
    fechaPublicacion: '2026-11-03T12:04:49+01:00',
    fechaModificacion: '2026-11-03T12:04:49+01:00',
    plazo: '2026-11-30',
    plazoHora: '23:59:00',
    valorEstimadoEur: 486764.26,
    presupuestoBaseSinIvaEur: 243382.13,
    presupuestoBaseConIvaEur: 294492.38,
    cpv: ['50720000', '50730000'],
    nDocumentos: 14,
    nLotes: 0,
  },
  {
    id: '78/26',
    expediente: '78/26',
    organo: 'Alcaldía del Ayuntamiento de Los Barrios (Cádiz)',
    titulo:
      'Contrato de servicio para la redacción de proyectos eléctricos para ampliación de la instalación eléctrica de baja tensión para el sistema de climatización en los centros de educación infantil y primaria del municipio de Los Barrios (Cádiz), responsable del contrato de obras y dirección facultativa.',
    urlOficial:
      'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=icZvKODnjthPpzdqOdhuWg%3D%3D',
    fuente: '643',
    estado: 'PUB',
    clase: 'núcleo',
    provincia: 'Cádiz',
    fechaPublicacion: '2026-10-15T09:43:47+02:00',
    fechaModificacion: '2026-10-15T09:43:47+02:00',
    plazo: '2026-10-30',
    plazoHora: '23:59:00',
    valorEstimadoEur: 35700,
    presupuestoBaseSinIvaEur: 35700,
    presupuestoBaseConIvaEur: 43197,
    cpv: ['71240000'],
    nDocumentos: 4,
    nLotes: 0,
  },
  {
    id: '26/152 OB',
    expediente: '26/152 OB',
    organo: 'Gerencia de Infraestructuras y Equipamientos de Cultura O.A',
    titulo:
      'Obras de instalaciones eléctricas en baja tensión, de climatización y renovación de aire y de ascensor en el Archivo Histórico Provincial de Las Palmas.',
    urlOficial:
      'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=rmibPPVrKPUl5NjlNci%2BtA%3D%3D',
    fuente: '643',
    estado: 'PUB',
    clase: 'núcleo',
    provincia: 'Santa Cruz de Tenerife',
    fechaPublicacion: '2026-10-15T10:26:10+02:00',
    fechaModificacion: '2026-10-15T10:26:10+02:00',
    plazo: '2026-11-17',
    plazoHora: '18:00:00',
    valorEstimadoEur: 859275.12,
    presupuestoBaseSinIvaEur: 859275.12,
    presupuestoBaseConIvaEur: 919424.38,
    cpv: ['45200000'],
    nDocumentos: 9,
    nLotes: 0,
  },
  {
    id: 'PASA 1_2027',
    expediente: 'PASA 1_2027',
    organo: 'Dirección Provincial del Servicio Público de Empleo Estatal en Illes Balears',
    titulo:
      'Servicio de mantenimiento, conservación y reparación de equipos del aire acondicionado en el edificio de la Dirección Provincial del Servicio Público de Empleo Estatal de Illes Balears.',
    urlOficial:
      'https://contrataciondelestado.es/wps/poc?uri=deeplink:detalle_licitacion&idEvl=YdJ%2BnjOoWlDIGlsa0Wad%2Bw%3D%3D',
    fuente: '643',
    estado: 'PUB',
    clase: 'núcleo',
    provincia: 'Illes Balears',
    fechaPublicacion: '2026-10-15T11:15:38+02:00',
    fechaModificacion: '2026-10-15T11:15:38+02:00',
    plazo: '2026-10-30',
    plazoHora: '15:00:00',
    valorEstimadoEur: 6611.57,
    presupuestoBaseSinIvaEur: 6611.57,
    presupuestoBaseConIvaEur: 8000,
    cpv: ['45331000', '50000000'],
    nDocumentos: 2,
    nLotes: 0,
  },
  {
    id: '2026/17/SUBM/OSA/CLIMA_PALAF',
    expediente: '2026/17/SUBM/OSA/CLIMA_PALAF',
    organo: 'Centrals i Infraestructures per a la Mobilitat i les Activitats Logístiques, SAU (CIMALSA)',
    titulo:
      'Suministro e instalación de una nueva máquina de climatización centralizada en la estación de autobuses de Palafrugell (Girona), con puesta en marcha, adecuación de conductos y retirada de la máquina actual.',
    urlOficial:
      'https://contractaciopublica.cat/ca/detall-publicacio/628ba4b5-fd19-46e5-b408-213b490bed9a/300910594',
    fuente: '1044',
    estado: 'PUB',
    clase: 'núcleo',
    provincia: 'Girona',
    fechaPublicacion: '2026-10-16T12:11:30+02:00',
    fechaModificacion: '2026-10-16T12:11:30+02:00',
    plazo: '2026-10-28',
    plazoHora: '13:00:00',
    valorEstimadoEur: 34843.44,
    presupuestoBaseSinIvaEur: 34843.44,
    presupuestoBaseConIvaEur: null,
    cpv: ['42500000', '42512000'],
    nDocumentos: 2,
    nLotes: 0,
  },
];

/** Provincias con aperturas reales en la ventana (para los selectores). */
export const SAMPLE_PROVINCIAS: string[] = [
  ...new Set(SAMPLE_OPPORTUNITIES.map((o) => o.provincia).filter((p): p is string => p !== null)),
].sort((a, b) => a.localeCompare(b, 'es'));

/** Actividades que cubre el nicho (las que el formulario de muestra ofrece). */
export const ACTIVIDADES = [
  'Mantenimiento de climatización',
  'Instalación de climatización',
  'Mantenimiento e instalación',
  'Refrigeración / frío industrial',
] as const;
