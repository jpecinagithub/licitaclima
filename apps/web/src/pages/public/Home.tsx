import { Link } from 'react-router-dom';
import { PLAN } from '@licitaclima/config';
import { formatEur } from '../lib/format.js';
import { COVERAGE, SAMPLE_OPPORTUNITIES } from '../lib/sample.js';
import { OpportunityCard } from '../components/OpportunityCard.js';

export function HomePage() {
  const destacada = SAMPLE_OPPORTUNITIES[0];
  return (
    <div>
      <section className="hero" aria-labelledby="titulo-principal">
        <h1 id="titulo-principal">
          Encuentra licitaciones de climatización que encajan con tu empresa y entiende sus requisitos antes de
          dedicar tiempo a preparar una oferta
        </h1>
        <p className="lead">
          LicitaClima localiza licitaciones públicas españolas de climatización, lee los pliegos y te explica qué
          piden, con referencias verificables al documento, la página y el fragmento.
        </p>
        <p>
          <Link className="btn" to="/muestra">
            Ver una muestra real sin registro
          </Link>{' '}
          <Link className="btn btn-secondary" to="/precios">
            Ver precios
          </Link>
        </p>
        <p className="help">
          Plan único: {formatEur(PLAN.priceEurExclTax)} al mes + impuestos · {PLAN.maxProvinces} provincias ·{' '}
          {PLAN.maxPersonalizedAnalysesPerPeriod} análisis personalizados al mes · {PLAN.maxChatQuestionsPerPeriod}{' '}
          consultas de chat por periodo. Resumen semanal + alertas, nunca diario.
        </p>
      </section>

      <section aria-labelledby="que-hace">
        <h2 id="que-hace">Qué hace LicitaClima por tu empresa</h2>
        <div className="grid grid-3">
          <div className="card">
            <h3>Selección personalizada</h3>
            <p>
              Oportunidades vigentes filtradas por tu actividad y tus provincias, no un listado genérico de
              licitaciones.
            </p>
          </div>
          <div className="card">
            <h3>Lectura de pliegos con evidencias</h3>
            <p>
              Cada requisito indica su documento, su página y su fragmento. Lo que no consta en los documentos se
              marca como ausente, no se completa con suposiciones.
            </p>
          </div>
          <div className="card">
            <h3>Encaje con tu perfil</h3>
            <p>
              Comparamos cada requisito con los datos declarados de tu empresa: compatible, incompatible,
              desconocido o no aplicable. Un requisito obligatorio incompatible bloquea una recomendación positiva.
            </p>
          </div>
          <div className="card">
            <h3>Vigilancia de cambios</h3>
            <p>
              Rectificaciones y cambios relevantes del expediente, con aviso. Si cambia un pliego, las conclusiones
              afectadas se invalidan y se te notifica.
            </p>
          </div>
          <div className="card">
            <h3>Preguntas sobre los documentos</h3>
            <p>
              Chat limitado a los documentos del expediente y a tu perfil, con citas. Si no hay evidencia, la
              respuesta lo dice.
            </p>
          </div>
          <div className="card">
            <h3>Resumen semanal</h3>
            <p>
              Un resumen semanal de actividad y alertas cuando hay novedad en tus provincias. No enviamos mensajes
              vacíos cada día.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="fuera-alcance">
        <h2 id="fuera-alcance">Lo que LicitaClima no hace</h2>
        <p>
          No presenta ofertas por ti, no firma documentos, no usa tus certificados, no compromete precios ni
          garantías, no redacta ofertas completas y no garantiza aptitud legal, cobertura total de España ni
          probabilidad de adjudicación. La decisión de participar es siempre tuya.
        </p>
      </section>

      <section aria-labelledby="ejemplo-real">
        <h2 id="ejemplo-real">Un ejemplo real de la ventana de validación</h2>
        <p>
          Expediente de mantenimiento integral de climatización en Badajoz, publicado el 13 de noviembre de 2026
          en la Plataforma de Contratación del Sector Público (fuente 643).
        </p>
        <OpportunityCard opp={destacada} />
        <p>
          <Link to="/muestra">Ver la muestra completa</Link> ·{' '}
          <Link to="/cobertura">
            Cobertura: {COVERAGE.aperturasNucleo} aperturas de núcleo en {COVERAGE.ventana}
          </Link>
        </p>
      </section>

      <section aria-labelledby="empezar">
        <h2 id="empezar">Cómo empezar</h2>
        <ol>
          <li>
            <Link to="/muestra">Prueba la muestra</Link> con tu actividad y tu provincia, sin registro.
          </li>
          <li>
            <Link to="/como-funciona">Lee cómo funciona</Link> el servicio y el onboarding.
          </li>
          <li>
            <Link to="/precios">Contrata el plan</Link> cuando quieras: 49 €/mes + impuestos, sin permanencia
            anunciada en esta fase.
          </li>
        </ol>
      </section>
    </div>
  );
}
