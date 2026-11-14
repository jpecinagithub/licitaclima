import { Route, Routes, Link } from 'react-router-dom';

export function App() {
  return (
    <div>
      <header>
        <nav>
          <Link to="/">LicitaClima</Link> · <Link to="/como-funciona">Cómo funciona</Link> ·{' '}
          <Link to="/precios">Precios</Link> · <Link to="/muestra">Muestra</Link> ·{' '}
          <Link to="/cobertura">Cobertura</Link> · <Link to="/faq">Preguntas frecuentes</Link>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<h1>Encuentra licitaciones de climatización que encajan con tu empresa</h1>} />
          <Route path="/como-funciona" element={<h1>Cómo funciona</h1>} />
          <Route path="/precios" element={<h1>Precios — 49 €/mes + impuestos</h1>} />
          <Route path="/muestra" element={<h1>Muestra</h1>} />
          <Route path="/cobertura" element={<h1>Cobertura</h1>} />
          <Route path="/faq" element={<h1>Preguntas frecuentes</h1>} />
          <Route path="*" element={<h1>Página no encontrada</h1>} />
        </Routes>
      </main>
    </div>
  );
}
