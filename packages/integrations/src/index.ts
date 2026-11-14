// Adaptadores externos. NINGUNO operativo sin credenciales/configuración.
// LLM: proveedor SIN elegir (PENDIENTE: Jon elige xAI o Top Tools AI).
// La extracción determinista v1 (Fase C) NO es análisis LLM y nunca se presenta como tal.
export interface LlmProvider {
  readonly name: string;
  readonly configured: boolean;
  complete(prompt: string): Promise<string>;
}

export class NoLlmProvider implements LlmProvider {
  readonly name = 'none';
  readonly configured = false;
  async complete(): Promise<string> {
    throw new Error('LLM no configurado (PENDIENTE: Jon elige xAI o Top Tools AI).');
  }
}

export function createLlmProvider(): LlmProvider {
  // Los proveedores reales (xAI / Top Tools AI) se añaden cuando Jon elija y aporte clave.
  return new NoLlmProvider();
}

export * from './atom.js';
export * from './classify.js';
export * from './province.js';
export * from './ssrf.js';
export * from './pdf.js';
