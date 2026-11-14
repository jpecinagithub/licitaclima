import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';

/** sha256 hex. Se usa para tokens (magic link, sesiones, IPs, códigos de recuperación). */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Token criptográfico opaco (32 bytes → 64 hex). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

/** Hash sha256 de la IP para logs/auditoría (minimización de PII). */
export function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  return sha256Hex(ip);
}

function encryptionKey(): Buffer {
  const secret = process.env.ADMIN_SECRETS_KEY ?? process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('Falta ADMIN_SECRETS_KEY o SESSION_SECRET para cifrar secretos de administrador.');
  }
  // Clave de 32 bytes derivada del secreto de entorno (nunca guardada en la BD).
  return scryptSync(secret, 'licitaclima-totp-v1', 32);
}

/**
 * Cifra un secreto (p. ej. TOTP) con AES-256-GCM.
 * Formato: base64(iv) + '.' + base64(authTag) + '.' + base64(ciphertext).
 */
export function encryptSecret(plaintext: string): string {
  const key = encryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`;
}

export function decryptSecret(encrypted: string): string {
  const key = encryptionKey();
  const [ivB64, tagB64, dataB64] = encrypted.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Secreto cifrado con formato no válido.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
