// Tests SSRF (Fase C): dominios, DNS e IPs.
import { describe, expect, it } from 'vitest';
import { isAllowedDomain, isPrivateOrReservedIp, validateDocumentUrl } from './ssrf.js';

const lookupOk = async () => [{ address: '185.23.56.10' }];
const lookupPrivate = async () => [{ address: '10.0.0.5' }];
const lookupMetadata = async () => [{ address: '169.254.169.254' }];
const lookupLoopback = async () => [{ address: '127.0.0.1' }];

describe('isPrivateOrReservedIp', () => {
  it('bloquea privadas, loopback, link-local y metadatos cloud', () => {
    for (const ip of ['10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '127.0.0.1', '169.254.169.254', '::1', 'fe80::1', 'fc00::1', '0.0.0.0', '224.0.0.1']) {
      expect(isPrivateOrReservedIp(ip)).toBe(true);
    }
  });
  it('permite IP públicas', () => {
    for (const ip of ['185.23.56.10', '8.8.8.8', '172.32.0.1', '100.128.0.1']) {
      expect(isPrivateOrReservedIp(ip)).toBe(false);
    }
  });
});

describe('isAllowedDomain', () => {
  it('permite dominios oficiales y subdominios', () => {
    expect(isAllowedDomain('contrataciondelestado.es')).toBe(true);
    expect(isAllowedDomain('www.contrataciondelestado.es')).toBe(true);
    expect(isAllowedDomain('contrataciondelsectorpublico.gob.es')).toBe(true);
    expect(isAllowedDomain('contratosdegalicia.gal')).toBe(true);
  });
  it('rechaza dominios fuera de la allowlist (también parecidos)', () => {
    expect(isAllowedDomain('contrataciondelestado.es.evil.com')).toBe(false);
    expect(isAllowedDomain('evil-contrataciondelestado.es')).toBe(false);
    expect(isAllowedDomain('example.com')).toBe(false);
  });
});

describe('validateDocumentUrl', () => {
  it('acepta URL oficial con DNS público', async () => {
    const v = await validateDocumentUrl('https://contrataciondelestado.es/FileSystem/servlet/GetDocumentByIdServlet?cifrado=AAA', { lookupFn: lookupOk });
    expect(v.hostname).toBe('contrataciondelestado.es');
  });
  it('rechaza http (solo https)', async () => {
    await expect(validateDocumentUrl('http://contrataciondelestado.es/x.pdf', { lookupFn: lookupOk })).rejects.toThrow(/solo https/);
  });
  it('rechaza dominio fuera de la allowlist sin revisión', async () => {
    await expect(validateDocumentUrl('https://example.com/pliego.pdf', { lookupFn: lookupOk })).rejects.toThrow(/allowlist/);
  });
  it('rechaza DNS a IP privada, loopback y metadatos cloud', async () => {
    for (const lookupFn of [lookupPrivate, lookupMetadata, lookupLoopback]) {
      await expect(
        validateDocumentUrl('https://contrataciondelestado.es/x.pdf', { lookupFn }),
      ).rejects.toThrow(/privada\/reservada/);
    }
  });
  it('rechaza credenciales embebidas en la URL', async () => {
    await expect(
      validateDocumentUrl('https://user:pass@contrataciondelestado.es/x.pdf', { lookupFn: lookupOk }),
    ).rejects.toThrow(/credenciales/);
  });
});
