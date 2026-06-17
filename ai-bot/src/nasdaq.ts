import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';
import { generateWithSearch } from './agent.js';
import { sendText } from './openwa.js';
import { fetchNasPrice, formatQuote } from './market.js';

/**
 * Daily NASDAQ fundamental-analysis report.
 * Builds a "fundamental analyst" prompt (role taken from the vault note when present),
 * grounds it on today's news via Gemini + Google Search, and sends it to DAILY_REPORT_CHATS.
 */

function loadRoleNote(): string {
  for (const name of ['experto-trading-nasdaq.md', 'experto-trading-nasdaq.markdown']) {
    try {
      return readFileSync(join(config.vaultDir, name), 'utf8');
    } catch {
      /* keep trying */
    }
  }
  return 'Actúa como analista fundamental del NASDAQ (NAS100/USTEC).';
}

export async function buildNasdaqReport(): Promise<string> {
  // Fetch real-time price first; include it in the prompt so the LLM doesn't have to guess.
  let priceBlock = '';
  try {
    const q = await fetchNasPrice();
    priceBlock = `${formatQuote(q)}\n\n`;
    console.log(`[nasdaq] precio obtenido para informe: ${q.price}`);
  } catch (err) {
    console.warn('[nasdaq] no se pudo obtener precio:', (err as Error).message);
  }

  const role = loadRoleNote();
  const systemInstruction = [
    role.trim(),
    '',
    'Eres el asistente de Pablo enviando el análisis fundamental matutino del NASDAQ por WhatsApp.',
    'Se te proporciona el precio real actual de USTEC/NQ=F — úsalo como dato de apertura.',
    'Usa Google Search para basarte en las noticias y el calendario económico REALES de hoy.',
    'Formato WhatsApp: usa *negritas* y viñetas con "•". Sé conciso (máx ~250 palabras).',
    'Estructura: título con la fecha de hoy y el precio actual; • Noticias/eventos clave de hoy;',
    '• Calendario económico; • Sesgo fundamental (alcista/bajista/neutral) con 1 frase;',
    '• Temas/niveles a vigilar (cualitativo).',
    'Termina SIEMPRE con: "_Análisis informativo, no es asesoría financiera._"',
    'Si no encuentras noticias del día, dilo con transparencia en vez de inventar.',
  ].join('\n');

  const userPrompt =
    priceBlock +
    'Genera el análisis fundamental del NASDAQ-100 (NAS100/US100/USTEC) para la sesión de HOY, ' +
    'con las noticias macro y de earnings más relevantes y el calendario económico de Estados Unidos.';

  return generateWithSearch(systemInstruction, userPrompt);
}

/** Generate + send to the configured chats. Returns a small summary for logs/admin endpoint. */
export async function runNasdaqReport(targets = config.dailyReportChats): Promise<{ sent: string[]; text: string }> {
  const text = await buildNasdaqReport();
  const sent: string[] = [];
  for (const chatId of targets) {
    try {
      await sendText(chatId, text);
      sent.push(chatId);
      console.log(`[nasdaq] informe enviado a ${chatId}`);
    } catch (err) {
      console.error(`[nasdaq] error enviando a ${chatId}:`, (err as Error).message);
    }
  }
  return { sent, text };
}
