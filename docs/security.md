# LicitaClima — Seguridad

Estado: MVP de las Fases B–F (2026-11-14). Ver `docs/validation-report.md`
para la cobertura real de pruebas. Este documento describe los controles
implementados y los que faltan; no promete más de lo que el código hace.

## 1. Autenticación de clientes (magic link)

- Token criptográfico aleatorio de 32 bytes; en BD solo su hash SHA-256
  (`login_tokens.token_hash`, único). Caducidad 15 minutos, un solo uso,
  consumo atómico.
- El correo con el enlace NO se envía hoy: sin proveedor de correo, el
  token queda en el outbox (`template_key = 'magic_link'`, `pending`) y la
  ruta devuelve siempre la misma respuesta genérica (anti-enumeración).
- El `GET /auth/verify-link` **no** consume el token: la página intermedia
  y la confirmación son `POST /auth/consume-link`. Un escáner de correo que
  siga el enlace no agota el acceso. Verificado E2E: dos GET seguidos
  devuelven `valid: true`; tras el POST, `valid: false` y el reuso da 410.
- Sesiones opacas en cookie `HttpOnly`, `Secure` (en producción) y
  `SameSite=Lax`; rotación y revocación (`POST /auth/logout`); TTL 30 días.
  Nada de sesión en `localStorage`.
- Rate limit en `request-link` (5 / 15 min) y `consume-link` (10 / 15 min).

## 2. Administrador

- Cuenta creada solo por CLI de bootstrap
  (`pnpm --filter @licitaclima/api exec tsx src/cli.ts admin:create --email X`);
  nunca hay credenciales por defecto. Contraseña con Argon2id.
- TOTP obligatorio (otplib) + códigos de recuperación (hash). Reautenticación
  para acciones sensibles (`POST /auth/admin/reauth`).
- Roles separados en servidor: el rol global del usuario
  (`cliente` | `admin` | `owner`) y el rol de membership por organización.
  Las rutas `/admin/*` exigen rol admin/owner; un cliente recibe 403
  (cubierto por tests).

## 3. Aislamiento multi-tenant

- Todo objeto privado lleva `organization_id`; las rutas resuelven la
  organización desde la sesión, nunca desde un parámetro del cliente.
- Tests de acceso cruzado entre dos organizaciones en `apps/api`
  (perfiles, análisis privados y chats ajenos, también con IDs conocidos).
- Los datos públicos genéricos (licitaciones, análisis genéricos) se
  comparten; perfiles, comparaciones, notas y conversaciones son privados
  por organización.

## 4. CSRF, CORS y cabeceras

- Mutaciones con sesión exigen `Origin` permitido (`checkCsrf`:
  `WEB_PUBLIC_URL`, `API_PUBLIC_URL` y `ALLOWED_ORIGINS`).
- CORS restringido al origen de la web, con credenciales.
- Rate limit global de la API: 300 req/min (además de los límites por ruta).
- **Pendiente:** no hay helmet ni CSP configurados hoy (ni en Fastify ni
  en la web ni en Caddy). Añadirlos antes del lanzamiento y revisar la CSP
  si se añaden orígenes externos.

## 5. SSRF y documentos no confiables

- Descarga solo de dominios en allowlist ampliable (fuentes oficiales).
  Antes de descargar: validación de protocolo, resolución DNS y rechazo de
  IP privadas/reservadas y de redirecciones fuera de la allowlist.
  Verificado con tests (IP privada, redirección a dominio externo).
- Límites: 20 MB, 200 páginas, 120 s por PDF; MIME y firma validados
  (el HTML de rechazo del WAF se rechaza, no se guarda como PDF).
- XML con entidades externas deshabilitadas (fast-xml-parser sin XXE).
- **Documentos y correos son datos no confiables:** las instrucciones
  dentro de un PDF no cambian el system prompt, no ejecutan herramientas
  ni acceden a secretos. La extracción cuenta `instruccionesDetectadas`
  sin obedecerlas (0 en la verificación E2E de 2026-11-14).
- Extracción una vez por hash de documento y versión de pipeline.

## 6. Pagos (Stripe, solo test)

- Claves live bloqueadas por diseño (`live_blocked`, 503). Sin claves:
  checkout y cancelación devuelven 503 `stripe_not_configured`.
- Webhook verificado por firma con cuerpo raw; `event_id` único; duplicados
  y eventos fuera de orden tolerados (se procesan en cola y se concilia el
  estado vigente). La URL de éxito nunca activa acceso por sí sola.
- El backend elige `price_id` desde la configuración permitida; el cliente
  no puede enviar importes.
- Sin tarjetas ni datos bancarios almacenados en LicitaClima.

## 7. Secretos y logs

- Secretos solo en servidor, fuera de git (`.env`, nunca commiteado).
  `ADMIN_SECRETS_KEY` (o `SESSION_SECRET`) cifra los secretos de admin en
  reposo; sin ella la API no arranca el cifrado.
- Logs redactados: nunca se registran tokens, hashes de sesión, claves ni
  documentos completos. El token del magic link no aparece en ningún log.
- Backups: ver `docs/operations.md` (cifrado en reposo pendiente de
  configurar en Oracle; el dump local de verificación no se cifra).

## 8. Privacidad y retención

- El perfil pide solo datos declarados (actividad, provincias, tamaño
  orientativo, capacidad, experiencia, certificaciones, preferencias).
  No se pide documentación sensible en el MVP; los datos se marcan como
  declarados, no verificados.
- Consentimiento de marketing separado, opcional, no premarcado, con
  versión del texto y fecha (`consent_events`); baja sencilla y lista de
  supresión (`suppression_entries`); la baja de marketing no cancela
  comunicaciones de cuenta ni la suscripción.
- Borrado/exportación de cuenta y política de retención: **pendiente de
  definir con Jon antes del lanzamiento** (ver `docs/launch-checklist.md`).
  Los borrados no deben reaparecer al restaurar un backup: el runbook de
  restauración debe re-aplicar los borrados registrados (pendiente de
  implementar como procedimiento).

## 9. Pendientes de seguridad (no ocultar)

- [ ] Proveedor de correo transaccional + SPF/DKIM/DMARC (sin él no hay
  registro por magic link: el correo es hoy el paso que falta).
- [ ] Proveedor LLM elegido y con presupuesto; sin él el chat no existe.
- [ ] Revisión de CSP y cabeceras en el despliegue real (Caddy).
- [ ] Cifrado de backups y retención documentada; prueba de restauración
  periódica (la primera, en entorno aislado, está hecha: ver
  `docs/validation-report.md`).
- [ ] Revisión fiscal/legal de textos (condiciones, privacidad,
  consentimiento: plantillas marcadas pendientes, sin datos ficticios).
- [ ] Endurecer `docker-compose.yml`: la BD no debe exponer el 5432 en
  producción; credenciales solo por `.env` en el servidor, nunca en el repo.
