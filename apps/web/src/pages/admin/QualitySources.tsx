import { apiGet } from '../../lib/api.js';
import type { QualityData, SourcesData } from '../../lib/admin.js';
import { useApi } from '../../lib/useApi.js';
import { EmptyState, ErrorState, Loading, Nd, Stat } from '../../components/ui.js';
import { formatFecha, formatInstante } from '../../lib/format.js';

export function AdminQualityPage() {
  const calidad = useApi(() => apiGet<QualityData>('/admin/quality'));
  const d = calidad.data;
  return (
    <div>
      <h1>Calidad</h1>
      <p>
        La validación por muestreo humano no se sustituye por un segundo modelo: las muestras de revisión se
        auditan por personas y los resultados se registran aquí.
      </p>
      {calidad.loading ? (
        <Loading />
      ) : calidad.error || !d ? (
        <ErrorState
          error={calidad.error}
          onRetry={calidad.reload}
          nota="La calidad (GET /admin/quality) aún no está disponible (Fase E)."
        />
      ) : (
        <>
          <div className="grid grid-4">
            <Stat label="Requisitos sin evidencia" value={d.requisitosSinEvidencia ?? 'N/D'} />
            <Stat label="Contradicciones entre documentos" value={d.contradicciones ?? 'N/D'} />
            <Stat label="Muestras de revisión pendientes" value={d.muestrasRevisionPendientes ?? 'N/D'} />
            <Stat label="Feedback recibido" value={d.feedbackRecibido ?? 'N/D'} />
          </div>
          <h2>Muestras de revisión</h2>
          {d.muestras.length === 0 ? (
            <EmptyState titulo="Sin muestras" texto="No hay muestras de revisión registradas." />
          ) : (
            <ul>
              {d.muestras.map((m) => (
                <li key={m.id}>
                  <strong>{m.expediente}</strong> — {m.hallazgo}{' '}
                  <span className="muted">{formatFecha(m.fecha)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export function AdminSourcesPage() {
  const fuentes = useApi(() => apiGet<SourcesData[]>('/admin/sources'));
  return (
    <div>
      <h1>Fuentes y operaciones</h1>
      <p>
        Última ejecución exitosa, frescura, errores, latencia, trabajos en cola y reintentos. Cuando una fuente
        falla, la información afectada se marca como obsoleta.
      </p>
      {fuentes.loading ? (
        <Loading />
      ) : fuentes.error ? (
        <ErrorState
          error={fuentes.error}
          onRetry={fuentes.reload}
          nota="Las fuentes (GET /admin/sources) aún no están disponibles (Fase E)."
        />
      ) : !fuentes.data || fuentes.data.length === 0 ? (
        <EmptyState titulo="Sin datos de fuentes" texto="Aún no hay ejecuciones de ingesta registradas." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Fuente</th>
                <th>Última ejecución correcta</th>
                <th>Frescura</th>
                <th>Errores (24 h)</th>
                <th>Latencia</th>
                <th>En cola</th>
                <th>Reintentos pendientes</th>
              </tr>
            </thead>
            <tbody>
              {fuentes.data.map((f) => (
                <tr key={f.fuente}>
                  <td>{f.fuente}</td>
                  <td>{formatInstante(f.ultimaEjecucionOk)}</td>
                  <td>
                    <Nd value={f.frescuraMinutos} format={(v) => `${v} min`} />
                  </td>
                  <td>
                    <Nd value={f.errores24h} />
                  </td>
                  <td>
                    <Nd value={f.latenciaMs} format={(v) => `${v} ms`} />
                  </td>
                  <td>
                    <Nd value={f.trabajosEnCola} />
                  </td>
                  <td>
                    <Nd value={f.reintentosPendientes} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
