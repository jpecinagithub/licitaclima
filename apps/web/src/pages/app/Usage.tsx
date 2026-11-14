import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PLAN } from '@licitaclima/config';
import { getSubscription, getUsage, openBillingPortal, requestCheckout } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { EmptyState, ErrorState, Loading, Stat } from '../../components/ui.js';
import { formatEur, formatFecha } from '../../lib/format.js';

export function UsagePage() {
  const uso = useApi(getUsage);
  const sub = useApi(getSubscription);
  const [accion, setAccion] = useState('');
  const [trabajando, setTrabajando] = useState(false);

  async function onCheckout() {
    setTrabajando(true);
    setAccion('');
    try {
      const r = await requestCheckout();
      window.location.href = r.url;
    } catch {
      setAccion('No se ha podido iniciar el pago: Stripe Checkout (test) aún no está configurado (Fase D).');
      setTrabajando(false);
    }
  }

  async function onPortal() {
    setTrabajando(true);
    setAccion('');
    try {
      const r = await openBillingPortal();
      window.location.href = r.url;
    } catch {
      setAccion('No se ha podido abrir el portal de facturación: aún no está configurado (Fase D).');
      setTrabajando(false);
    }
  }

  return (
    <div>
      <h1>Uso del plan y suscripción</h1>

      <section aria-labelledby="uso">
        <h2 id="uso">Uso de este periodo</h2>
        {uso.loading ? (
          <Loading />
        ) : uso.error || !uso.data ? (
          <ErrorState
            error={uso.error}
            onRetry={uso.reload}
            nota="El uso del plan (GET /usage) aún no está disponible (Fase D). Los límites del plan son los de la configuración versionada."
          />
        ) : (
          <div className="grid grid-2">
            <div className="card">
              <h3>Análisis personalizados</h3>
              <p>
                <strong>
                  {uso.data.analisis.consumidos} de {uso.data.analisis.limite}
                </strong>{' '}
                usados
              </p>
              <div className="progress" role="progressbar" aria-valuenow={uso.data.analisis.consumidos} aria-valuemin={0} aria-valuemax={uso.data.analisis.limite} aria-label="Análisis usados">
                <span style={{ width: `${(uso.data.analisis.consumidos / uso.data.analisis.limite) * 100}%` }} />
              </div>
              <p className="help">Revisitar un análisis no consume otra unidad.</p>
            </div>
            <div className="card">
              <h3>Consultas de chat</h3>
              <p>
                <strong>
                  {uso.data.consultasChat.consumidas} de {uso.data.consultasChat.limite}
                </strong>{' '}
                usadas
              </p>
              <div className="progress" role="progressbar" aria-valuenow={uso.data.consultasChat.consumidas} aria-valuemin={0} aria-valuemax={uso.data.consultasChat.limite} aria-label="Consultas de chat usadas">
                <span style={{ width: `${(uso.data.consultasChat.consumidas / uso.data.consultasChat.limite) * 100}%` }} />
              </div>
            </div>
          </div>
        )}
        <p className="help">
          Límites del plan {PLAN.name}: {PLAN.maxPersonalizedAnalysesPerPeriod} análisis y{' '}
          {PLAN.maxChatQuestionsPerPeriod} consultas por periodo. La cuota se reinicia por periodo de suscripción.
        </p>
      </section>

      <section aria-labelledby="suscripcion">
        <h2 id="suscripcion">Suscripción</h2>
        {sub.loading ? (
          <Loading />
        ) : sub.error || !sub.data ? (
          <ErrorState
            error={sub.error}
            onRetry={sub.reload}
            nota="La suscripción (GET /billing/subscription) aún no está disponible (Fase D)."
          />
        ) : (
          <div className="grid grid-3">
            <Stat label="Estado" value={sub.data.estado} />
            <Stat label="Fin del periodo" value={formatFecha(sub.data.periodoFin)} />
            <Stat label="Próxima factura" value={formatEur(sub.data.proximaFacturaEur)} note="Sin impuestos incluidos en esta cifra si el API no los desglosa." />
          </div>
        )}
        <p>
          <button type="button" className="btn" onClick={onCheckout} disabled={trabajando}>
            Contratar o renovar (Stripe test)
          </button>{' '}
          <button type="button" className="btn btn-secondary" onClick={onPortal} disabled={trabajando}>
            Gestionar facturación y cancelación
          </button>
        </p>
        {accion ? <p role="status">{accion}</p> : null}
        <p className="help">
          Cancelar mantiene el acceso hasta el final del periodo pagado. Al vencer se conserva el acceso limitado
          a la cuenta y la facturación. Periodo de gracia tras un fallo de renovación:{' '}
          {PLAN.graceDaysAfterFailedRenewal} días.
        </p>
        <EmptyState
          titulo="Soporte"
          texto="¿Un problema con tu plan o tu factura? Abre un ticket desde la página de soporte."
        >
          <Link className="btn btn-secondary" to="/app/soporte">
            Ir a soporte
          </Link>
        </EmptyState>
      </section>
    </div>
  );
}
