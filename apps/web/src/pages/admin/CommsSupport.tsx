import { apiGet } from '../../lib/api.js';
import type { AdminSupportData, CommsData } from '../../lib/admin.js';
import { useApi } from '../../lib/useApi.js';
import { EmptyState, ErrorState, Loading, Nd, Stat } from '../../components/ui.js';

export function AdminCommsPage() {
  const comms = useApi(() => apiGet<CommsData>('/admin/communications'));
  const d = comms.data;
  return (
    <div>
      <h1>Comunicaciones</h1>
      <p>
        Envíos, rebotes, quejas, bajas y cola. Se distingue «aceptado por el proveedor» de «entregado». Los
        rebotes y quejas generan supresión automática.
      </p>
      {comms.loading ? (
        <Loading />
      ) : comms.error || !d ? (
        <ErrorState
          error={comms.error}
          onRetry={comms.reload}
          nota="Las comunicaciones (GET /admin/communications) aún no están disponibles (Fase E)."
        />
      ) : (
        <>
          <p className="muted">Periodo: {d.periodo ?? 'N/D'}</p>
          <div className="grid grid-3">
            <Stat label="Envíos en el periodo" value={d.enviosPeriodo ?? 'N/D'} />
            <Stat label="Rebotes" value={d.rebotes ?? 'N/D'} />
            <Stat label="Quejas" value={d.quejas ?? 'N/D'} />
            <Stat label="Bajas" value={d.bajas ?? 'N/D'} />
            <Stat label="En cola" value={d.enCola ?? 'N/D'} />
          </div>
        </>
      )}
    </div>
  );
}

export function AdminSupportPage() {
  const soporte = useApi(() => apiGet<AdminSupportData>('/admin/support'));
  const d = soporte.data;
  return (
    <div>
      <h1>Soporte</h1>
      <p>Tickets por prioridad, SLA interno y escalados.</p>
      {soporte.loading ? (
        <Loading />
      ) : soporte.error || !d ? (
        <ErrorState
          error={soporte.error}
          onRetry={soporte.reload}
          nota="El soporte (GET /admin/support) aún no está disponible (Fase E)."
        />
      ) : (
        <>
          <div className="grid grid-3">
            <Stat label="SLA incumplido" value={d.slaIncumplido ?? 'N/D'} />
            <Stat label="Escalados" value={d.escalados ?? 'N/D'} />
            <Stat
              label="Tiempo medio de respuesta"
              value={d.tiempoMedioRespuestaHoras === null ? 'N/D' : `${d.tiempoMedioRespuestaHoras} h`}
            />
          </div>
          <h2>Tickets abiertos por prioridad</h2>
          {d.porPrioridad.length === 0 ? (
            <EmptyState titulo="Sin tickets abiertos" texto="No hay tickets abiertos por prioridad." />
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Prioridad</th>
                    <th>Abiertos</th>
                  </tr>
                </thead>
                <tbody>
                  {d.porPrioridad.map((p) => (
                    <tr key={p.prioridad}>
                      <td>{p.prioridad}</td>
                      <td>
                        <Nd value={p.abiertos} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
