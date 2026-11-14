// LicitaClima — respuestas DETERMINISTAS a preguntas sobre un análisis
// (block/api-lectura, prompt §4).
//
// SIN LLM (proveedor pendiente): la respuesta se construye SOLO buscando en
// los fragmentos extraídos (extracted_pages) del expediente. Cada afirmación
// lleva su cita (documento, página, fragmento). Si ningún fragmento contiene
// términos de la pregunta, la respuesta es «Sin evidencia en los documentos».
// NUNCA se inventa una respuesta ni se completa con conocimiento general.
// Los saludos y la ayuda de navegación usan respuestas generales acotadas
// (también deterministas, sin citas y sin afirmar nada del pliego).

export interface PageFragment {
  documento: string;
  pagina: number | null;
  texto: string;
}

export interface Citation {
  documento: string;
  pagina: number | null;
  fragmento: string;
}

export interface DeterministicAnswer {
  texto: string;
  citas: Citation[];
  sinEvidencia: boolean;
}

export const SIN_EVIDENCIA_TEXTO =
  'Sin evidencia en los documentos: la pregunta no tiene respuesta en los pliegos descargados de este expediente.';

/** Palabras que no discriminan (no se usan para buscar en los fragmentos). */
const STOPWORDS = new Set([
  'que', 'qué', 'como', 'cómo', 'cuando', 'cuándo', 'donde', 'dónde', 'cual', 'cuál',
  'cuales', 'cuáles', 'cuanto', 'cuánto', 'cuanta', 'cuánta', 'cuantos', 'cuántos',
  'para', 'por', 'con', 'sin', 'sobre', 'entre', 'hasta', 'desde', 'hacia', 'según',
  'los', 'las', 'una', 'uno', 'unos', 'unas', 'del', 'al', 'el', 'la', 'de', 'en',
  'es', 'son', 'se', 'su', 'sus', 'este', 'esta', 'estos', 'estas', 'ese', 'esa',
  'eso', 'aquel', 'aquella', 'hay', 'tiene', 'tienen', 'debe', 'deben', 'puede',
  'pueden', 'ser', 'estar', 'haber', 'hace', 'hacen', 'más', 'menos', 'muy', 'también',
  'pero', 'porque', 'pues', 'entonces', 'luego', 'antes', 'después', 'durante',
  'cada', 'todo', 'toda', 'todos', 'todas', 'otro', 'otra', 'otros', 'otras',
  'mismo', 'misma', 'cual', 'este', 'dice', 'dicen', 'indica', 'indican', 'exige',
  'exigen', 'requiere', 'requieren', 'solicita', 'pliego', 'pliegos', 'expediente',
  'contrato', 'licitación', 'licitacion', 'anuncio',
]);

export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9áéíóúñü\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Términos de búsqueda: tokens de 3+ letras que no son stopwords. */
export function terminosPregunta(pregunta: string): string[] {
  const tokens = normalizar(pregunta).split(' ').filter(Boolean);
  return [...new Set(tokens.filter((t) => t.length >= 3 && !STOPWORDS.has(t)))];
}

const SALUDOS = /^(hola|buenos dias|buenas tardes|buenas noches|gracias|muchas gracias)\b/;

function fragmentoAlrededor(texto: string, terminos: string[], maxLen = 400): string {
  const norm = normalizar(texto);
  let pos = -1;
  for (const t of terminos) {
    const i = norm.indexOf(t);
    if (i !== -1 && (pos === -1 || i < pos)) pos = i;
  }
  if (pos === -1) return texto.slice(0, maxLen).trim();
  const inicio = Math.max(0, pos - 120);
  const fin = Math.min(texto.length, pos + 280);
  let frag = texto.slice(inicio, fin).trim();
  // Recortar a límites de palabra y marcar el recorte.
  if (inicio > 0) frag = `…${frag.replace(/^\S+\s/, '')}`;
  if (fin < texto.length) frag = `${frag.replace(/\s\S+$/, '')}…`;
  return frag.replace(/\s+/g, ' ').trim();
}

/**
 * Responde buscando términos de la pregunta en las páginas extraídas.
 * Ordena las páginas por número de términos distintos encontrados y cita
 * hasta 3. Sin coincidencias: «Sin evidencia en los documentos».
 */
export function answerDeterministically(pregunta: string, paginas: PageFragment[]): DeterministicAnswer {
  const q = pregunta.trim();
  if (SALUDOS.test(normalizar(q))) {
    return {
      texto:
        'Hola. Puedo responder preguntas sobre los documentos de este expediente, citando el documento y la página. Pregúntame, por ejemplo, por los requisitos de solvencia, las garantías, el plazo o los criterios de adjudicación.',
      citas: [],
      sinEvidencia: false,
    };
  }
  const terminos = terminosPregunta(q);
  if (terminos.length === 0 || paginas.length === 0) {
    return { texto: SIN_EVIDENCIA_TEXTO, citas: [], sinEvidencia: true };
  }
  const puntuadas = paginas
    .map((p) => {
      const norm = normalizar(p.texto);
      const encontrados = terminos.filter((t) => norm.includes(t));
      return { pagina: p, aciertos: encontrados.length, encontrados };
    })
    .filter((r) => r.aciertos > 0)
    .sort((a, b) => b.aciertos - a.aciertos || (a.pagina.pagina ?? 0) - (b.pagina.pagina ?? 0))
    .slice(0, 3);
  if (puntuadas.length === 0) {
    return { texto: SIN_EVIDENCIA_TEXTO, citas: [], sinEvidencia: true };
  }
  const citas: Citation[] = puntuadas.map((r) => ({
    documento: r.pagina.documento,
    pagina: r.pagina.pagina,
    fragmento: fragmentoAlrededor(r.pagina.texto, r.encontrados),
  }));
  const cuerpo = citas
    .map(
      (c) =>
        `— ${c.documento}${c.pagina !== null ? `, pág. ${c.pagina}` : ''}: «${c.fragmento}»`,
    )
    .join('\n');
  return {
    texto: `Según los documentos del expediente:\n${cuerpo}\n\nEsto es lo que consta literalmente en los pliegos descargados. Si necesitas una interpretación jurídica o una decisión sobre tu oferta, revísalo con un profesional.`,
    citas,
    sinEvidencia: false,
  };
}
