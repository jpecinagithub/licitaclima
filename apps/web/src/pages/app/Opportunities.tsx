import { useState } from 'react';
import type { FormEvent } from 'react';
import { getOpportunities, setFavorite, setPersonalStatus } from '../../lib/api.js';
import type { PersonalStatus } from '../../lib/types.js';
import { useApi } from '../../lib/useApi.js';
import { EmptyState, ErrorState, Loading } from '../../components/ui.js';
import { OpportunityCard } from '../../components/OpportunityCard.js';

const ESTADOS_PERSONALES: { value: PersonalStatus | ''; label: string }[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'estudiar', label: 'A estudiar' },
  { value: 'descartada', label: 'Descartada' },
  { value: 'presentada', label: 'Presentada' },
];

export function OpportunitiesPage() {
  const [provincia, setProvincia] = useState('');
  const [estado, setEstado] = useState('PUB');
  const [clase, setClase] = useState('');
  const [texto, setTexto] = useState('');
  const [estadoPersonal, setEstadoPersonal] = useState<PersonalStatus | ''>('');
  const [soloFavoritos, setSoloFavoritos] = useState(false);
  const [filtros, setFiltros] = useState(new URLSearchParams({ estado: 'PUB', limit: '20' }));
  const [accion, setAccion] = useState('');

  const lista = useApi(() => getOpportunities(filtros), [filtros.toString()]);

  function onFiltrar(e: FormEvent) {
    e.preventDefault();
    const q = new URLSearchParams({ limit: '20' });
    if (provincia) q.set('provincia', provincia);
    if (estado) q.set('estado', estado);
    if (clase) q.set('clase', clase);
    if (texto) q.set('texto', texto);
    if (estadoPersonal) q.set('estadoPersonal', estadoPersonal);
    if (soloFavoritos) q.set('favorito', 'true');
    setFiltros(q);
  }

  async function onFavorito(id: string) {
    setAccion('');
    try {
      await setFavorite(id, true);
      setAccion(`Expediente ${id} marcado como favorito.`);
      lista.reload();
    } catch {
      setAccion('No se ha podido guardar el favorito: el endpoint aún no está disponible.');
    }
  }

  async function onEstadoPersonal(id: string, v: PersonalStatus) {
    setAccion('');
    try {
      await setPersonalStatus(id, v);
      setAccion(`Estado actualizado a «${v}».`);
      lista.reload();
    } catch {
      setAccion('No se ha podido guardar el estado: el endpoint aún no está disponible.');
    }
  }

  return (
    <div>
      <h1>Oportunidades</h1>
      <p>
        Oportunidades vigentes filtradas por tu perfil. La explicación breve del encaje aparece en cada ficha. Los
        filtros y las fichas básicas no consumen análisis del plan.
      </p>
      <form onSubmit={onFiltrar} aria-label="Filtrar oportunidades">
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="filtro-provincia">Provincia</label>
            <input
              id="filtro-provincia"
              value={provincia}
              onChange={(e) => setProvincia(e.target.value)}
              placeholder="p. ej., Badajoz"
            />
          </div>
          <div className="field">
            <label htmlFor="filtro-texto">Texto</label>
            <input
              id="filtro-texto"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="p. ej., mantenimiento"
            />
          </div>
          <div className="field">
            <label htmlFor="filtro-estado">Estado del anuncio</label>
            <select id="filtro-estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
              <option value="PUB">Abiertas</option>
              <option value="">Todas</option>
              <option value="EV">En evaluación</option>
              <option value="RES">Resueltas</option>
              <option value="ADJ">Adjudicadas</option>
              <option value="ANUL">Anuladas</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="filtro-clase">Clase</label>
            <select id="filtro-clase" value={clase} onChange={(e) => setClase(e.target.value)}>
              <option value="">Núcleo y limítrofe</option>
              <option value="núcleo">Núcleo</option>
              <option value="limítrofe">Limítrofe</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label htmlFor="filtro-estado-personal">Mi estado</label>
          <select
            id="filtro-estado-personal"
            value={estadoPersonal}
            onChange={(e) => setEstadoPersonal(e.target.value as PersonalStatus | '')}
          >
            {ESTADOS_PERSONALES.map((s) => (
              <option key={s.value || 'todos'} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <input
            id="filtro-favoritos"
            type="checkbox"
            checked={soloFavoritos}
            onChange={(e) => setSoloFavoritos(e.target.checked)}
          />{' '}
          <label htmlFor="filtro-favoritos" style={{ display: 'inline', fontWeight: 400 }}>
            Solo favoritos
          </label>
        </div>
        <button type="submit" className="btn">
          Aplicar filtros
        </button>
      </form>
      {accion ? (
        <p role="status" aria-live="polite">
          {accion}
        </p>
      ) : null}

      {lista.loading ? (
        <Loading texto="Cargando oportunidades…" />
      ) : lista.error ? (
        <ErrorState
          error={lista.error}
          onRetry={lista.reload}
          nota="La lista de oportunidades (GET /opportunities) aún no está disponible (Fase C). Mientras tanto, puedes ver oportunidades reales en la muestra pública."
        />
      ) : lista.data && lista.data.items.length === 0 ? (
        <EmptyState
          titulo="Sin oportunidades con estos filtros"
          texto="No hay oportunidades abiertas que encajen con tu perfil y estos filtros. Prueba a ampliar provincias o a quitar el filtro de favoritos. Si no hay coincidencias, el resumen semanal te avisará cuando aparezcan."
        />
      ) : (
        <>
          <p className="muted">{lista.data?.total ?? 'N/D'} oportunidades encontradas.</p>
          {lista.data?.items.map((o) => (
            <div key={o.id}>
              <OpportunityCard opp={o} detailHref={`/app/oportunidades/${encodeURIComponent(o.id)}`} />
              {o.encaje ? (
                <p>
                  <strong>Encaje:</strong> {o.encaje.motivo}
                  {o.encaje.bloqueante ? ' Hay un requisito obligatorio incompatible.' : ''}
                </p>
              ) : (
                <p className="help">
                  Encaje: Pendiente. La explicación breve del encaje aparecerá cuando el análisis esté disponible.
                </p>
              )}
              <p>
                <button type="button" className="btn btn-secondary btn-small" onClick={() => onFavorito(o.id)}>
                  Marcar favorito
                </button>{' '}
                <label>
                  Mi estado:{' '}
                  <select
                    aria-label={`Estado personal de ${o.expediente}`}
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) onEstadoPersonal(o.id, e.target.value as PersonalStatus);
                    }}
                  >
                    <option value="">Cambiar estado…</option>
                    <option value="pendiente">Pendiente</option>
                    <option value="estudiar">A estudiar</option>
                    <option value="descartada">Descartada</option>
                    <option value="presentada">Presentada</option>
                  </select>
                </label>
              </p>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
