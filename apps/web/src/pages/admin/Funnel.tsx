import { getAdminFunnel } from '../../lib/api.js';
import type { FunnelData } from '../../lib/admin.js';
import { useApi } from '../../lib/useApi.js';
import { EmptyState, ErrorState, Loading, Nd } from '../../components/ui.js';

const PASOS: { key: keyof Omit<FunnelData, 'canal'>; label: string }[] = [
  { key: 'visitas', label: 'Visitas medibles' },
  { key: 'muestras', label: 'Muestras' },
  { key: 'correosVerificados', label: 'Correos verificados' },
  { key: 'perfilesCompletos', label: 'Perfiles completos' },
  { key: 'checkouts', label: 'Checkouts' },
  { key: 'pagos', label: 'Pagos' },
];

export function AdminFunnelPage() {
  const embudo = useApi(getAdminFunnel);
  return (
    <div>
      <h1>Embudo por canal</h1>
      <p>
        Visita → muestra → correo verificado → perfil completo → checkout → pago → activación → renovación. Los
        datos ausentes se muestran como N/D, no como cero.
      </p>
      {embudo.loading ? (
        <Loading />
      ) : embudo.error ? (
        <ErrorState
          error={embudo.error}
          onRetry={embudo.reload}
          nota="El embudo (GET /admin/funnel) aún no está disponible (Fase E)."
        />
      ) : !embudo.data || embudo.data.length === 0 ? (
        <EmptyState
          titulo="Sin datos de embudo"
          texto="Aún no hay mediciones por canal. La atribución distingue tráfico orgánico, referido y pagado; los canales sin medición aparecen como N/D."
        />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Canal</th>
                {PASOS.map((p) => (
                  <th key={p.key}>{p.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {embudo.data.map((f) => (
                <tr key={f.canal}>
                  <td>{f.canal}</td>
                  {PASOS.map((p) => (
                    <td key={p.key}>
                      <Nd value={f[p.key]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="help">
        CAC = gasto de adquisición / nuevos clientes de pago atribuibles. Se indica siempre la ventana, la
        cobertura y las limitaciones de la medición.
      </p>
    </div>
  );
}
