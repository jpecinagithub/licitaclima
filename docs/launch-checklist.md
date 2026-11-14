# LicitaClima — Checklist de lanzamiento

Fecha: 2026-11-14. Esto es una lista de verificación, no una autorización:
cada casilla la cierra Jon o quien él designe, con evidencia.

## 1. Decisiones de Jon (bloquean el lanzamiento)

- [ ] **Proveedor LLM**: xAI o Top Tools AI (con modelo y tarifa
  registrada con fecha). Sin esto no hay chat ni análisis personalizado.
- [ ] **Claves Stripe en modo test** (`STRIPE_SECRET_KEY`,
  `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`
  del plan `licitaclima-mensual-v1`, 49 €/mes + impuestos). Sin esto no
  hay cobro.
- [ ] **Gmail dedicada** (o proveedor transaccional elegido) para el
  correo. Sin esto no hay registro por magic link: hoy el token se queda
  en el outbox sin enviar.
- [ ] **Dominio canónico** (`licitaclima.es` es el marcador actual en el
  prerender; confirmar o cambiar) y compra del dominio.
- [ ] **Despliegue en Oracle**: desbloquear SSH y confirmar ruta, recursos
  y puertos.
- [ ] **Licencia de reutilización de Hacienda** (aviso legal y spec v1.3
  sin verificar desde esta VM).
- [ ] **Identidad comercial y condiciones de venta completas** (nombre
  fiscal, CIF, dirección, textos legales revisados).

## 2. Técnico (antes de abrir al público)

- [ ] `docker compose build` en Oracle (las 3 imágenes no se han
  construido nunca; sin Docker en la VM de desarrollo).
- [ ] Migraciones + seed en la BD de producción; `/health/ready` en `ok`
  (con Stripe/correo/LLM en su estado real, no forzado).
- [ ] Ingesta manual en producción (`run ingest --feed 643 --max-pages 2`)
  y un `run-due` completo.
- [ ] Admin creado por CLI + TOTP verificado; reautenticación probada.
- [ ] Helmet + CSP configurados (hoy no existen).
- [ ] La BD no expone el 5432 públicamente.
- [ ] Backups diarios activos (dump + pliegos fuera del servidor) y
  **restauración probada en el propio Oracle** (en BD aparte).
- [ ] Rutas API de oportunidades/análisis/chat/favoritos/leads
  implementadas (hoy 404; ver `docs/validation-report.md` §5) o, si se
  retrasa, el panel cliente no debe prometerlas.
- [ ] E2E con Playwright (móvil y escritorio) ejecutado de verdad
  (hoy solo E2E manual por curl + BD; Playwright no está instalado).
- [ ] `pnpm build`, `pnpm typecheck`, `pnpm test` en verde en CI.

## 3. Pagos y facturación

- [ ] Checkout en test de extremo a extremo (pago → webhook → acceso
  activo; renovación; fallo de renovación con gracia de 3 días;
  cancelación al final del periodo; eventos duplicados y desordenados).
- [ ] Comisiones Stripe verificadas en stripe.com/es/pricing (no
  codificadas como constantes).
- [ ] Facturación fiscal española revisada (IVA, facturas; Stripe no
  garantiza cumplimiento fiscal por sí solo).
- [ ] Reembolsos y disputas: procedimiento y responsable definidos.

## 4. Correo y comunicaciones

- [ ] Proveedor transaccional con SPF, DKIM y DMARC.
- [ ] Webhooks de rebote/queja → supresión automática (probados).
- [ ] Doble confirmación para boletines/promociones; baja sencilla.
- [ ] Secuencia comercial inicial (máx. 3 mensajes en 7 días) revisada
  y con consentimiento registrado.

## 5. Legal y privacidad

- [ ] Condiciones, privacidad y consentimiento completados y revisados
  (hoy son plantillas marcadas pendientes, sin datos ficticios).
- [ ] Borrado/exportación de cuenta y retención definidos (hoy pendientes).
- [ ] Textos: sin promesas de ventas, adjudicaciones ni cobertura total;
  el plan no anuncia uso ilimitado.

## 6. Piloto comercial

- [ ] 10 empresas piloto; instrumentos de medición listos (embudo en
  `/admin/funnel`, MRR y churn en `/admin/summary` y `/admin/finance`).
- [ ] Coste real por análisis/pregunta medido con el proveedor elegido.
- [ ] Criterios §2 del prompt maestro (7/10 utilidad reconocida, 5
  suscripciones reales, CAC recuperable, retención) sin fabricar.

## 7. Qué NO se activa sin autorización expresa

Cobros reales, publicidad de pago, campañas de correo, ni ninguna
integración marcada PENDIENTE presentada como operativa.
