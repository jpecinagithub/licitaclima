import { useState } from 'react';
import type { FormEvent } from 'react';
import { getNotificationPreferences, updateNotificationPreferences } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { ErrorState, Loading } from '../../components/ui.js';

const NOTA_PENDIENTE =
  'Las preferencias de avisos (GET/PATCH /notification-preferences) aún no están disponibles (Fase D).';

export function PreferencesPage() {
  const prefs = useApi(getNotificationPreferences);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  async function onGuardar(e: FormEvent) {
    e.preventDefault();
    const form = new FormData(e.target as HTMLFormElement);
    setGuardando(true);
    setMensaje('');
    try {
      await updateNotificationPreferences({
        resumen: 'semanal',
        alertas: form.get('alertas') === 'on',
        alertasNuevasOportunidades: form.get('alertasNuevas') === 'on',
        alertasRectificaciones: form.get('alertasRectif') === 'on',
        emailResumen: form.get('emailResumen') === 'on',
      });
      setMensaje('Preferencias guardadas.');
      prefs.reload();
    } catch {
      setMensaje('No se han podido guardar las preferencias: el endpoint aún no está disponible.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <h1>Preferencias de avisos</h1>
      <p>
        Resumen <strong>semanal</strong> + alertas. Nunca diario: no prometemos diez oportunidades al día ni
        enviamos mensajes vacíos. La baja de marketing no cancela las comunicaciones necesarias de cuenta y
        desactivar las alertas no cancela la suscripción.
      </p>
      {prefs.loading ? (
        <Loading />
      ) : prefs.error ? (
        <ErrorState error={prefs.error} onRetry={prefs.reload} nota={NOTA_PENDIENTE} />
      ) : null}
      <form onSubmit={onGuardar} aria-label="Preferencias de avisos">
        <div className="field">
          <label htmlFor="pref-resumen">Resumen</label>
          <select id="pref-resumen" name="resumen" defaultValue="semanal" disabled>
            <option value="semanal">Semanal (única opción)</option>
          </select>
          <p className="help">El resumen diario no existe en LicitaClima por decisión de producto.</p>
        </div>
        <div className="field">
          <input id="pref-alertas" name="alertas" type="checkbox" defaultChecked={prefs.data?.alertas ?? true} />{' '}
          <label htmlFor="pref-alertas" style={{ display: 'inline', fontWeight: 400 }}>
            Alertas cuando hay novedad en mis provincias
          </label>
        </div>
        <div className="field">
          <input
            id="pref-nuevas"
            name="alertasNuevas"
            type="checkbox"
            defaultChecked={prefs.data?.alertasNuevasOportunidades ?? true}
          />{' '}
          <label htmlFor="pref-nuevas" style={{ display: 'inline', fontWeight: 400 }}>
            Nuevas oportunidades que encajan con mi perfil
          </label>
        </div>
        <div className="field">
          <input
            id="pref-rectif"
            name="alertasRectif"
            type="checkbox"
            defaultChecked={prefs.data?.alertasRectificaciones ?? true}
          />{' '}
          <label htmlFor="pref-rectif" style={{ display: 'inline', fontWeight: 400 }}>
            Rectificaciones y cambios en expedientes que sigo
          </label>
        </div>
        <div className="field">
          <input
            id="pref-email"
            name="emailResumen"
            type="checkbox"
            defaultChecked={prefs.data?.emailResumen ?? true}
          />{' '}
          <label htmlFor="pref-email" style={{ display: 'inline', fontWeight: 400 }}>
            Recibir el resumen semanal por correo
          </label>
        </div>
        <button type="submit" className="btn" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar preferencias'}
        </button>
        {mensaje ? <p role="status">{mensaje}</p> : null}
      </form>
    </div>
  );
}
