// Formato de importes y fechas. Español de España, EUR, zona Europe/Madrid
// para mostrar; los instantes se almacenan en UTC y se muestran con su zona.

const eur = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

export function formatEur(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/D';
  return eur.format(value);
}

export function formatEurSinDecimales(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return 'N/D';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(value);
}

/** Fecha oficial (solo fecha, sin hora inventada): «24 nov 2026». */
export function formatFecha(value: string | null | undefined): string {
  if (!value) return 'N/D';
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return 'N/D';
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Madrid',
  }).format(d);
}

/** Instante con fecha y hora en Europe/Madrid, indicando que el origen es UTC. */
export function formatInstante(value: string | null | undefined): string {
  if (!value) return 'N/D';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'N/D';
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(d);
}

/** Días que faltan hasta una fecha de plazo (solo fecha). null si no hay plazo. */
export function diasHastaPlazo(plazo: string | null | undefined): number | null {
  if (!plazo) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fin = new Date(`${plazo}T00:00:00`);
  if (Number.isNaN(fin.getTime())) return null;
  return Math.round((fin.getTime() - hoy.getTime()) / 86_400_000);
}
