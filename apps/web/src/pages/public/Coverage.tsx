import { Link } from 'react-router-dom';
import { APERTURAS_POR_PROVINCIA, COVERAGE } from '../../lib/sample.js';

export function CoveragePage() {
  return (
    <div>
      <h1>Cobertura</h1>
      <p>
        LicitaClima cubre las licitaciones publicadas en la Plataforma de Contratación del Sector Público a través
        de dos conjuntos oficiales, excluyendo los contratos menores. <strong>No afirmamos cobertura exhaustiva de
        las plataformas autonómicas</strong>: hay anuncios que se publican solo en plataformas autonómicas y no
        aparecen en estos feeds.
      </p>

      <h2>Fuentes cubiertas</h2>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Fuente</th>
              <th>Contenido</th>
              <th>Aperturas de nicho en la ventana</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                643 — Licitaciones de perfiles de contratante
                <br />
                <a href="https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom">
                  Feed Atom 643
                </a>
              </td>
              <td>Perfiles de contratante alojados en la Plataforma de Contratación del Sector Público</td>
              <td>{COVERAGE.aperturasPorFeed.feed643}</td>
            </tr>
            <tr>
              <td>
                1044 — Plataformas agregadas sin menores
                <br />
                <a href="https://contrataciondelsectorpublico.gob.es/sindicacion/sindicacion_1044/PlataformasAgregadasSinMenores.atom">
                  Feed Atom 1044
                </a>
              </td>
              <td>Plataformas agregadas, excluyendo contratos menores</td>
              <td>{COVERAGE.aperturasPorFeed.feed1044}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Última sincronización</h2>
      <dl className="kv">
        <dt>Última sincronización del pull de validación</dt>
        <dd>{COVERAGE.ultimaSincronizacion}</dd>
        <dt>Ingesta automática (cada 6 h)</dt>
        <dd>{COVERAGE.ingestionAutomatica}</dd>
        <dt>Ventana de validación</dt>
        <dd>{COVERAGE.ventana}</dd>
      </dl>
      <p className="help">
        La frecuencia de consulta no implica que la fuente publique en tiempo real. Cuando una fuente falla, la
        información afectada se marca expresamente como obsoleta.
      </p>

      <h2>Volumen observado en la ventana de validación</h2>
      <p>
        Pull de 30 días ({COVERAGE.ventana}), documentado en <code>docs/volume-30d.md</code>:
      </p>
      <dl className="kv">
        <dt>Entradas Atom descargadas</dt>
        <dd>{COVERAGE.filasDescargadas.toLocaleString('es-ES')}</dd>
        <dt>Expedientes únicos</dt>
        <dd>{COVERAGE.expedientesUnicos.toLocaleString('es-ES')}</dd>
        <dt>Expedientes del nicho (climatización)</dt>
        <dd>{COVERAGE.nichoUnico.toLocaleString('es-ES')}</dd>
        <dt>Aperturas publicadas (PUB) del nicho</dt>
        <dd>{COVERAGE.aperturasPub}</dd>
        <dt>Aperturas de núcleo (publicables)</dt>
        <dd>{COVERAGE.aperturasNucleo}</dd>
        <dt>Aperturas publicables (núcleo + limítrofe)</dt>
        <dd>{COVERAGE.aperturasNucleoAmplio}</dd>
      </dl>
      <p>
        El nicho es estricto: 5 CPV (45331000, 42512000, 42500000, 50730000, 50720000) y 9 palabras clave. Solo el
        núcleo y lo limítrofe se publican como oportunidades; los expedientes marginales van a revisión humana.
        En la ventana, la media fue de unos 6–7 núcleos por día laborable, con días sin aperturas. Por eso el
        servicio promete un <strong>resumen semanal + alertas</strong>, no diez oportunidades al día.
      </p>

      <h2>Aperturas publicables por provincia ({COVERAGE.ventana})</h2>
      <p>
        Recuento de aperturas PUB de núcleo y limítrofe por provincia de ejecución, según el feed. 12 provincias
        no tuvieron ninguna apertura en la ventana: el servicio no promete oportunidades donde no las hay.
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Provincia</th>
              <th>Aperturas</th>
            </tr>
          </thead>
          <tbody>
            {APERTURAS_POR_PROVINCIA.map((r) => (
              <tr key={r.provincia}>
                <td>{r.provincia}</td>
                <td>{r.aperturas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        <Link to="/muestra">Probar la muestra</Link> ·{' '}
        <Link to="/faq">Preguntas frecuentes</Link>
      </p>
    </div>
  );
}
