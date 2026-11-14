import { getAdminCustomers } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { EmptyState, ErrorState, Loading, Nd } from '../../components/ui.js';
import { formatFecha } from '../../lib/format.js';

export function AdminClientsPage() {
  const clientes = useApi(getAdminCustomers);
  return (
    <div>
      <h1>Clientes</h1>
      <p>
        Perfil, plan, cuota, incidencias y estado. Los accesos a datos privados de clientes quedan auditados.
      </p>
      {clientes.loading ? (
        <Loading />
      ) : clientes.error ? (
        <ErrorState
          error={clientes.error}
          onRetry={clientes.reload}
          nota="Los clientes (GET /admin/customers) aún no están disponibles (Fase E)."
        />
      ) : !clientes.data || clientes.data.length === 0 ? (
        <EmptyState titulo="Sin clientes" texto="Aún no hay clientes registrados." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Correo</th>
                <th>Plan</th>
                <th>Estado</th>
                <th>Cuota de análisis</th>
                <th>Incidencias abiertas</th>
                <th>Última actividad</th>
              </tr>
            </thead>
            <tbody>
              {clientes.data.map((c) => (
                <tr key={c.id}>
                  <td>{c.email}</td>
                  <td>{c.plan}</td>
                  <td>{c.estadoSuscripcion}</td>
                  <td>
                    <Nd value={c.analisisUsados} /> / <Nd value={c.analisisLimite} />
                  </td>
                  <td>
                    <Nd value={c.incidenciasAbiertas} />
                  </td>
                  <td>{formatFecha(c.ultimaActividad)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
