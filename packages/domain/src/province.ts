// LicitaClima — corrección de provincia (Fase C).
//
// Regla (Fase A §6.3, confirmada en el pull de 30 días, volume-30d.md §5):
//   título > NUTS > órgano (nombre del feed).
// La provincia del feed es a menudo la SEDE del órgano, no el lugar de
// ejecución (caso Paradores: obra en Salamanca/Granada con NUTS ES300 Madrid).
// Cuando el título contradice el NUTS, se usa la provincia del título y se
// marca provinciaPorVerificar=true para revisión humana.
//
// Mapa NUTS→provincia: NUTS-2021. La base es el mapa derivado del propio feed
// 643 en scripts/finalize_30d.py (107 códigos observados); se completan los
// códigos NUTS3 no observados en la muestra (ES701/ES702 Fuerteventura y
// Gran Canaria, ES708 Lanzarote, ES709 Tenerife) según NUTS-2021 estándar.
// Códigos de nivel NUTS2 de comunidades uniprovinciales (ES13 Cantabria,
// ES23 La Rioja, ES30 Madrid, ES53 Illes Balears, ES62 Murcia, ES63 Ceuta,
// ES64 Melilla) también se resuelven. Los NUTS2 pluriprovinciales (ES11,
// ES41, ES42, ES43, ES51, ES52, ES61, ES70) y ES/ESZZZ NO se pueden resolver
// a provincia: provincia = null (nunca se inventa).

export interface ProvinciaResuelta {
  /** Provincia canónica de ejecución, o null si no se puede resolver. */
  provincia: string | null;
  /** true cuando título y NUTS (o nombre del feed) se contradicen. */
  provinciaPorVerificar: boolean;
  /** De dónde salió la provincia elegida. */
  fuente: 'titulo' | 'nuts' | 'nombre_feed' | 'ninguna';
  /** Descripción del conflicto, si lo hay (para revisión humana). */
  conflicto: string | null;
}

/** NUTS3 (5 caracteres) → provincia canónica. NUTS-2021. */
export const NUTS3_A_PROVINCIA: Readonly<Record<string, string>> = {
  ES111: 'A Coruña',
  ES112: 'Lugo',
  ES113: 'Ourense',
  ES114: 'Pontevedra',
  ES120: 'Asturias',
  ES130: 'Cantabria',
  ES211: 'Álava',
  ES212: 'Gipuzkoa',
  ES213: 'Bizkaia',
  ES220: 'Navarra',
  ES230: 'La Rioja',
  ES241: 'Huesca',
  ES242: 'Teruel',
  ES243: 'Zaragoza',
  ES300: 'Madrid',
  ES411: 'Ávila',
  ES412: 'Burgos',
  ES413: 'León',
  ES414: 'Palencia',
  ES415: 'Salamanca',
  ES416: 'Segovia',
  ES417: 'Soria',
  ES418: 'Valladolid',
  ES419: 'Zamora',
  ES421: 'Albacete',
  ES422: 'Ciudad Real',
  ES423: 'Cuenca',
  ES424: 'Guadalajara',
  ES425: 'Toledo',
  ES431: 'Badajoz',
  ES432: 'Cáceres',
  ES511: 'Barcelona',
  ES512: 'Girona',
  ES513: 'Lleida',
  ES514: 'Tarragona',
  ES521: 'Alicante',
  ES522: 'Castellón',
  ES523: 'Valencia',
  ES531: 'Illes Balears',
  ES532: 'Illes Balears',
  ES533: 'Illes Balears',
  ES611: 'Almería',
  ES612: 'Cádiz',
  ES613: 'Córdoba',
  ES614: 'Granada',
  ES615: 'Huelva',
  ES616: 'Jaén',
  ES617: 'Málaga',
  ES618: 'Sevilla',
  ES620: 'Murcia',
  ES630: 'Ceuta',
  ES640: 'Melilla',
  ES701: 'Las Palmas',
  ES702: 'Las Palmas',
  ES703: 'Las Palmas',
  ES704: 'Santa Cruz de Tenerife',
  ES705: 'Santa Cruz de Tenerife',
  ES706: 'Santa Cruz de Tenerife',
  ES707: 'Santa Cruz de Tenerife',
  ES708: 'Las Palmas', // Lanzarote (NUTS-2021; no observado en la muestra de 30 días)
  ES709: 'Santa Cruz de Tenerife', // Tenerife (NUTS-2021; no observado en la muestra)
};

/** NUTS2 de comunidades uniprovinciales → provincia. El resto de NUTS2 no se resuelve. */
export const NUTS2_UNIPROVINCIAL_A_PROVINCIA: Readonly<Record<string, string>> = {
  ES13: 'Cantabria',
  ES23: 'La Rioja',
  ES30: 'Madrid',
  ES53: 'Illes Balears',
  ES62: 'Murcia',
  ES63: 'Ceuta',
  ES64: 'Melilla',
};

/** Códigos NUTS observados en data/volume-30d que NO se pueden resolver a provincia. */
export const NUTS_SIN_PROVINCIA = [
  'ES',
  'ESZZZ', // código genérico sin ámbito territorial
  'ES1',
  'ES11',
  'ES2',
  'ES3',
  'ES41',
  'ES42',
  'ES43',
  'ES51',
  'ES52',
  'ES61',
  'ES70',
] as const;

/** Provincia canónica a partir de un código NUTS (3 o 2), o null si no se puede resolver. */
export function provinciaDesdeNuts(nuts: string | null | undefined): string | null {
  if (!nuts) return null;
  const code = nuts.trim().toUpperCase();
  return (
    NUTS3_A_PROVINCIA[code] ?? NUTS2_UNIPROVINCIAL_A_PROVINCIA[code] ?? null
  );
}

