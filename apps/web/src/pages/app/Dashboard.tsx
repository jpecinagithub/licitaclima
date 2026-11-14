import { Link } from 'react-router-dom';
import { PLAN } from '@licitaclima/config';
import { getMe, getNotifications, getOpportunities, getUsage } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { EmptyState, ErrorState, Loading, Stat } from '../../components/ui.js';
import { OpportunityCard } from '../../components/OpportunityCard.js';
import { formatFecha } from '../../lib/format.js';

export function ClientDashboardPage() {
  const me = useApi(getMe);
  const opps = useApi(() => getOpportunities(new URLSearchParams({ limit: '5', estado: 'PUB' })));
  const avisos = useApi(getNotifications);
  const uso = useApi(getUsage);

  if (me.loading) return <Loading texto="Cargando tu panel…" />;
  if (me.error || !me.data) {
    return (
      <div>
        <h1>Panel del cliente</h1>
        <ErrorState
          titulo="No se ha podido cargar tu sesión"
          error={me.error}
          onRetry={me.reload}
          nota="Es necesario iniciar sesión con el magic link. El endpoint GET /me aún no está disponible (Fase B)."
        />
        <p>
          <Link className="btn" to="/acceso">
            Ir a Acceso clientes
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1>Inicio</h1>
      <p>
        Hola, <strong>{me.data.email}</strong>.{' '}
        {me.data.perfilCompleto ? (
          <>Tu perfil está completo.</>
        ) : (
          <>
            Tu perfil está incompleto.{' '}
            <Link to="/app/onboarding">Completa el onboarding</Link> para recibir oportunidades ajustadas.
          </>
        )}
      </p>

      <section aria-labelledby="estado-servicio">
        <h2 id="estado-servicio">Estado del servicio</h2>
        <div className="grid grid-3">
          <Stat label="Suscripción" value={me.data.suscripcion.estado} note={`Plan ${me.data.suscripcion.planId}`} />
          <Stat
            label="Análisis usados este periodo"
            value={
              uso.data
                ? `${uso.data.analisis.consumidos} de ${uso.data.analisis.limite}`
                : 'N/D'
            }
            note={uso.error ? 'Uso pendiente: GET /usage aún no disponible.' : `Límite del plan: ${PLAN.maxPersonalizedAnalysesPerPeriod}`}
          />
          <Stat
            label="Consultas de chat usadas"
            value={
              uso.data
                ? `${uso.data.consultasChat.consumidas} de ${uso.data.consultasChat.limite}`
                : 'N/D'
            }
            note={uso.error ? 'Uso pendiente: GET /usage aún no disponible.' : `Límite del plan: ${PLAN.maxChatQuestionsPerPeriod}`}
          />
        </div>
      </section>

      <section aria-labelledby="oportunidades-recientes">
        <h2 id="oportunidades-recientes">Oportunidades recientes</h2>
        {opps.loading ? (
          <Loading />
        ) : opps.error ? (
          <ErrorState error={opps.error} onRetry={opps.reload} nota="La lista de oportunidades (GET /opportunities) aún no está disponible." />
        ) : opps.data && opps.data.items.length === 0 ? (
          <EmptyState
            titulo="Sin oportunidades por ahora"
            texto="No hay oportunidades abiertas que encajen con tu perfil en este momento. El resumen semanal te avisará cuando haya novedades; no enviamos mensajes vacíos cada día."
          />
        ) : (
          opps.data?.items.map((o) => (
            <OpportunityCard key={o.id} opp={o} detailHref={`/app/oportunidades/${encodeURIComponent(o.id)}`} />
          ))
        )}
        <p>
          <Link to="/app/oportunidades">Ver todas las oportunidades</Link>
        </p>
      </section>

      <section aria-labelledby="cambios">
        <h2 id="cambios">Cambios y avisos</h2>
        {avisos.loading ? (
          <Loading />
        ) : avisos.error ? (
          <ErrorState error={avisos.error} onRetry={avisos.reload} nota="El historial de avisos (GET /notifications) aún no está disponible." />
        ) : avisos.data && avisos.data.length === 0 ? (
          <EmptyState titulo="Sin avisos" texto="No hay cambios ni rectificaciones en tus expedientes seguidos." />
        ) : (
          <ul>
            {avisos.data?.slice(0, 5).map((a) => (
              <li key={a.id}>
                <strong>{a.titulo}</strong> — {a.cuerpo}{' '}
                <span className="muted">({formatFecha(a.createdAt)})</span>
              </li>
            ))}
          </ul>
        )}
        <p>
          <Link to="/app/avisos">Historial de avisos</Link> ·{' '}
          <Link to="/app/preferencias">Preferencias de avisos</Link>
        </p>
      </section>
    </div>
  );
}
