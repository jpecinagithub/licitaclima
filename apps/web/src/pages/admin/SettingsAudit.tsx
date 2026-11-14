import { getAdminAudit, getAdminSettings } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { EmptyState, ErrorState, Loading, Nd } from '../../components/ui.js';
import { formatInstante } from '../../lib/format.js';

export function AdminSettingsPage() {
  const conf = useApi(getAdminSettings);
  const d = conf.data;
  return (
    <div>
      <h1>Configuración</h1>
      <p>
        Fuentes, modelos, límites, planes y plantillas, versionados. Cada cambio queda registrado en auditoría
        con su autor y su fecha. Los precios y límites se editan aquí y se reflejan en la web y en Stripe.
      </p>
      {conf.loading ? (
        <Loading />
      ) : conf.error || !d ? (
        <ErrorState
          error={conf.error}
          onRetry={conf.reload}
          nota="La configuración (GET /admin/settings) aún no está disponible (Fase E)."
        />
      ) : (
        <>
          <dl className="kv">
            <dt>Versión de configuración</dt>
            <dd>
              <Nd value={d.version} format={(v) => `v${v}`} />
            </dd>
            <dt>Actualizada por</dt>
            <dd>{d.actualizadoPor ?? 'N/D'}</dd>
            <dt>Actualizada en</dt>
            <dd>{formatInstante(d.actualizadoEn)}</dd>
          </dl>
          <h2>Fuentes</h2>
          {d.fuentes.length === 0 ? (
            <p className="muted">N/D</p>
          ) : (
            <ul>
              {d.fuentes.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          )}
          <h2>Modelos LLM</h2>
          {d.modelos.length === 0 ? (
            <p className="muted">N/D — proveedor LLM pendiente de decisión.</p>
          ) : (
            <ul>
              {d.modelos.map((m) => (
                <li key={`${m.proveedor}/${m.modelo}`}>
                  {m.proveedor} / {m.modelo} — precio configurado: {m.precioConfigurado ? 'sí' : 'no'}
                </li>
              ))}
            </ul>
          )}
          <h2>Límites</h2>
          <dl className="kv">
            <dt>Análisis al mes</dt>
            <dd>
              <Nd value={d.limites.analisisMes} />
            </dd>
            <dt>Consultas de chat por periodo</dt>
            <dd>
              <Nd value={d.limites.consultasChat} />
            </dd>
            <dt>Provincias</dt>
            <dd>
              <Nd value={d.limites.provincias} />
            </dd>
          </dl>
          <h2>Planes</h2>
          {d.planes.length === 0 ? (
            <p className="muted">N/D</p>
          ) : (
            <ul>
              {d.planes.map((p) => (
                <li key={p.id}>
                  {p.id} — {p.precioEur === null ? 'N/D' : `${p.precioEur} €/mes + impuestos`}
                </li>
              ))}
            </ul>
          )}
          <h2>Plantillas</h2>
          {d.plantillas.length === 0 ? (
            <p className="muted">N/D</p>
          ) : (
            <ul>
              {d.plantillas.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export function AdminAuditPage() {
  const auditoria = useApi(getAdminAudit);
  return (
    <div>
      <h1>Auditoría</h1>
      <p>
        Actor, acción, objeto y fecha, con correlación. Sin secretos en los registros: nunca se registran tokens,
        claves ni contenidos privados completos.
      </p>
      {auditoria.loading ? (
        <Loading />
      ) : auditoria.error ? (
        <ErrorState
          error={auditoria.error}
          onRetry={auditoria.reload}
          nota="La auditoría (GET /admin/audit) aún no está disponible (Fase E)."
        />
      ) : !auditoria.data || auditoria.data.length === 0 ? (
        <EmptyState titulo="Sin entradas de auditoría" texto="Aún no hay acciones registradas." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Actor</th>
                <th>Acción</th>
                <th>Objeto</th>
              </tr>
            </thead>
            <tbody>
              {auditoria.data.map((e) => (
                <tr key={e.id}>
                  <td>{formatInstante(e.fecha)}</td>
                  <td>{e.actor}</td>
                  <td>{e.accion}</td>
                  <td>{e.objeto}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
