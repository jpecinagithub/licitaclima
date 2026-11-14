import { Link } from 'react-router-dom';
import { PLAN } from '@licitaclima/config';

export function HowItWorksPage() {
  return (
    <div>
      <h1>Cómo funciona</h1>
      <p>
        LicitaClima convierte los anuncios oficiales de contratación pública en oportunidades comprensibles para tu
        empresa, con evidencias verificables en cada afirmación.
      </p>

      <h2>El recorrido, paso a paso</h2>
      <ol>
        <li>
          <strong>Muestra sin registro.</strong> En <Link to="/muestra">/muestra</Link> eliges actividad y
          provincia y ves oportunidades reales de la ventana de validación, sin tarjeta.
        </li>
        <li>
          <strong>Registro con magic link.</strong> Te enviamos un enlace de un solo uso, válido 15 minutos. Sin
          contraseñas que gestionar.
        </li>
        <li>
          <strong>Onboarding guiado.</strong> Una conversación guiada más un formulario editable recogen tu perfil:
          actividad, provincias de servicio (hasta {PLAN.maxProvinces}), tamaño orientativo de contratos,
          capacidad operativa, experiencia y certificaciones declaradas. Ves un resumen para confirmarlo antes de
          guardar. Los datos son declarados, no verificados.
        </li>
        <li>
          <strong>Selección semanal.</strong> Cada semana recibes un resumen con las oportunidades que encajan con
          tu perfil y alertas cuando hay novedad en tus provincias.
        </li>
        <li>
          <strong>Análisis personalizado.</strong> Pides el análisis completo de un expediente (hasta{' '}
          {PLAN.maxPersonalizedAnalysesPerPeriod} al mes). El análisis extrae objeto, importes, plazos, solvencia,
          garantías, criterios de adjudicación y documentación requerida, cada punto con su evidencia: documento,
          página y fragmento.
        </li>
        <li>
          <strong>Preguntas con citas.</strong> Preguntas sobre los documentos del expediente (hasta{' '}
          {PLAN.maxChatQuestionsPerPeriod} por periodo). Si no hay evidencia, la respuesta lo dice.
        </li>
        <li>
          <strong>Decides tú.</strong> Marcas cada oportunidad como pendiente, a estudiar, descartada o
          presentada. LicitaClima no presenta ofertas por ti.
        </li>
      </ol>

      <h2>De dónde salen los datos</h2>
      <p>
        De los conjuntos oficiales de la Plataforma de Contratación del Sector Público: perfiles de contratante
        alojados (fuente 643) y plataformas agregadas sin contratos menores (fuente 1044). La ingesta se hace cada
        6 horas y se conserva el identificador original, la fuente, la URL, las fechas de publicación y
        modificación, la fecha de captura y el hash de cada documento. Detalle y cifras reales en{' '}
        <Link to="/cobertura">Cobertura</Link>.
      </p>

      <h2>Qué significa cada estado del encaje</h2>
      <ul>
        <li>
          <strong>Compatible:</strong> el requisito se cumple según tu perfil declarado y la evidencia del pliego.
        </li>
        <li>
          <strong>Incompatible:</strong> el requisito choca con tu perfil. Si es obligatorio, bloquea una
          recomendación positiva.
        </li>
        <li>
          <strong>Desconocido:</strong> ni el pliego ni tu perfil permiten decidirlo. Desconocido no equivale a
          cumplido.
        </li>
        <li>
          <strong>No aplicable:</strong> el requisito no afecta a tu empresa.
        </li>
      </ul>
      <p>
        La puntuación de encaje no representa probabilidad de ganar ni certificación de aptitud legal. Es una
        ayuda para priorizar, explicable requisito a requisito.
      </p>

      <h2>Cuotas del plan</h2>
      <p>
        Los {PLAN.maxPersonalizedAnalysesPerPeriod} análisis del plan son análisis personalizados solicitados de
        expedientes o versiones, según la política visible en el panel. Revisitar un análisis no consume otra
        unidad. Las rectificaciones oficiales del mismo expediente durante el periodo no consumen una unidad
        adicional. La cuota se reserva al iniciar, se confirma al entregar y se libera si el análisis falla. Los
        filtros y las fichas básicas no consumen análisis.
      </p>
      <p>
        <Link className="btn" to="/muestra">
          Probar la muestra
        </Link>{' '}
        <Link className="btn btn-secondary" to="/precios">
          Ver precios
        </Link>
      </p>
    </div>
  );
}
