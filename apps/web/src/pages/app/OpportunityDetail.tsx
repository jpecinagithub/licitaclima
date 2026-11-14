import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getAnalysis, getOpportunity, requestAnalysis } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { EmptyState, ErrorState, Loading } from '../../components/ui.js';
import { OpportunityCard } from '../../components/OpportunityCard.js';
import { formatFecha } from '../../lib/format.js';

export function OpportunityDetailPage() {
  const { id = '' } = useParams();
  const ficha = useApi(() => getOpportunity(decodeURIComponent(id)), [id]);
  const [solicitando, setSolicitando] = useState(false);
  const [mensajeAnalisis, setMensajeAnalisis] = useState('');
  const [analysisId, setAnalysisId] = useState<string | null>(null);

  async function onSolicitarAnalisis() {
    setSolicitando(true);
    setMensajeAnalisis('');
    try {
      const res = await requestAnalysis(decodeURIComponent(id));
      setAnalysisId(res.analysisId ?? null);
      setMensajeAnalisis(
        res.analysisId
          ? 'Análisis solicitado. Se ha reservado una unidad de tu cuota.'
          : `Análisis en cola (trabajo ${res.jobId}). Se ha reservado una unidad de tu cuota; si falla, se libera.`,
      );
    } catch (e) {
      setMensajeAnalisis(
        `No se ha podido solicitar el análisis: ${e instanceof Error ? e.message : 'el servicio no responde'}. No se ha consumido cuota.`,
      );
    } finally {
      setSolicitando(false);
    }
  }

  return (
    <div>
      <p>
        <Link to="/app/oportunidades">← Volver a oportunidades</Link>
      </p>
      {ficha.loading ? (
        <Loading texto="Cargando la ficha…" />
      ) : ficha.error || !ficha.data ? (
        <ErrorState
          titulo="No se ha podido cargar la ficha"
          error={ficha.error}
          onRetry={ficha.reload}
          nota="La ficha de oportunidad (GET /opportunities/:id) aún no está disponible (Fase C)."
        />
      ) : (
        <>
          <OpportunityCard opp={ficha.data} />
          <h2>Fuentes</h2>
          <p>
            Fuente: {ficha.data.fuente === '643' ? '643 — perfiles de contratante' : '1044 — plataformas agregadas'}{' '}
            · Publicada: {formatFecha(ficha.data.fechaPublicacion)} · Última modificación:{' '}
            {formatFecha(ficha.data.fechaModificacion)} · {ficha.data.nDocumentos} documento(s) públicos vinculados.
          </p>
          <h2>Análisis completo</h2>
          <p>
            El análisis personalizado compara los requisitos del pliego con tu perfil declarado, con evidencias
            (documento, página y fragmento) en cada afirmación. Consume una unidad de tu cuota de 10 análisis al
            mes. Revisitarlo no consume otra unidad.
          </p>
          <button type="button" className="btn" onClick={onSolicitarAnalisis} disabled={solicitando}>
            {solicitando ? 'Solicitando…' : 'Solicitar análisis completo'}
          </button>
          {mensajeAnalisis ? (
            <p role="status">{mensajeAnalisis}</p>
          ) : null}
          {analysisId ? (
            <p>
              <Link to={`/app/analisis/${encodeURIComponent(analysisId)}`}>Ver el análisis</Link>
            </p>
          ) : null}
          <AnalysisSection tenderId={decodeURIComponent(id)} />
        </>
      )}
    </div>
  );
}

/** El análisis, si ya existe para este expediente, se muestra aquí. */
function AnalysisSection({ tenderId }: { tenderId: string }) {
  // El análisis se identifica por su propio id; sin endpoint de búsqueda por
  // expediente, este bloque queda pendiente hasta que el API lo exponga.
  const _ = tenderId;
  return (
    <EmptyState
      titulo="Análisis: Pendiente"
      texto="Aún no hay un análisis publicado para este expediente en tu cuenta. Solicítalo con el botón de arriba. Cuando el API exponga la búsqueda de análisis por expediente, este bloque mostrará el análisis existente sin consumir cuota."
    />
  );
}

