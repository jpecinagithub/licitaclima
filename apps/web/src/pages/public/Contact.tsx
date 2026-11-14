import { useState } from 'react';
import type { FormEvent } from 'react';

/**
 * Contacto. PENDIENTE: la dirección de correo de contacto y el canal de
 * soporte los debe confirmar Jon (Gmail dedicada pendiente, Fase D).
 * Este formulario no envía nada hasta que exista el endpoint de contacto:
 * el envío se marca como pendiente y no se finge un envío realizado.
 */
export function ContactPage() {
  const [enviado, setEnviado] = useState(false);
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setEnviado(true);
  }
  return (
    <div>
      <h1>Contacto</h1>
      <p>
        Escríbenos para preguntar por el servicio, la cobertura de tu provincia o la contratación. Respondemos
        desde la web; el correo de contacto se publicará cuando esté configurada la cuenta dedicada.
      </p>
      <div className="pending-banner" role="note">
        <strong>Contacto pendiente de configurar.</strong> La dirección de correo y el envío de este formulario
        dependen del buzón dedicado (pendiente, Fase D). De momento, el formulario no envía ningún mensaje.
      </div>
      <form onSubmit={onSubmit} aria-label="Formulario de contacto">
        <div className="field">
          <label htmlFor="contacto-nombre">Nombre</label>
          <input id="contacto-nombre" name="nombre" autoComplete="name" required />
        </div>
        <div className="field">
          <label htmlFor="contacto-email">Correo electrónico</label>
          <input id="contacto-email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="contacto-asunto">Asunto</label>
          <select id="contacto-asunto" name="asunto" required>
            <option value="">Elige un asunto</option>
            <option value="servicio">Pregunta sobre el servicio</option>
            <option value="cobertura">Cobertura de mi provincia</option>
            <option value="contratacion">Contratación y facturación</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="contacto-mensaje">Mensaje</label>
          <textarea id="contacto-mensaje" name="mensaje" rows={6} required />
        </div>
        <button type="submit" className="btn">
          Enviar mensaje
        </button>
        {enviado ? (
          <p role="status">
            Formulario registrado localmente en tu navegador. El envío por correo está pendiente de configurar:
            todavía no hemos recibido tu mensaje. Vuelve a intentarlo cuando el contacto esté activo.
          </p>
        ) : null}
      </form>
    </div>
  );
}
