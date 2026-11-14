import { Link } from 'react-router-dom';
import type { Opportunity } from '../lib/types.js';
import { diasHastaPlazo, formatEur, formatFecha } from '../lib/format.js';
import { Badge } from './ui.js';

export function estadoBadge(estado: Opportunity['estado']) {
  const map: Record<string, { tone?: 'ok' | 'warn' | 'danger' | 'primary'; label: string }> = {
    PUB: { tone: 'ok', label: 'Abierta' },
    EV: { label: 'En evaluación' },
    RES: { label: 'Resuelta' },
    ADJ: { label: 'Adjudicada' },
    PRE: { tone: 'warn', label: 'Previa' },
    ANUL: { tone: 'danger', label: 'Anulada' },
  };
  const v = map[estado] ?? { label: estado };
  return <Badge tone={v.tone}>{v.label}</Badge>;
}

export function OpportunityCard({ opp, detailHref }: { opp: Opportunity; detailHref?: string }) {
  const dias = diasHastaPlazo(opp.plazo);
  return (
    <article className="card" aria-labelledby={`opp-${opp.id}`}>
      <h3 id={`opp-${opp.id}`}>
        {detailHref ? <Link to={detailHref}>{opp.titulo}</Link> : opp.titulo}
      </h3>
      <p>
        {estadoBadge(opp.estado)}{' '}
        <Badge tone="primary">{opp.clase === 'núcleo' ? 'Núcleo' : opp.clase}</Badge>{' '}
        <span className="muted">Expediente {opp.expediente}</span>
      </p>
      <dl className="kv">
        <dt>Órgano</dt>
        <dd>{opp.organo}</dd>
        <dt>Provincia</dt>
        <dd>{opp.provincia ?? 'N/D'}</dd>
        <dt>Publicada</dt>
        <dd>{formatFecha(opp.fechaPublicacion)}</dd>
        <dt>Plazo de presentación</dt>
        <dd>
          {formatFecha(opp.plazo)}
          {opp.plazoHora ? `, ${opp.plazoHora} h` : ''}
          {dias !== null ? (dias < 0 ? ' (plazo vencido)' : dias === 0 ? ' (vence hoy)' : ` (faltan ${dias} días)`) : ''}
        </dd>
        <dt>Valor estimado</dt>
        <dd>{formatEur(opp.valorEstimadoEur)}</dd>
        <dt>Presupuesto base (sin IVA)</dt>
        <dd>{formatEur(opp.presupuestoBaseSinIvaEur)}</dd>
        <dt>CPV</dt>
        <dd>{opp.cpv.length > 0 ? opp.cpv.join(', ') : 'N/D'}</dd>
        <dt>Documentos</dt>
        <dd>{opp.nDocumentos} documento(s) · {opp.nLotes} lote(s)</dd>
      </dl>
      <p>
        <a href={opp.urlOficial} target="_blank" rel="noopener noreferrer">
          Ver anuncio oficial
        </a>{' '}
        <span className="muted">(fuente {opp.fuente === '643' ? '643 — perfiles de contratante' : '1044 — plataformas agregadas'})</span>
      </p>
    </article>
  );
}
