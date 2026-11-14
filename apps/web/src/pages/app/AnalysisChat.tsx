import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { askAnalysisQuestion, getAnalysisQuestions } from '../../lib/api.js';
import type { ChatMessage } from '../../lib/types.js';
import { useApi } from '../../lib/useApi.js';
import { EmptyState, ErrorState, Loading } from '../../components/ui.js';
import { formatInstante } from '../../lib/format.js';

export function AnalysisChatPage() {
  const { id = '' } = useParams();
  const analysisId = decodeURIComponent(id);
  const historial = useApi(() => getAnalysisQuestions(analysisId), [analysisId]);
  const [pregunta, setPregunta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [respuesta, setRespuesta] = useState<ChatMessage | null>(null);
  const [error, setError] = useState('');

  async function onPreguntar(e: FormEvent) {
    e.preventDefault();
    if (!pregunta.trim()) return;
    setEnviando(true);
    setError('');
    setRespuesta(null);
    try {
      const r = await askAnalysisQuestion(analysisId, pregunta.trim());
      setRespuesta(r);
      setPregunta('');
      historial.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'El servicio no responde.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div>
      <p>
        <Link to={`/app/analisis/${encodeURIComponent(analysisId)}`}>← Volver al análisis</Link>
      </p>
      <h1>Preguntas sobre el análisis</h1>
      <p>
        El chat responde solo con los documentos del expediente y tu perfil autorizado, y cita sus fuentes. Si no
        hay evidencia en los documentos, la respuesta lo dice. No da asesoramiento jurídico concluyente. Cada
        pregunta consume una consulta de tu cuota (100 por periodo).
      </p>

      {historial.loading ? (
        <Loading texto="Cargando el historial…" />
      ) : historial.error ? (
        <ErrorState
          error={historial.error}
          onRetry={historial.reload}
          nota="El historial de preguntas (GET /analyses/:id/questions) aún no está disponible (Fase C)."
        />
      ) : historial.data && historial.data.length === 0 ? (
        <EmptyState titulo="Sin preguntas todavía" texto="Haz tu primera pregunta sobre los documentos de este expediente." />
      ) : (
        <div className="chat" aria-live="polite">
          {historial.data?.map((m) => (
            <ChatBubble key={m.id} msg={m} />
          ))}
          {respuesta ? <ChatBubble msg={respuesta} /> : null}
        </div>
      )}

      <form onSubmit={onPreguntar} aria-label="Preguntar sobre el análisis">
        <div className="field">
          <label htmlFor="chat-pregunta">Tu pregunta</label>
          <input
            id="chat-pregunta"
            value={pregunta}
            onChange={(e) => setPregunta(e.target.value)}
            placeholder="p. ej., ¿qué solvencia técnica exige el pliego?"
            required
          />
        </div>
        <button type="submit" className="btn" disabled={enviando}>
          {enviando ? 'Preguntando…' : 'Preguntar'}
        </button>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </div>
  );
}

function ChatBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div className="chat-msg">
      <p className="who">{msg.role === 'user' ? 'Tú' : 'LicitaClima'}</p>
      <p>{msg.texto}</p>
      {msg.role === 'assistant' && msg.sinEvidencia ? (
        <p className="sin-evidencia">Sin evidencia en los documentos.</p>
      ) : null}
      {msg.citas.map((c, i) => (
        <blockquote key={i} className="cita">
          {c.fragmento}
          <br />
          <span className="muted">
            {c.documento}
            {c.pagina !== null ? `, pág. ${c.pagina}` : ''}
          </span>
        </blockquote>
      ))}
      <p className="help">{formatInstante(msg.createdAt)} (Europe/Madrid)</p>
    </div>
  );
}
