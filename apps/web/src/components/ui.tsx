import type { ReactNode } from 'react';

export function Loading({ texto = 'Cargando…' }: { texto?: string }) {
  return (
    <div className="loading-box" role="status" aria-live="polite">
      {texto}
    </div>
  );
}

export function EmptyState({ titulo, texto, children }: { titulo: string; texto?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{titulo}</h3>
      {texto ? <p>{texto}</p> : null}
      {children}
    </div>
  );
}

export function ErrorState({
  titulo = 'No se ha podido cargar esta información',
  error,
  onRetry,
  nota,
}: {
  titulo?: string;
  error?: Error | null;
  onRetry?: () => void;
  nota?: string;
}) {
  return (
    <div className="error-box" role="alert">
      <h3>{titulo}</h3>
      <p>
        {error?.message ?? 'El servicio no ha respondido.'}{' '}
        {nota ?? 'Los datos se muestran como N/D hasta que el servicio esté disponible.'}
      </p>
      {onRetry ? (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

/** Valor que puede no existir aún: muestra N/D en lugar de inventar una cifra. */
export function Nd({ value, format }: { value: string | number | null | undefined; format?: (v: string | number) => string }) {
  if (value === null || value === undefined || value === '') return <span title="Dato no disponible">N/D</span>;
  return <>{format ? format(value) : value}</>;
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="stat">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
      {note ? <div className="help">{note}</div> : null}
    </div>
  );
}

export function Badge({ tone, children }: { tone?: 'ok' | 'warn' | 'danger' | 'primary'; children: ReactNode }) {
  return <span className={tone ? `badge badge-${tone}` : 'badge'}>{children}</span>;
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={title.replace(/\s+/g, '-').toLowerCase()}>
      <h2 id={title.replace(/\s+/g, '-').toLowerCase()}>{title}</h2>
      {children}
    </section>
  );
}
