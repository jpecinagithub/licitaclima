import { useState } from 'react';
import type { FormEvent } from 'react';
import { ACTIVIDADES, SAMPLE_OPPORTUNITIES, SAMPLE_PROVINCIAS } from '../lib/sample.js';
import { submitLead } from '../lib/api.js';
import { OpportunityCard } from './OpportunityCard.js';
import { EmptyState } from './ui.js';

/**
 * Formulario mínimo de muestra: actividad + provincia.
 * Filtra la muestra REAL de la ventana de validación (sin registro).
 * Límites antiabuso visibles: 3 consultas por hora y dirección, sin tarjeta.
 * Guardar el correo (para recibir el informe y avisos gratuitos) requiere
 * verificación por correo; el registro lo hace POST /api/v1/leads (Fase D).
 */
export function SampleForm() {
  const [actividad, setActividad] = useState('');
  const [provincia, setProvincia] = useState('');
  const [consultado, setConsultado] = useState(false);
  const [email, setEmail] = useState('');
  const [consentimiento, setConsentimiento] = useState(false);
  const [guardado, setGuardado] = useState<'ok' | 'error' | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorForm, setErrorForm] = useState('');

  const resultados = consultado
    ? SAMPLE_OPPORTUNITIES.filter(
        (o) =>
          (provincia === '' || o.provincia === provincia) &&
          (actividad === '' ||
            actividad === 'Mantenimiento e instalación' ||
            (actividad === 'Mantenimiento de climatización' && /mantenimiento/i.test(o.titulo)) ||
            (actividad === 'Instalación de climatización' && /instalaci|subministrament|suministro|obras/i.test(o.titulo)) ||
            (actividad === 'Refrigeración / frío industrial' && /frigor/i.test(o.titulo))),
      )
    : [];

  function onConsultar(e: FormEvent) {
    e.preventDefault();
    if (!actividad || !provincia) {
      setErrorForm('Elige una actividad y una provincia para ver la muestra.');
      return;
    }
    setErrorForm('');
    setConsultado(true);
  }

  async function onGuardar(e: FormEvent) {
    e.preventDefault();
    setGuardado(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setGuardado('error');
      return;
    }
    setGuardando(true);
    try {
      await submitLead({ email, actividad, provincia, consentimientoMarketing: consentimiento });
      setGuardado('ok');
    } catch {
      setGuardado('error');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <form onSubmit={onConsultar} aria-label="Formulario de muestra">
        <div className="field">
          <label htmlFor="muestra-actividad">Actividad de tu empresa</label>
          <select id="muestra-actividad" value={actividad} onChange={(e) => setActividad(e.target.value)} required>
            <option value="">Elige una actividad</option>
            {ACTIVIDADES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="muestra-provincia">Provincia</label>
          <select id="muestra-provincia" value={provincia} onChange={(e) => setProvincia(e.target.value)} required>
            <option value="">Elige una provincia</option>
            {SAMPLE_PROVINCIAS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <p className="help">
            La muestra pública cubre las provincias con aperturas reales en la ventana 15 oct – 14 nov 2026.
            La lista completa, por provincia, está en <a href="/cobertura">Cobertura</a>.
          </p>
        </div>
        {errorForm ? (
          <p className="field-error" role="alert">
            {errorForm}
          </p>
        ) : null}
        <button type="submit" className="btn">
          Ver muestra
        </button>
        <p className="help">
          Sin registro y sin tarjeta. Límite antiabuso: 3 consultas por hora desde la misma dirección.
          Solo se usan tu actividad y tu provincia para filtrar la muestra.
        </p>
      </form>

      {consultado ? (
        <section aria-live="polite">
          <h2>
            Resultados de la muestra — {actividad}, {provincia}
          </h2>
          {resultados.length === 0 ? (
            <EmptyState
              titulo="Sin coincidencias en esta muestra"
              texto="En la ventana de validación (15 oct – 14 nov 2026) no hay ninguna apertura de núcleo para esa actividad y provincia en la muestra pública. Eso no significa que no existan licitaciones: la muestra es un subconjunto real, no el catálogo completo."
            >
              <p>
                Puedes dejar tu correo para recibir avisos gratuitos cuando aparezca una oportunidad en tu
                provincia. Sin tarjeta y sin compromiso.
              </p>
            </EmptyState>
          ) : (
            <>
              <p>
                {resultados.length} {resultados.length === 1 ? 'oportunidad real' : 'oportunidades reales'} en la
                muestra pública para esa provincia. Los plazos corresponden a la ventana de validación y pueden
                estar vencidos: son expedientes reales, no ofertas vigentes.
              </p>
              {resultados.map((o) => (
                <OpportunityCard key={o.id} opp={o} />
              ))}
            </>
          )}

          <h3>Guardar estos resultados y recibir avisos gratuitos</h3>
          <form onSubmit={onGuardar} aria-label="Guardar resultados de la muestra">
            <div className="field">
              <label htmlFor="muestra-email">Correo electrónico</label>
              <input
                id="muestra-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <p className="help">
                Te enviaremos un correo de verificación. La solicitud de este informe autoriza solo su entrega,
                no una secuencia promocional.
              </p>
            </div>
            <div className="field">
              <input
                id="muestra-consentimiento"
                type="checkbox"
                checked={consentimiento}
                onChange={(e) => setConsentimiento(e.target.checked)}
              />{' '}
              <label htmlFor="muestra-consentimiento" style={{ display: 'inline', fontWeight: 400 }}>
                Quiero recibir además comunicaciones comerciales de LicitaClima (opcional, no premarcado).
              </label>
            </div>
            <button type="submit" className="btn" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Enviarme el informe'}
            </button>
            {guardado === 'ok' ? (
              <p role="status">Solicitud registrada. Revisa tu correo para verificar la dirección.</p>
            ) : null}
            {guardado === 'error' ? (
              <p className="field-error" role="alert">
                No hemos podido guardar tu solicitud: el servicio de registro aún no está disponible. Vuelve a
                intentarlo más tarde; no se ha guardado ningún dato.
              </p>
            ) : null}
          </form>
        </section>
      ) : null}
    </div>
  );
}
