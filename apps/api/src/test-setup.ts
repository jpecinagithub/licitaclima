// Setup de Vitest (SOLO tests, nunca producción).
// Fija claves de cifrado SOLO de test si el entorno no las aporta, para que
// `pnpm --filter @licitaclima/api test` pase sin variables de entorno.
// En producción estas claves vienen SIEMPRE del entorno del servidor.
process.env.ADMIN_SECRETS_KEY ??= 'test-admin-secrets-key-solo-test-000000000000';
process.env.SESSION_SECRET ??= 'test-session-secret-solo-test-000000000000';
