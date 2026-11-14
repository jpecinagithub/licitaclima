// LicitaClima — protección SSRF para la descarga de pliegos (Fase C).
//
// Solo se descargan documentos públicos vinculados a fuentes permitidas
// (prompt §4). Antes de cada descarga se valida: protocolo https, dominio en
// allowlist, DNS sin IP privadas/loopback/reservadas ni metadatos cloud
// (169.254.169.254), destino final tras redirecciones, tamaño, MIME y firma.
// Un dominio nuevo NO se descarga sin revisión: la allowlist solo se amplía
// con revisión humana explícita (ver PDF_ALLOWED_DOMAINS).
//
// Limitación conocida (documentada, no oculta): la validación DNS se hace
// antes de la petición; un DNS rebinding entre la comprobación y la descarga
// no queda cubierto por esta capa. En producción el worker debe además
// resolver y conectar contra la IP validada o correr en red aislada.

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Dominios oficiales permitidos. Fase A verificó que los pliegos del feed 643
 * viven en contrataciondelestado.es; el feed 1044 enlaza además a plataformas
 * autonómicas (contratosdegalicia.gal, contractaciopublica.cat,
 * juntadeandalucia.es, contratos-publicos.comunidad.madrid, …). Esos dominios
 * autonómicos se añaden aquí SOLO cuando aparecen en el feed 1044 y tras
 * revisión; un dominio nuevo fuera de esta lista no se descarga.
 */
export const PDF_ALLOWED_DOMAINS: ReadonlyArray<string> = [
  'contrataciondelestado.es',
  'contrataciondelsectorpublico.gob.es',
  // Plataformas autonómicas observadas en el feed 1044 (Fase A §3):
  'contratosdegalicia.gal',
  'contractaciopublica.cat',
  'juntadeandalucia.es',
  'contratos-publicos.comunidad.madrid',
  'contratacion.euskadi.eus',
  'contratos.navarra.es',
  'contratacionpublica.aragon.es',
  'contratos.gva.es',
];

export const PDF_MAX_BYTES = 20 * 1024 * 1024; // 20 MB (prompt §4 / config LIMITS)
export const PDF_MAX_REDIRECTS = 5;

/** ¿Es una IP privada, loopback, link-local, reservada o de metadatos cloud? */
export function isPrivateOrReservedIp(ip: string): boolean {
  if (!isIP(ip)) return true; // no es IP válida → no se confía en ella
  if (ip.includes(':')) {
    // IPv6: loopback ::1, link-local fe80::/10, unique-local fc00::/7, :: (sin especificar)
    const lower = ip.toLowerCase();
    return (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fe8') ||
      lower.startsWith('fe9') ||
      lower.startsWith('fea') ||
      lower.startsWith('feb') ||
      lower.startsWith('fc') ||
      lower.startsWith('fd')
    );
  }
  const [a, b] = ip.split('.').map(Number);
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // 127/8 loopback
  if (a === 169 && b === 254) return true; // 169.254/16 link-local + metadatos cloud
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 0 || a >= 224) return true; // 0/8, multicast 224/4, 240/4 reservado
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  return false;
}

export function isAllowedDomain(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return PDF_ALLOWED_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

export interface ValidatedUrl {
  url: string;
  hostname: string;
  ips: string[];
}

/**
 * Valida una URL de documento: https, dominio en allowlist, DNS resuelto sin
 * IP privadas/reservadas. Lanza SsrfError si no pasa. `lookupFn` es inyectable
 * para tests (evita DNS real).
 */
export async function validateDocumentUrl(
  rawUrl: string,
  opts: { lookupFn?: (host: string) => Promise<Array<{ address: string }>> } = {},
): Promise<ValidatedUrl> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfError(`URL no válida: ${rawUrl}`);
  }
  if (parsed.protocol !== 'https:') {
    throw new SsrfError(`protocolo no permitido (${parsed.protocol}): solo https`);
  }
  if (parsed.username || parsed.password) {
    throw new SsrfError('URL con credenciales embebidas no permitida');
  }
  if (!isAllowedDomain(parsed.hostname)) {
    throw new SsrfError(`dominio fuera de la allowlist (requiere revisión): ${parsed.hostname}`);
  }
  const lookupFn = opts.lookupFn ?? ((host: string) => lookup(host, { all: true }));
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookupFn(parsed.hostname);
  } catch (err) {
    throw new SsrfError(`DNS no resuelve ${parsed.hostname}: ${String(err)}`);
  }
  if (addresses.length === 0) {
    throw new SsrfError(`DNS sin direcciones para ${parsed.hostname}`);
  }
  for (const { address } of addresses) {
    if (isPrivateOrReservedIp(address)) {
      throw new SsrfError(`DNS resuelve a IP privada/reservada: ${parsed.hostname} → ${address}`);
    }
  }
  return { url: parsed.toString(), hostname: parsed.hostname, ips: addresses.map((a) => a.address) };
}
