import { useState } from 'react';
import { apiGet, apiPost } from '../lib/api.js';
import type { PauseKey, PausesData } from '../lib/admin.js';
import { PAUSE_LABELS } from '../lib/admin.js';
import { useApi } from '../lib/useApi.js';
import { ErrorState, Loading } from './ui.js';

/**
 * Botones independientes para pausar captación, campañas, nuevos análisis y
 * envíos no esenciales. Ninguna pausa bloquea el acceso, la cancelación ni
 * las operaciones de seguridad. Cada cambio queda registrado en auditoría
 * (el backend lo registra; aquí se muestra la confirmación).
 */
export function PauseControls() {
  const estado = useApi(() => apiGet<PausesData>('/admin/pauses'));
  const [mensaje, setMensaje] = useState('');
  const [trabajando, setTrabajando] = useState<PauseKey | null>(null);

  async function toggle(key: PauseKey, actual: boolean) {
    setTrabajando(key);
    setMensaje('');
    try {
      await apiPost('/admin/pauses', { [key]: !actual });
      setMensaje(`Pausa «${key}» ${!actual ? 'activada' : 'desactivada'} y registrada en auditoría.`);
      estado.reload();
    } catch {
      setMensaje('No se ha podido cambiar la pausa: el endpoint aún no está disponible (Fase E).');
    } finally {
      setTrabajando(null);
    }
  }

  if (estado.loading) return <Loading texto="Cargando el estado de las pausas…" />;
  if (estado.error || !estado.data) {
    return (
      <ErrorState
        error={estado.error}
        onRetry={estado.reload}
        nota="El estado de las pausas (GET /admin/pauses) aún no está disponible (Fase E). Los botones siguientes no actúan hasta que el endpoint exista."
      />
    );
  }
  return (
    <div>
      <div className="grid grid-2">
        {PAUSE_LABELS.map((p) => {
          const activo = estado.data?.[p.key] ?? false;
          return (
            <div className="card" key={p.key}>
              <h3>{p.label}</h3>
              <p>{p.descripcion}</p>
              <p>
                Estado actual: <strong>{activo ? 'Pausada' : 'Activa'}</strong>
              </p>
              <button
                type="button"
                className={activo ? 'btn' : 'btn btn-danger'}
                onClick={() => toggle(p.key, activo)}
                disabled={trabajando === p.key}
              >
                {trabajando === p.key ? 'Aplicando…' : activo ? 'Reanudar' : 'Pausar'}
              </button>
            </div>
          );
        })}
      </div>
      {mensaje ? <p role="status">{mensaje}</p> : null}
    </div>
  );
}
