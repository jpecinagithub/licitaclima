import { describe, expect, it } from 'vitest';
import { PUBLIC_ROUTES, buildPageHtml } from '../../../scripts/prerender.mjs';

const SHELL = `<!doctype html><html lang="es"><head><title>LicitaClima</title>
<meta name="description" content="Desc" />
<link rel="canonical" href="https://licitaclima.es/" />
</head><body><div id="root"></div></body></html>`;

describe('prerender estático', () => {
  it('cubre las 10 páginas públicas', () => {
    const paths = PUBLIC_ROUTES.map((r) => r.path);
    for (const p of [
      '/',
 '/como-funciona',
      '/precios',
      '/muestra',
      '/cobertura',
      '/faq',
      '/contacto',
      '/legal/condiciones',
      '/legal/privacidad',
      '/legal/consentimiento',
    ]) {
      expect(paths).toContain(p);
    }
    expect(PUBLIC_ROUTES.length).toBe(10);
  });

  it('inyecta título, descripción, canonical y contenido real en el shell', () => {
    const route = PUBLIC_ROUTES.find((r) => r.path === '/muestra');
    expect(route).toBeDefined();
    const html = buildPageHtml(SHELL, route!);
    expect(html).toContain('<title>Muestra gratuita — LicitaClima</title>');
    expect(html).toContain('PSS/2026/0000130740');
    expect(html).toContain('42.884,99');
    expect(html).toContain('rel="canonical" href="https://licitaclima.es/muestra/"');
    // El contenido estático está dentro de #root, no una SPA vacía.
    expect(html).not.toContain('<div id="root"></div>');
  });

  it('la home contiene el mensaje principal exacto', () => {
    const route = PUBLIC_ROUTES.find((r) => r.path === '/');
    const html = buildPageHtml(SHELL, route!);
    expect(html).toContain(
      'Encuentra licitaciones de climatización que encajan con tu empresa y entiende sus requisitos antes de dedicar tiempo a preparar una oferta',
    );
  });

  it('las legales se marcan como pendientes de revisión', () => {
    for (const p of ['/legal/condiciones', '/legal/privacidad', '/legal/consentimiento']) {
      const route = PUBLIC_ROUTES.find((r) => r.path === p);
      const html = buildPageHtml(SHELL, route!);
      expect(html).toContain('PENDIENTE DE REVISIÓN');
    }
  });
});
