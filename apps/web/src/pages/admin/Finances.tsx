import { apiGet } from '../../lib/api.js';
import type { FinancesData } from '../../lib/admin.js';
import { useApi } from '../../lib/useApi.js';
import { ErrorState, Loading } from '../../components/ui.js';
import { formatEur } from '../../lib/format.js';

function Row({ label, value, note }: { label: string; value: number | null; note?: string }) {
  return (
    <tr>
      <td>{label}</td>
      <td>{formatEur(value)}</td>
      <td className="muted">{note ?? ''}</td>
    </tr>
  );
}

export function AdminFinancesPage() {
  const fin = useApi(() => apiGet<FinancesData>('/admin/finances'));
  const d = fin.data;
  return (
    <div>
      <h1>Finanzas</h1>
      <p>
        Todos los importes sin impuestos. La contribución estimada no es el beneficio neto: no incluye todos los
        costes ni las obligaciones fiscales. Con una muestra mínima, el LTV se marca como estimación, no como dato
        fiable.
      </p>
      {fin.loading ? (
        <Loading />
      ) : fin.error || !d ? (
        <ErrorState
          error={fin.error}
          onRetry={fin.reload}
          nota="Las finanzas (GET /admin/finances) aún no están disponibles (Fase E). Todos los importes se muestran como N/D."
        />
      ) : (
        <>
          <p className="muted">Periodo: {d.periodo ?? 'N/D'}</p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th>Importe</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                <Row label="Ingresos sin impuestos" value={d.ingresosSinImpuestosEur} />
                <Row label="Reembolsos" value={d.reembolsosEur} />
                <Row label="Comisiones de Stripe (conocidas/estimadas)" value={d.comisionesStripeEur} note="No codificar comisiones históricas como constantes universales." />
                <Row label="Coste de IA" value={d.costeIaEur} />
                <Row label="Coste de correo" value={d.costeCorreoEur} />
                <Row label="Gasto de publicidad" value={d.gastoPublicidadEur} />
                <Row label="Contribución estimada" value={d.contribucionEstimadaEur} note="Contribución, no beneficio neto." />
              </tbody>
            </table>
          </div>
          {d.notaLtv ? <p className="help">{d.notaLtv}</p> : null}
        </>
      )}
    </div>
  );
}
