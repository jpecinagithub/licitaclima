// Esquema Drizzle — Fase B. Una tabla por dominio en ./schema/*.ts.
// Entidades mínimas del prompt §8 (36 tablas). Datos públicos (fuentes,
// licitaciones, documentos, análisis genéricos) SIN organization_id;
// todo objeto privado lleva organization_id (UUID) y se aísla por tenant.
export * from './core.js';
export * from './profiles.js';
export * from './ingestion.js';
export * from './analysis.js';
export * from './billing.js';
export * from './comms.js';
export * from './ops.js';
