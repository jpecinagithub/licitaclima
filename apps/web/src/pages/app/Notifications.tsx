import { Link } from 'react-router-dom';
import { getNotifications } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { EmptyState, ErrorState, Loading } from '../../components/ui.js';
import { formatInstante } from '../../lib/format.js';

export function NotificationsPage() {
  const avisos = useApi(getNotifications);
  return (
    <div>
      <h1>Historial de avisos</h1>
      <p>
        Nuevas oportunidades, cambios y rectificaciones de los expedientes que sigues. El resumen es semanal;
        las alertas llegan cuando hay novedad en tus provincias.
      </p>
      {avisos.loading ? (
        <Loading />
      ) : avisos.error ? (
        <ErrorState
          error={avisos.error}
          onRetry={avisos.reload}
          nota="El historial de avisos (GET /notifications) aún no está disponible (Fase D)."
        />
      ) : avisos.data && avisos.data.length === 0 ? (
        <EmptyState
          titulo="Sin avisos"
          texto="No hay avisos todavía. Cuando aparezca una oportunidad o cambie un expediente que sigues, aparecerá aquí."
        />
      ) : (
        <ul>
          {avisos.data?.map((a) => (
            <li key={a.id}>
              <strong>{a.titulo}</strong> {a.leida ? '' : '(sin leer)'} — {a.cuerpo}{' '}
              <span className="muted">{formatInstante(a.createdAt)} (Europe/Madrid)</span>
              {a.tenderId ? (
                <>
                  {' '}
                  <Link to={`/app/oportunidades/${encodeURIComponent(a.tenderId)}`}>Ver expediente</Link>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <p>
        <Link to="/app/preferencias">Preferencias de avisos</Link>
      </p>
    </div>
  );
}
