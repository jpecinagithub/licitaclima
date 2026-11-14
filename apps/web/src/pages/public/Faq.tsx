import { Link } from 'react-router-dom';

const FAQS: { q: string; a: string }[] = [
  {
    q: '¿Qué es LicitaClima?',
    a: 'Un servicio por suscripción que localiza licitaciones públicas españolas de climatización, lee los pliegos y explica sus requisitos con referencias verificables (documento, página y fragmento), para que una pequeña empresa decida si le compensa preparar una oferta.',
  },
  {
    q: '¿La muestra es gratuita de verdad?',
    a: 'Sí: una oportunidad real, sin registro y sin tarjeta, con tu actividad y tu provincia. Tiene límites contra el abuso (3 consultas por hora desde la misma dirección). Si quieres guardar los resultados, te pedimos el correo y lo verificamos.',
  },
  {
    q: '¿Me garantiza ganar licitaciones?',
    a: 'No. LicitaClima no promete ventas, adjudicaciones ni probabilidad de ganar. Tampoco garantiza aptitud legal ni cobertura total de España. La decisión de participar es siempre tuya.',
  },
  {
    q: '¿Cuánto cuesta?',
    a: '49 € al mes + impuestos. Un usuario, un perfil de empresa, hasta 3 provincias, 10 análisis personalizados al mes y 100 consultas de chat por periodo. Los límites están en la configuración del servicio y se muestran igual en la web y en el panel.',
  },
  {
    q: '¿Cada cuánto recibo el resumen?',
    a: 'Resumen semanal + alertas cuando hay novedad en tus provincias. No enviamos resúmenes diarios ni mensajes vacíos.',
  },
  {
    q: '¿Qué pasa si un análisis no tiene evidencia para un requisito?',
    a: 'Se marca como desconocido, con el motivo, y no se completa con conocimientos generales. Un requisito desconocido no equivale a cumplido, y un requisito obligatorio incompatible bloquea una recomendación positiva.',
  },
  {
    q: '¿Cubrís todas las licitaciones de España?',
    a: 'No. Cubrimos los dos conjuntos oficiales de la Plataforma de Contratación del Sector Público (fuentes 643 y 1044, sin contratos menores). No afirmamos cobertura exhaustiva de las plataformas autonómicas. Las fuentes y la última sincronización están en la página de Cobertura.',
  },
  {
    q: '¿Cómo me registro?',
    a: 'Con un magic link: te enviamos un enlace de un solo uso, válido 15 minutos, a tu correo. No hay contraseña que gestionar. Después completas tu perfil en el onboarding guiado.',
  },
  {
    q: '¿Presentáis ofertas por mí?',
    a: 'No. LicitaClima no presenta ofertas, no firma documentos, no usa tus certificados, no compromete precios ni garantías y no redacta ofertas completas.',
  },
  {
    q: '¿Cómo cancelo?',
    a: 'Desde el panel del cliente, en Suscripción, o escribiendo a soporte. Cancelar mantiene el acceso hasta el final del periodo pagado. La baja de marketing no cancela las comunicaciones necesarias de cuenta, y desactivar alertas no cancela la suscripción.',
  },
  {
    q: '¿Qué datos pedís de mi empresa?',
    a: 'Actividad, provincias de servicio, tamaño orientativo de contratos, capacidad operativa, experiencia, certificaciones declaradas y preferencias. Son datos declarados, no verificados. No pedimos documentación sensible en el MVP.',
  },
  {
    q: '¿De dónde salen los datos de las licitaciones?',
    a: 'De los feeds Atom oficiales de la Plataforma de Contratación del Sector Público. Conservamos el identificador original, la fuente, la URL y las fechas oficiales, y enlazamos siempre al anuncio oficial.',
  },
];

export function FaqPage() {
  return (
    <div className="faq">
      <h1>Preguntas frecuentes</h1>
      {FAQS.map((f) => (
        <details key={f.q}>
          <summary>{f.q}</summary>
          <p>{f.a}</p>
        </details>
      ))}
      <p>
        ¿Otra pregunta? <Link to="/contacto">Escríbenos</Link>.
      </p>
    </div>
  );
}
