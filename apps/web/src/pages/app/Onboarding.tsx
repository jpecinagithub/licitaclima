import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { PLAN } from '@licitaclima/config';
import { updateProfile } from '../../lib/api.js';

/**
 * Onboarding: conversación guiada (pasos) + formulario editable.
 * Al final se muestra un resumen para confirmación antes de guardar.
 * Guardar requiere PATCH /company-profile (Fase B); si el endpoint no
 * existe, se informa sin fingir que el perfil quedó guardado.
 */
const PASOS = [
  {
    id: 'actividad',
    pregunta: '¿A qué se dedica tu empresa?',
    ayuda: 'Elige la actividad principal. Podrás añadir más después.',
    opciones: ['Mantenimiento de climatización', 'Instalación de climatización', 'Mantenimiento e instalación'],
  },
  {
    id: 'provincias',
    pregunta: '¿En qué provincias trabajas?',
    ayuda: `Hasta ${PLAN.maxProvinces} provincias. Las oportunidades se filtran por ellas.`,
    opciones: [] as string[],
  },
  {
    id: 'tamano',
    pregunta: '¿Qué tamaño de contrato te interesa?',
    ayuda: 'Orientativo: sirve para ordenar las oportunidades, no es un filtro excluyente.',
    opciones: ['Menos de 10.000 €', '10.000 – 50.000 €', '50.000 – 200.000 €', 'Más de 200.000 €'],
  },
];

export function OnboardingPage() {
  const [paso, setPaso] = useState(0);
  const [respuestas, setRespuestas] = useState<Record<string, string>>({});
  const [provincias, setProvincias] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [confirmado, setConfirmado] = useState(false);

  const pasoActual = PASOS[paso];
  const resumenListo = paso >= PASOS.length;

  function elegir(opcion: string) {
    setRespuestas((r) => ({ ...r, [pasoActual.id]: opcion }));
    setPaso((p) => p + 1);
  }

  async function onConfirmar(e: FormEvent) {
    e.preventDefault();
    setGuardando(true);
    setMensaje('');
    try {
      await updateProfile({
        actividad: respuestas.actividad ? [respuestas.actividad] : [],
        provincias: provincias
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean)
          .slice(0, PLAN.maxProvinces),
      });
      setConfirmado(true);
      setMensaje('Perfil guardado. Ya puedes ver tus oportunidades.');
    } catch {
      setMensaje(
        'No se ha podido guardar el perfil: el endpoint aún no está disponible (Fase B). Tus respuestas no se han guardado; puedes copiar el resumen y volver más tarde.',
      );
    } finally {
      setGuardando(false);
    }
  }

  if (confirmado) {
    return (
      <div>
        <h1>Perfil completo</h1>
        <p role="status">{mensaje}</p>
        <p>
          <Link className="btn" to="/app/oportunidades">
            Ver mis oportunidades
          </Link>{' '}
          <Link className="btn btn-secondary" to="/app/perfil">
            Editar perfil
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1>Conoce tu empresa</h1>
      <p>
        Tres preguntas guiadas y luego el formulario completo, editable. Al final verás un resumen para
        confirmarlo antes de guardar. Los datos son declarados, no verificados.
      </p>
      <p className="muted">
        Paso {Math.min(paso + 1, PASOS.length + 1)} de {PASOS.length + 1}
      </p>

      {!resumenListo ? (
        <section aria-live="polite">
          <h2>{pasoActual.pregunta}</h2>
          <p>{pasoActual.ayuda}</p>
          {pasoActual.id === 'provincias' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (provincias.trim()) {
                  setRespuestas((r) => ({ ...r, provincias }));
                  setPaso((p) => p + 1);
                }
              }}
            >
              <div className="field">
                <label htmlFor="onb-provincias">Provincias (separadas por comas, máximo {PLAN.maxProvinces})</label>
                <input
                  id="onb-provincias"
                  value={provincias}
                  onChange={(e) => setProvincias(e.target.value)}
                  placeholder="Badajoz, Cáceres, Madrid"
                  required
                />
              </div>
              <button type="submit" className="btn">
                Continuar
              </button>
            </form>
          ) : (
            <div className="tabs" role="group" aria-label="Opciones">
              {pasoActual.opciones.map((op) => (
                <button key={op} type="button" className="btn btn-secondary" onClick={() => elegir(op)}>
                  {op}
                </button>
              ))}
            </div>
          )}
          {paso > 0 ? (
            <p>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setPaso((p) => p - 1)}>
                Volver
              </button>
            </p>
          ) : null}
        </section>
      ) : (
        <section aria-live="polite">
          <h2>Resumen para confirmación</h2>
          <dl className="kv">
            <dt>Actividad</dt>
            <dd>{respuestas.actividad ?? 'N/D'}</dd>
            <dt>Provincias</dt>
            <dd>{respuestas.provincias ?? 'N/D'}</dd>
            <dt>Tamaño orientativo</dt>
            <dd>{respuestas.tamano ?? 'N/D'}</dd>
          </dl>
          <p>
            ¿Algo incorrecto? Puedes <Link to="/app/perfil">editar el perfil completo</Link> después de confirmar,
            y cada cambio quedará versionado.
          </p>
          <form onSubmit={onConfirmar}>
            <button type="submit" className="btn" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Confirmar y guardar perfil'}
            </button>{' '}
            <button type="button" className="btn btn-secondary" onClick={() => setPaso(0)}>
              Empezar de nuevo
            </button>
          </form>
          {mensaje ? <p role="status">{mensaje}</p> : null}
        </section>
      )}
    </div>
  );
}
