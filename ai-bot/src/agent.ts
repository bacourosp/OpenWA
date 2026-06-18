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
interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string; // "STOP" | "MAX_TOKENS" | "SAFETY" | ...
  }[];
  error?: { message?: string };
}

export async function generateWithSearch(systemInstruction: string, userPrompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiSearchModel}:generateContent`;

  const buildBody = (withSearch: boolean, maxTokens: number, prompt: string): string =>
    JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      ...(withSearch ? { tools: [{ google_search: {} }] } : {}),
      generationConfig: { temperature: 0.4, maxOutputTokens: maxTokens },
    });

  const call = async (
    withSearch: boolean,
    maxTokens: number,
    prompt: string,
  ): Promise<{ ok: boolean; data: GeminiResponse; status: number }> => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-goog-api-key': config.geminiApiKey },
      body: buildBody(withSearch, maxTokens, prompt),
    });
    const data = (await res.json().catch(() => ({}))) as GeminiResponse;
    return { ok: res.ok && !data.error, data, status: res.status };
  };

  const extractText = (data: GeminiResponse): string =>
    (data.candidates?.[0]?.content?.parts || []).map((p: { text?: string }) => p.text || '').join('').trim();

  const isTruncated = (data: GeminiResponse): boolean =>
    data.candidates?.[0]?.finishReason === 'MAX_TOKENS';

  // Attempt 1: Google Search grounding, 1500 tokens
  let r = await call(true, 1500, userPrompt);
  if (!r.ok) {
    console.warn(`[gemini] google_search falló (${r.status}: ${r.data.error?.message || '?'}); reintento sin búsqueda`);
    r = await call(false, 1500, userPrompt);
  }
  if (!r.ok) {
    // Gemini unavailable (quota/network) — fall back to callLLM without search grounding
    console.warn(`[gemini] no disponible (${r.status}) — usando callLLM como fallback`);
    return callLLM(systemInstruction, userPrompt, 1200);
  }

  // Attempt 2: If truncated, retry with higher limit + brevity instruction
  if (isTruncated(r.data)) {
    console.warn('[gemini] respuesta truncada (MAX_TOKENS) — reintentando con límite mayor y brevedad forzada');
    const briefPrompt = userPrompt + '\n\n[CRÍTICO: El mensaje DEBE terminar con una oración completa. Prioriza brevedad sobre completitud de temas.]';
    const r2 = await call(false, 2500, briefPrompt);
    if (r2.ok && !isTruncated(r2.data)) {
      return extractText(r2.data);
    }

    // Attempt 3: Repair with callLLM (multi-provider fallback)
    console.warn('[gemini] sigue truncado — usando callLLM para reparar mensaje');
    const partial = extractText(r.data);
    const repairPrompt = `Tienes este mensaje incompleto de trading para WhatsApp:\n---\n${partial}\n---\nReescríbelo completo en máx 3-4 frases cortas. Debe terminar con "_No es asesoría financiera._"`;
    try {
      return await callLLM('Eres un asistente que repara mensajes incompletos de trading.', repairPrompt, 600);
    } catch (err) {
      console.error('[gemini] reparación fallida — enviando mensaje parcial:', (err as Error).message);
      return partial + ' ⚠️ (mensaje incompleto)';
    }
  }

  return extractText(r.data);
}
