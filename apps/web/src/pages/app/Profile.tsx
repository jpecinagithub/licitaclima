import { useState } from 'react';
import type { FormEvent } from 'react';
import { PLAN } from '@licitaclima/config';
import { getProfile, getProfileVersions, updateProfile } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { EmptyState, ErrorState, Loading } from '../../components/ui.js';
import { formatInstante } from '../../lib/format.js';

export function ProfilePage() {
  const perfil = useApi(getProfile);
  const versiones = useApi(getProfileVersions);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  async function onGuardar(e: FormEvent) {
    e.preventDefault();
    const form = new FormData(e.target as HTMLFormElement);
    const provincias = String(form.get('provincias') ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, PLAN.maxProvinces);
    const certificaciones = String(form.get('certificaciones') ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    setGuardando(true);
    setMensaje('');
    try {
      await updateProfile({
        actividad: String(form.get('actividad') ?? '')
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean),
        provincias,
        capacidadOperativa: String(form.get('capacidad') ?? '') || null,
        experiencia: String(form.get('experiencia') ?? '') || null,
        certificaciones,
        preferencias: String(form.get('preferencias') ?? '') || null,
      });
      setMensaje('Perfil guardado. Se ha creado una nueva versión y se ha recalculado el encaje.');
      perfil.reload();
      versiones.reload();
    } catch (err) {
      setMensaje(
        `No se ha podido guardar el perfil: ${err instanceof Error ? err.message : 'el servicio no responde'}.`,
      );
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div>
      <h1>Perfil de empresa</h1>
      <p>
        Datos declarados, no verificados. No pedimos documentación sensible en el MVP. Cada cambio crea una
        versión nueva y recalcula el encaje con las oportunidades.
      </p>
      {perfil.loading ? (
        <Loading />
      ) : perfil.error || !perfil.data ? (
        <ErrorState
          error={perfil.error}
          onRetry={perfil.reload}
          nota="El perfil de empresa (GET /company-profile) aún no está disponible (Fase B). El formulario siguiente permite preparar los datos, pero no se guardarán hasta que el endpoint exista."
        />
      ) : (
        <p>
          Versión actual: <strong>v{perfil.data.version}</strong> · Actualizado:{' '}
          {formatInstante(perfil.data.updatedAt)} (Europe/Madrid)
        </p>
      )}
      <form onSubmit={onGuardar} aria-label="Perfil de empresa">
        <div className="field">
          <label htmlFor="perfil-actividad">Actividad (separada por comas)</label>
          <input
            id="perfil-actividad"
            name="actividad"
            defaultValue={perfil.data?.actividad.join(', ') ?? ''}
            placeholder="Mantenimiento de climatización, Instalación de climatización"
          />
        </div>
        <div className="field">
          <label htmlFor="perfil-provincias">Provincias de servicio (máximo {PLAN.maxProvinces}, separadas por comas)</label>
          <input
            id="perfil-provincias"
            name="provincias"
            defaultValue={perfil.data?.provincias.join(', ') ?? ''}
            placeholder="Badajoz, Cáceres, Madrid"
          />
        </div>
        <div className="field">
          <label htmlFor="perfil-capacidad">Capacidad operativa</label>
          <input
            id="perfil-capacidad"
            name="capacidad"
            defaultValue={perfil.data?.capacidadOperativa ?? ''}
            placeholder="p. ej., 2 equipos de 3 técnicos"
          />
        </div>
        <div className="field">
          <label htmlFor="perfil-experiencia">Experiencia</label>
          <textarea
            id="perfil-experiencia"
            name="experiencia"
            rows={3}
            defaultValue={perfil.data?.experiencia ?? ''}
            placeholder="Años de experiencia, tipos de clientes, contratos anteriores…"
          />
        </div>
        <div className="field">
          <label htmlFor="perfil-certificaciones">Certificaciones declaradas (separadas por comas)</label>
          <input
            id="perfil-certificaciones"
            name="certificaciones"
            defaultValue={perfil.data?.certificaciones.join(', ') ?? ''}
            placeholder="p. ej., RITE, ISO 9001"
          />
        </div>
        <div className="field">
          <label htmlFor="perfil-preferencias">Preferencias</label>
          <textarea
            id="perfil-preferencias"
            name="preferencias"
            rows={3}
            defaultValue={perfil.data?.preferencias ?? ''}
            placeholder="Tamaño orientativo de contratos, tipos de trabajo que prefieres o evitas…"
          />
        </div>
        <button type="submit" className="btn" disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar perfil'}
        </button>
        {mensaje ? <p role="status">{mensaje}</p> : null}
      </form>

      <h2>Historial de versiones</h2>
      {versiones.loading ? (
        <Loading />
      ) : versiones.error ? (
        <ErrorState
          error={versiones.error}
          onRetry={versiones.reload}
          nota="El historial de versiones (GET /company-profile/versions) aún no está disponible."
        />
      ) : versiones.data && versiones.data.length === 0 ? (
        <EmptyState titulo="Sin versiones anteriores" texto="Solo existe la versión actual del perfil." />
      ) : (
        <ul>
          {versiones.data?.map((v) => (
            <li key={v.version}>
              Versión {v.version} — {formatInstante(v.updatedAt)} (Europe/Madrid) — Provincias:{' '}
              {v.provincias.join(', ') || 'N/D'}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
