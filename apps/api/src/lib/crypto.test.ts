import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, hashIp, randomToken, sha256Hex } from './crypto.js';

describe('crypto', () => {
  it('sha256Hex es determinista y no revela el valor', () => {
    const token = randomToken();
    expect(sha256Hex(token)).toBe(sha256Hex(token));
    expect(sha256Hex(token)).not.toContain(token);
    expect(sha256Hex(token)).toHaveLength(64);
  });

  it('randomToken genera valores distintos', () => {
    expect(randomToken()).not.toBe(randomToken());
  });

  it('hashIp no guarda la IP en claro', () => {
    const h = hashIp('203.0.113.7');
    expect(h).not.toContain('203.0.113.7');
    expect(hashIp(undefined)).toBeNull();
  });

  it('encryptSecret/descryptSecret: ida y vuelta con la clave de entorno', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const encrypted = encryptSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptSecret(encrypted)).toBe(secret);
  });

  it('decryptSecret falla con texto manipulado', () => {
    const encrypted = encryptSecret('SECRETO');
    const tampered = `${encrypted.slice(0, -4)}AAAA`;
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
