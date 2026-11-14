import { Link, NavLink, Outlet } from 'react-router-dom';
import type { ReactNode } from 'react';
const PUBLIC_NAV = [
  { to: '/', label: 'Inicio', end: true },
  { to: '/como-funciona', label: 'Cómo funciona' },
  { to: '/precios', label: 'Precios' },
  { to: '/muestra', label: 'Muestra' },
  { to: '/cobertura', label: 'Cobertura' },
  { to: '/faq', label: 'Preguntas frecuentes' },
  { to: '/contacto', label: 'Contacto' },
];

export function PublicLayout() {
  return (
    <div>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          <Link className="brand" to="/">
            Licita<span>Clima</span>
          </Link>
          <nav className="site-nav" aria-label="Navegación principal">
            {PUBLIC_NAV.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end}>
                {item.label}
              </NavLink>
            ))}
            <NavLink to="/app">Acceso clientes</NavLink>
          </nav>
        </div>
      </header>
      <main id="contenido" className="container">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="site-footer-inner">
          <span>LicitaClima — licitaciones de climatización para pequeñas empresas.</span>
          <Link to="/legal/condiciones">Condiciones</Link>
          <Link to="/legal/privacidad">Privacidad</Link>
          <Link to="/legal/consentimiento">Consentimiento</Link>
          <span className="muted">Textos legales pendientes de revisión. Sin datos comerciales ficticios.</span>
        </div>
      </footer>
    </div>
  );
}

export function PanelLayout({
  title,
  nav,
  aside,
}: {
  title: string;
  nav: { to: string; label: string; end?: boolean }[];
  aside?: ReactNode;
}) {
  return (
    <div className="panel">
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>
      <header className="site-header">
        <div className="site-header-inner">
          <Link className="brand" to="/">
            Licita<span>Clima</span>
          </Link>
          <span className="muted">{title}</span>
          {aside}
        </div>
      </header>
      <div className="panel-body">
        <nav className="panel-nav" aria-label="Navegación del panel">
          <ul>
            {nav.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.end}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main id="contenido" className="panel-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
