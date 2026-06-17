import { readFileSync } from 'node:fs';
import { config } from './config.js';
import { loadNotes, selectContext } from './vault.js';
import { callLLM } from './llm.js';
import { fetchNasPrice, formatQuote } from './market.js';

function loadSystemPrompt(): string {
  try {
    return readFileSync(config.systemPromptPath, 'utf8');
  } catch {
    return 'Eres un asistente virtual de WhatsApp. Responde en español, sé amable y conciso.';
  }
}

// Keywords that trigger real-time market price fetch + Google Search grounding.
const MARKET_RE = /nasdaq|nas100|ustec|nq=?f|precio|cotiz|trading|análisis|analisis|bolsa|índice|indice|sp500|dow jones|vix|fed\b|fomc|mercado/i;
function isMarketQuery(body: string): boolean { return MARKET_RE.test(body); }

// In-memory conversation history per chat (last MAX_TURNS turns).
const MAX_TURNS = 6;
const chatHistory = new Map<string, Array<{ u: string; a: string }>>();

export interface InboundContext {
  body: string;
  isGroup: boolean;
  senderName?: string;
  chatId: string;
}

export async function generateReply(input: InboundContext): Promise<string> {
  const notes = loadNotes();
  const { context, used } = selectContext(notes, input.body);
  console.log(`[rag] ${notes.length} notes; grounding: ${used.join(', ') || '(none)'}; providers: ${config.llmProviders.join('→')}`);

  const systemInstruction = [
    loadSystemPrompt().trim(),
    '',
    '## Instrucciones de respuesta',
    '- Responde SIEMPRE en el idioma del usuario.',
    '- Para conversación casual (saludos, charla) usa tu conocimiento general libremente.',
    '- Para preguntas factuales (precios, estrategias, datos técnicos), prioriza la BASE DE CONOCIMIENTO.',
    '- Si la base de conocimiento no tiene la respuesta, usa tu conocimiento general pero aclara que no tienes información específica actualizada.',
    '- Nunca inventes datos concretos (precios, fechas exactas, políticas específicas) si no están en el vault.',
    '- Sé conciso y amigable para WhatsApp (2-5 líneas por defecto).',
    '',
    '=== BASE DE CONOCIMIENTO ===',
    context || '(la base de conocimiento está vacía)',
    '=== FIN BASE DE CONOCIMIENTO ===',
  ].join('\n');

  // Build conversation history block for context
  const history = chatHistory.get(input.chatId) ?? [];
  const historyBlock = history.length > 0
    ? [
        '',
        '=== CONVERSACIÓN PREVIA ===',
        ...history.map((t) => `[Usuario] ${t.u}\n[Asistente] ${t.a}`),
        '=== FIN CONVERSACIÓN ===',
        '',
      ].join('\n')
    : '';

  const baseUserText = `${historyBlock}${input.senderName ? `[${input.senderName}] ` : ''}${input.body}`;

  let reply: string;
  if (isMarketQuery(input.body)) {
    // Market query: fetch real-time price + use Gemini Search for today's news
    let priceBlock = '';
    try {
      const q = await fetchNasPrice();
      priceBlock = `${formatQuote(q)}\n\n`;
    } catch (err) {
      console.warn('[market] no se pudo obtener precio:', (err as Error).message);
    }
    const marketSystemInstruction = [
      loadSystemPrompt().trim(),
      '',
      '## Instrucciones para análisis de mercado',
      '- Usa el precio real proporcionado arriba como dato de partida.',
      '- Complementa con noticias y contexto macro de HOY (Google Search ya los busca).',
      '- Para datos concretos (precios, fechas, eventos), usa SOLO lo que está en los datos entregados o en las noticias buscadas.',
      '- Formato WhatsApp: *negritas*, viñetas •. Sé conciso (máx 5-7 líneas).',
      '- Termina con: _Análisis informativo, no es asesoría financiera._',
    ].join('\n');
    const userText = `${priceBlock}${baseUserText}`;
    reply = await generateWithSearch(marketSystemInstruction, userText);
  } else {
    reply = await callLLM(systemInstruction, baseUserText, 1024);
  }

  const turns = [...history, { u: input.body, a: reply }].slice(-MAX_TURNS);
  chatHistory.set(input.chatId, turns);

  return reply;
}

/**
 * Gemini call WITH Google Search grounding — used by the daily NASDAQ report so the analysis is
 * based on the actual news of the day, not only the model's training knowledge.
 * If the model rejects the `google_search` tool, retries once without it (degraded) so the job
 * still produces output.
 */
export async function generateWithSearch(systemInstruction: string, userPrompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiSearchModel}:generateContent`;
  const body = (withSearch: boolean): string =>
    JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      ...(withSearch ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: { temperature: 0.4, maxOutputTokens: 700 },
    });

  const call = async (withSearch: boolean): Promise<{ ok: boolean; data: GeminiResponse; status: number }> => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-goog-api-key': config.geminiApiKey },
      body: body(withSearch),
    });
    const data = (await res.json().catch(() => ({}))) as GeminiResponse;
    return { ok: res.ok && !data.error, data, status: res.status };
  };

  let r = await call(true);
  if (!r.ok) {
    console.warn(`[nasdaq] google_search falló (${r.status}: ${r.data.error?.message || '?'}); reintento sin búsqueda`);
    r = await call(false);
  }
  if (!r.ok) {
    throw new Error(`gemini ${r.status}: ${r.data.error?.message || JSON.stringify(r.data).slice(0, 200)}`);
  }
  return (r.data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
}
