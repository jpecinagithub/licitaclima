import { Link } from 'react-router-dom';

function PendingNotice() {
  return (
    <div className="pending-banner" role="note">
      <strong>PENDIENTE DE REVISIÓN.</strong> Este texto es una plantilla. No contiene datos comerciales reales
      (denominación social, domicilio, CIF, registro mercantil ni datos de contacto) porque aún no se han
      facilitado. No debe considerarse vigente hasta su revisión legal y fiscal.
    </div>
  );
}

export function TermsPage() {
  return (
    <div>
      <h1>Condiciones de contratación</h1>
      <PendingNotice />
      <h2>1. Objeto</h2>
      <p>
        LicitaClima es un servicio por suscripción que localiza y analiza licitaciones públicas españolas de
        climatización para pequeñas empresas. El servicio presta selección personalizada de oportunidades, lectura
        de pliegos con referencias verificables, comparación de requisitos con el perfil declarado de la empresa,
        vigilancia de rectificaciones y cambios, historial, favoritos, avisos y preguntas sobre documentos.
      </p>
      <h2>2. Fuera del alcance</h2>
      <p>
        El servicio no presenta ofertas, no firma documentos, no usa certificados de clientes, no compromete
        precios o garantías, no redacta ofertas completas, no garantiza aptitud legal, no garantiza cobertura total
        de España ni probabilidad de adjudicación. La decisión de participar en una licitación corresponde al
        cliente.
      </p>
      <h2>3. Plan y precio</h2>
      <p>
        Plan único: 49 €/mes + impuestos aplicables. Un usuario, un perfil de empresa, hasta tres provincias, diez
        análisis personalizados al mes y cien consultas de chat por periodo. La cuota se reinicia por periodo de
        suscripción, no por mes natural. Los precios y límites residen en la configuración versionada del servicio.
      </p>
      <h2>4. Pago</h2>
      <p>
        El pago se realiza mediante Stripe Checkout. El estado de la suscripción se concilia por webhook; la URL de
        éxito nunca activa el acceso por sí sola. Pendiente de completar: datos fiscales, tratamiento de impuestos
        y facturación.
      </p>
      <h2>5. Cancelación</h2>
      <p>
        El cliente puede cancelar desde su panel o escribiendo a soporte. Cancelar mantiene el acceso hasta el
        final del periodo pagado. Al vencer se conserva el acceso limitado a la cuenta y la facturación. Periodo de
        gracia tras un fallo de renovación: 3 días.
      </p>
      <h2>6. Datos declarados</h2>
      <p>
        Los datos del perfil de empresa son declarados por el cliente, no verificados por LicitaClima. El cliente
        es responsable de su veracidad.
      </p>
      <h2>7. Limitación de responsabilidad</h2>
      <p>
        Los análisis se basan en documentos públicos y pueden contener errores u omisiones. La ausencia de
        evidencia se marca expresamente. El cliente debe verificar siempre el anuncio y los pliegos oficiales
        antes de preparar una oferta.
      </p>
      <p>
        <Link to="/legal/privacidad">Privacidad</Link> ·{' '}
        <Link to="/legal/consentimiento">Consentimiento</Link>
      </p>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <div>
      <h1>Política de privacidad</h1>
      <PendingNotice />
      <h2>1. Responsable</h2>
      <p>Pendiente de completar: denominación social, domicilio, CIF y datos de contacto del responsable.</p>
      <h2>2. Datos que tratamos</h2>
      <ul>
        <li>Correo electrónico y datos de cuenta, para el acceso por magic link y las comunicaciones de cuenta.</li>
        <li>Perfil de empresa declarado (actividad, provincias, capacidad, experiencia, certificaciones).</li>
        <li>Oportunidades seguidas, favoritos, estados personales y preguntas sobre documentos.</li>
        <li>Datos de pago: se tratan a través de Stripe; LicitaClima no almacena tarjetas ni datos bancarios completos.</li>
        <li>Consentimientos, con versión del texto y fecha.</li>
      </ul>
      <h2>3. Finalidades</h2>
      <p>
        Prestar el servicio contratado, enviar el resumen semanal y las alertas solicitadas, gestionar cobros y
        soporte, y —solo con consentimiento separado, opcional y no premarcado— comunicaciones comerciales.
      </p>
      <h2>4. Conservación y derechos</h2>
      <p>
        Pendiente de completar: plazos de conservación, política de retención y procedimiento para ejercer los
        derechos de acceso, rectificación, supresión, limitación, portabilidad y oposición, así como la
        eliminación/exportación de los datos de la cuenta.
      </p>
      <h2>5. Destinatarios y transferencias</h2>
      <p>
        Pendiente de completar: proveedores (Stripe, proveedor de correo, proveedor LLM) y transferencias
        internacionales, en su caso.
      </p>
      <p>
        <Link to="/legal/condiciones">Condiciones</Link> ·{' '}
        <Link to="/legal/consentimiento">Consentimiento</Link>
      </p>
    </div>
  );
}

export function ConsentPage() {
  return (
    <div>
      <h1>Consentimiento</h1>
      <PendingNotice />
      <h2>Correo comercial</h2>
      <p>
        El correo comercial solo se envía con consentimiento separado, opcional, no premarcado y registrado con la
        versión del texto y la fecha. La solicitud de un informe autoriza su entrega, no una secuencia promocional
        indefinida. La baja es sencilla y existe una lista de supresión.
      </p>
      <h2>Boletines y promociones</h2>
      <p>
        Los boletines y promociones requieren doble confirmación. La secuencia comercial inicial para usuarios
        consentidos es de un máximo de tres mensajes en siete días y se detiene al comprar, al revocar el
        consentimiento o al finalizar la secuencia.
      </p>
      <h2>La baja no cancela el servicio</h2>
      <p>
        La baja de marketing no cancela las comunicaciones necesarias de cuenta. Desactivar las alertas no cancela
        la suscripción.
      </p>
      <h2>Analítica</h2>
      <p>
        El consentimiento para analítica o publicidad no esencial se recoge cuando sea necesario, con bloqueo
        previo de las etiquetas correspondientes. Las métricas de producto son mínimas y no incluyen contenidos
        privados.
      </p>
      <p>
        <Link to="/legal/condiciones">Condiciones</Link> ·{' '}
        <Link to="/legal/privacidad">Privacidad</Link>
      </p>
    </div>
  );
}
