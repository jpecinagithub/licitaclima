// LicitaClima — configuración versionada (única fuente de precios y límites).
// Cualquier cambio de precio/límite se hace aquí y se refleja en web y Stripe.
export const PLAN = {
  id: 'licitaclima-mensual-v1',
  name: 'LicitaClima Mensual',
  priceEurExclTax: 49,
  currency: 'EUR',
  interval: 'month' as const,
  maxUsers: 1,
  maxCompanyProfiles: 1,
  maxProvinces: 3,
  maxPersonalizedAnalysesPerPeriod: 10,
  maxChatQuestionsPerPeriod: 100,
  digest: 'weekly' as const, // DECISIÓN 2026-11-14: resumen SEMANAL + alertas, no diario
  graceDaysAfterFailedRenewal: 3,
} as const;

export const NICHO = {
  // Nicho estricto (Fase A): 5 CPV + 9 palabras clave. NO redefinir sin decisión de Jon.
  cpv: ['45331000', '42512000', '42500000', '50730000', '50720000'],
  keywords: ['climatizacion', 'hvac', 'aire acondicionado', 'ventilacion', 'calefaccion', 'refrigeracion', 'bomba de calor', 'climatizador', 'climatizar'],
  // Solo núcleo + limítrofe se publican como oportunidades; marginales van a revisión.
  publishClasses: ['nucleo', 'limitrofe'] as const,
} as const;

export const SOURCES = {
  feed643: 'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom',
  feed1044: 'https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_1044/PlataformasAgregadasSinMenores.atom',
  ingestionIntervalHours: 6,
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
} as const;

export const LIMITS = {
  pdfMaxBytes: 20 * 1024 * 1024,
  pdfMaxPages: 200,
  pdfTimeoutMs: 120_000,
  magicLinkTtlMinutes: 15,
  sessionTtlDays: 30,
} as const;