export function AnalysisDetailPage() {
  const { id = '' } = useParams();
  const analisis = useApi(() => getAnalysis(decodeURIComponent(id)), [id]);
  const [exportando, setExportando] = useState(false);
  const [mensajePdf, setMensajePdf] = useState('');

  async function onExportPdf() {
    setExportando(true);
    setMensajePdf('');
    try {
      const res = await fetch(`/api/v1/analyses/${encodeURIComponent(decodeURIComponent(id))}/pdf`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`El servicio devolvió ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analisis-${decodeURIComponent(id)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setMensajePdf('PDF descargado.');
    } catch {
      setMensajePdf('No se ha podido exportar el PDF: el endpoint aún no está disponible.');
    } finally {
      setExportando(false);
    }
  }

  return (
    <div>
      <p>
        <Link to="/app/oportunidades">← Volver a oportunidades</Link>
      </p>
      <h1>Análisis</h1>
      {analisis.loading ? (
        <Loading texto="Cargando el análisis…" />
      ) : analisis.error || !analisis.data ? (
        <ErrorState
          titulo="No se ha podido cargar el análisis"
          error={analisis.error}
          onRetry={analisis.reload}
          nota="El análisis completo (GET /analyses/:id) aún no está disponible (Fase C)."
        />
      ) : (
        <>
          <p>
            Expediente {analisis.data.expediente} · Estado: <strong>{analisis.data.estado}</strong> · Versión{' '}
            {analisis.data.version} · Actualizado: {formatFecha(analisis.data.updatedAt)}
          </p>
          <button type="button" className="btn btn-secondary" onClick={onExportPdf} disabled={exportando}>
            {exportando ? 'Exportando…' : 'Exportar PDF del análisis'}
          </button>
          {mensajePdf ? <p role="status">{mensajePdf}</p> : null}
          <h2>Resumen</h2>
          <p>{analisis.data.resumen ?? 'Pendiente: el resumen aún no está disponible.'}</p>
          <h2>Requisitos y evidencias</h2>
          {analisis.data.requisitos.length === 0 ? (
            <EmptyState titulo="Sin requisitos extraídos" texto="El análisis aún no ha extraído requisitos de los documentos." />
          ) : (
            <ul>
              {analisis.data.requisitos.map((r, i) => (
                <li key={i}>
                  <strong>{r.requisito}</strong> — {r.estado}
                  {r.evidencia ? (
                    <blockquote className="cita">
                      {r.evidencia.fragmento}
                      <br />
                      <span className="muted">
                        {r.evidencia.documento}
                        {r.evidencia.pagina !== null ? `, pág. ${r.evidencia.pagina}` : ''}
                      </span>
                    </blockquote>
                  ) : (
                    <p className="sin-evidencia">
                      Sin evidencia en los documentos. {r.motivoSinEvidencia ?? ''}
                    </p>
                  )}
                  {r.datoPerfilUsado ? <p className="help">Dato de tu perfil usado: {r.datoPerfilUsado}</p> : null}
                </li>
              ))}
            </ul>
          )}
          {analisis.data.conflictos.length > 0 ? (
            <>
              <h2>Conflictos entre documentos</h2>
              <ul>
                {analisis.data.conflictos.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            </>
          ) : null}
          {analisis.data.camposAusentes.length > 0 ? (
            <>
              <h2>Campos ausentes</h2>
              <ul>
                {analisis.data.camposAusentes.map((c, i) => (
                  <li key={i}>
                    {c.campo}: {c.motivo}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <p>
            <Link to={`/app/analisis/${encodeURIComponent(decodeURIComponent(id))}/chat`}>
              Preguntar sobre este análisis (chat con citas)
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
