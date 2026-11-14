import { Link } from 'react-router-dom';
import { SampleForm } from '../../components/SampleForm.js';
import { COVERAGE } from '../../lib/sample.js';

export function SamplePage() {
  return (
    <div>
      <h1>Muestra gratuita</h1>
      <p>
        Una oportunidad real, sin registro y sin tarjeta. Elige tu actividad y tu provincia y verás las
        aperturas reales de la ventana de validación ({COVERAGE.ventana}) que coinciden con tu búsqueda.
      </p>
      <p>
        Estas oportunidades proceden de los feeds oficiales 643 y 1044 de la Plataforma de Contratación del Sector
        Público. Los plazos corresponden a esa ventana y pueden estar vencidos: son expedientes reales, no ofertas
        vigentes. Comprueba siempre el anuncio oficial antes de preparar una oferta.
      </p>
      <SampleForm />
      <p className="help">
        ¿Quieres la selección completa y el análisis con evidencias?{' '}
        <Link to="/precios">Ver el plan (49 €/mes + impuestos)</Link>.
      </p>
    </div>
  );
}
