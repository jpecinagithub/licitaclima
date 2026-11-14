import { Link } from 'react-router-dom';
import { PLAN } from '@licitaclima/config';
import { formatEur } from '../../lib/format.js';

/**
 * Precios y límites leídos de @licitaclima/config (única fuente).
 * No se hardcodean precios ni límites en esta página: si cambia la
 * configuración versionada, cambian aquí, en el panel y en Stripe.
 */
export function PricingPage() {
  return (
    <div>
      <h1>Precios</h1>
      <p>Un único plan. Sin uso ilimitado anunciado y sin permanencia anunciada en esta fase.</p>

      <div className="card" aria-labelledby="plan-nombre">
        <h2 id="plan-nombre">{PLAN.name}</h2>
        <p>
          <strong style={{ fontSize: '1.6rem' }}>{formatEur(PLAN.priceEurExclTax)} / mes</strong>{' '}
          <span className="muted">+ impuestos aplicables</span>
        </p>
        <p className="help">
          El precio no incluye impuestos. Los importes se cobran en EUR a través de Stripe (modo test durante el
          desarrollo). La cuota se reinicia por periodo de suscripción, no por mes natural.
        </p>
        <h3>Qué incluye</h3>
        <ul>
          <li>
            {PLAN.maxUsers} usuario · {PLAN.maxCompanyProfiles} perfil de empresa
          </li>
          <li>Hasta {PLAN.maxProvinces} provincias de servicio</li>
          <li>
            {PLAN.maxPersonalizedAnalysesPerPeriod} análisis personalizados completos al mes
          </li>
          <li>
            {PLAN.maxChatQuestionsPerPeriod} consultas de chat por periodo
          </li>
          <li>Resumen semanal + alertas cuando hay novedad en tus provincias</li>
          <li>Vigilancia de rectificaciones y cambios relevantes</li>
          <li>Favoritos, estados personales, historial de avisos y exportación PDF del análisis</li>
          <li>Soporte dentro de la web</li>
        </ul>
        <h3>Qué no incluye</h3>
        <ul>
          <li>No presenta ofertas, no firma documentos ni usa tus certificados.</li>
          <li>No garantiza aptitud legal, cobertura total de España ni probabilidad de adjudicación.</li>
        </ul>
        <p>
          <Link className="btn" to="/muestra">
            Probar la muestra gratuita
          </Link>{' '}
          <Link className="btn btn-secondary" to="/contacto">
            Preguntar antes de contratar
          </Link>
        </p>
      </div>

      <h2>Muestra gratuita</h2>
      <p>
        Una muestra útil de una oportunidad real, sin tarjeta y sin registro, con límites contra el abuso (3
        consultas por hora desde la misma dirección). Si no hay coincidencias, te lo decimos y te ofrecemos avisos
        gratuitos. No fabricamos oportunidades ni renovamos automáticamente una prueba sin contratación explícita.
      </p>

      <h2>Cancelación</h2>
      <p>
        Cancelar mantiene el acceso hasta el final del periodo pagado. Al vencer se conserva el acceso limitado a
        la cuenta y la facturación. El periodo de gracia tras un fallo de renovación es de{' '}
        {PLAN.graceDaysAfterFailedRenewal} días.
      </p>
      <p className="help">
        Precios y límites definidos en la configuración versionada del servicio (plan {PLAN.id}). Si cambian, se
        reflejan aquí y en el panel del cliente.
      </p>
    </div>
  );
}
