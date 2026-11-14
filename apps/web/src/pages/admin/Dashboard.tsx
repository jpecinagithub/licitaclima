import { apiGet } from '../../lib/api.js';
import type { AdminSummaryData } from '../../lib/admin.js';
import { useApi } from '../../lib/useApi.js';
import { ErrorState, Loading, Stat } from '../../components/ui.js';
import { PauseControls } from '../../components/PauseControls.js';
import { formatEur } from '../../lib/format.js';

export function AdminDashboardPage() {
  const resumen = useApi(() => apiGet<AdminSummaryData>('/admin/summary'));
  return (
    <div>
      <h1>Resumen</h1>
      {resumen.loading ? (
        <Loading />
      ) : resumen.error || !resumen.data ? (
        <ErrorState
          error={resumen.error}
          onRetry={resumen.reload}
          nota="El resumen de administración (GET /admin/summary) aún no está disponible (Fase E). Todos los valores se muestran como N/D hasta que el API los devuelva."
        />
      ) : (
        <>
          <p className="muted">Periodo: {resumen.data.periodo ?? 'N/D'}</p>
          <div className="grid grid-3">
            <Stat label="MRR (sin impuestos)" value={formatEur(resumen.data.mrrSinImpuestosEur)} note="Excluye impuestos y cargos únicos." />
            <Stat label="Clientes activos" value={resumen.data.clientesActivos ?? 'N/D'} />
            <Stat label="Altas en el periodo" value={resumen.data.altasPeriodo ?? 'N/D'} />
            <Stat label="Bajas en el periodo" value={resumen.data.bajasPeriodo ?? 'N/D'} />
            <Stat label="Análisis en el periodo" value={resumen.data.analisisPeriodo ?? 'N/D'} />
            <Stat label="Excepciones abiertas" value={resumen.data.excepcionesAbiertas ?? 'N/D'} />
          </div>
        </>
      )}
      <h2>Pausas de emergencia</h2>
      <PauseControls />
    </div>
  );
}