export function normalizarTexto(s: string): string {
  return (s ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nombre normalizado → provincia canónica (para títulos y nombres del feed). */
const NOMBRES_A_PROVINCIA: ReadonlyArray<readonly [string, string]> = [
  // Los más largos primero: la detección usa coincidencia por palabra completa.
  ['santa cruz de tenerife', 'Santa Cruz de Tenerife'],
  ['illes balears', 'Illes Balears'],
  ['ciudad real', 'Ciudad Real'],
  ['las palmas', 'Las Palmas'],
  ['la rioja', 'La Rioja'],
  ['a coruna', 'A Coruña'],
  ['gran canaria', 'Las Palmas'],
  ['fuerteventura', 'Las Palmas'],
  ['lanzarote', 'Las Palmas'],
  ['la palma', 'Santa Cruz de Tenerife'],
  ['la gomera', 'Santa Cruz de Tenerife'],
  ['el hierro', 'Santa Cruz de Tenerife'],
  ['mallorca', 'Illes Balears'],
  ['menorca', 'Illes Balears'],
  ['ibiza', 'Illes Balears'],
  ['tenerife', 'Santa Cruz de Tenerife'],
  ['alava', 'Álava'],
  ['albacete', 'Albacete'],
  ['alicante', 'Alicante'],
  ['almeria', 'Almería'],
  ['avila', 'Ávila'],
  ['badajoz', 'Badajoz'],
  ['barcelona', 'Barcelona'],
  ['burgos', 'Burgos'],
  ['caceres', 'Cáceres'],
  ['cadiz', 'Cádiz'],
  ['cantabria', 'Cantabria'],
  ['castellon', 'Castellón'],
  ['cordoba', 'Córdoba'],
  ['cuenca', 'Cuenca'],
  ['girona', 'Girona'],
  ['granada', 'Granada'],
  ['guadalajara', 'Guadalajara'],
  ['gipuzkoa', 'Gipuzkoa'],
  ['huelva', 'Huelva'],
  ['huesca', 'Huesca'],
  ['jaen', 'Jaén'],
  ['leon', 'León'],
  ['lleida', 'Lleida'],
  ['lugo', 'Lugo'],
  ['madrid', 'Madrid'],
  ['malaga', 'Málaga'],
  ['murcia', 'Murcia'],
  ['navarra', 'Navarra'],
  ['ourense', 'Ourense'],
  ['asturias', 'Asturias'],
  ['palencia', 'Palencia'],
  ['pontevedra', 'Pontevedra'],
  ['salamanca', 'Salamanca'],
  ['segovia', 'Segovia'],
  ['sevilla', 'Sevilla'],
  ['soria', 'Soria'],
  ['tarragona', 'Tarragona'],
  ['teruel', 'Teruel'],
  ['toledo', 'Toledo'],
  ['valencia', 'Valencia'],
  ['valladolid', 'Valladolid'],
  ['bizkaia', 'Bizkaia'],
  ['zamora', 'Zamora'],
  ['zaragoza', 'Zaragoza'],
  ['ceuta', 'Ceuta'],
  ['melilla', 'Melilla'],
  ['balears', 'Illes Balears'],
  ['coruna', 'A Coruña'],
  ['rioja', 'La Rioja'],
];

/** Detecta una provincia mencionada en un texto libre (título/objeto). */
export function provinciaEnTexto(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const t = ` ${normalizarTexto(texto)} `;
  for (const [nombre, provincia] of NOMBRES_A_PROVINCIA) {
    if (t.includes(` ${nombre} `)) return provincia;
  }
  return null;
}

/** Canonicaliza un nombre de provincia tal como viene en el feed (CountrySubentity). */
export function provinciaDesdeNombreFeed(
  nombre: string | null | undefined,
): string | null {
  if (!nombre) return null;
  return provinciaEnTexto(nombre);
}

/**
 * Resuelve la provincia de ejecución con la regla título > NUTS > órgano.
 * Nunca inventa una provincia: si nada resuelve, provincia = null.
 */
export function resolverProvincia(input: {
  titulo: string;
  nuts: string | null | undefined;
  /** Nombre de provincia del feed (CountrySubentity), si lo trae. */
  nombreFeed?: string | null | undefined;
}): ProvinciaResuelta {
  const porTitulo = provinciaEnTexto(input.titulo);
  const porNuts = provinciaDesdeNuts(input.nuts);
  const porNombreFeed = provinciaDesdeNombreFeed(input.nombreFeed);

  const conflicto =
    porTitulo && porNuts && porTitulo !== porNuts
      ? `el título indica ${porTitulo} pero el NUTS ${input.nuts} indica ${porNuts}`
      : porNombreFeed && porNuts && porNombreFeed !== porNuts
        ? `el nombre del feed indica ${porNombreFeed} pero el NUTS ${input.nuts} indica ${porNuts}`
        : null;

  if (porTitulo) {
    return {
      provincia: porTitulo,
      provinciaPorVerificar: conflicto !== null,
      fuente: 'titulo',
      conflicto,
    };
  }
  if (porNombreFeed) {
    return {
      provincia: porNombreFeed,
      provinciaPorVerificar: conflicto !== null,
      fuente: 'nombre_feed',
      conflicto,
    };
  }
  if (porNuts) {
    return { provincia: porNuts, provinciaPorVerificar: false, fuente: 'nuts', conflicto: null };
  }
  return { provincia: null, provinciaPorVerificar: false, fuente: 'ninguna', conflicto: null };
}
