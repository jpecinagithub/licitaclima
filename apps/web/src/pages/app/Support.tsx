import { useState } from 'react';
import type { FormEvent } from 'react';
import { createSupportTicket, getSupportTickets } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { EmptyState, ErrorState, Loading } from '../../components/ui.js';
import { formatInstante } from '../../lib/format.js';

export function SupportPage() {
  const tickets = useApi(getSupportTickets);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  async function onCrear(e: FormEvent) {
    e.preventDefault();
    const form = new FormData(e.target as HTMLFormElement);
    setEnviando(true);
    setMensaje('');
    try {
      await createSupportTicket({
        asunto: String(form.get('asunto') ?? ''),
        mensaje: String(form.get('mensaje') ?? ''),
        prioridad: String(form.get('prioridad') ?? 'normal'),
      });
      setMensaje('Ticket creado. Te responderemos desde la web.');
      tickets.reload();
      (e.target as HTMLFormElement).reset();
    } catch {
      setMensaje('No se ha podido crear el ticket: el endpoint aún no está disponible (Fase D).');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <h1>Soporte</h1>
      <p>
        El soporte principal es dentro de la web. El agente contesta sobre uso, cuenta y documentos autorizados.
        No promete compensaciones ni modifica datos sensibles desde texto libre. Las peticiones de pago, identidad
        o seguridad se resuelven en sesión autenticada o se escalan. Cuando la respuesta es automatizada, se
        informa.
      </p>

      <h2>Mis tickets</h2>
      {tickets.loading ? (
        <Loading />
      ) : tickets.error ? (
        <ErrorState
          error={tickets.error}
          onRetry={tickets.reload}
          nota="La lista de tickets (GET /support/tickets) aún no está disponible (Fase D)."
        />
      ) : tickets.data && tickets.data.length === 0 ? (
        <EmptyState titulo="Sin tickets" texto="No has abierto ningún ticket todavía." />
      ) : (
        <ul>
          {tickets.data?.map((t) => (
            <li key={t.id}>
              <strong>{t.asunto}</strong> — {t.estado} · prioridad {t.prioridad} ·{' '}
              <span className="muted">{formatInstante(t.createdAt)} (Europe/Madrid)</span>
            </li>
          ))}
        </ul>
      )}

      <h2>Abrir un ticket</h2>
      <form onSubmit={onCrear} aria-label="Abrir ticket de soporte">
        <div className="field">
          <label htmlFor="soporte-asunto">Asunto</label>
          <input id="soporte-asunto" name="asunto" required />
        </div>
        <div className="field">
          <label htmlFor="soporte-prioridad">Prioridad</label>
          <select id="soporte-prioridad" name="prioridad" defaultValue="normal">
            <option value="baja">Baja</option>
            <option value="normal">Normal</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="soporte-mensaje">Mensaje</label>
          <textarea id="soporte-mensaje" name="mensaje" rows={5} required />
          <p className="help">No incluyas contraseñas, tarjetas ni datos bancarios en el mensaje.</p>
        </div>
        <button type="submit" className="btn" disabled={enviando}>
          {enviando ? 'Enviando…' : 'Crear ticket'}
        </button>
        {mensaje ? <p role="status">{mensaje}</p> : null}
      </form>
    </div>
  );
}
