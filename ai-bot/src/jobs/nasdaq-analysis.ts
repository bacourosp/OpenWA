import { config } from '../config.js';
import { generateWithSearch } from '../agent.js';
import { sendText } from '../openwa.js';
import { fetchNasPrice, formatQuote } from '../market.js';
import { PABLO_VOICE } from './voice.js';

export async function buildNasdaqAnalysis(signalContext?: string): Promise<string> {
  let priceBlock = '';
  try {
    const q = await fetchNasPrice();
    priceBlock = `${formatQuote(q)}\n\n`;
    console.log(`[nasdaq-analysis] precio: ${q.price}`);
  } catch (err) {
    console.warn('[nasdaq-analysis] precio no disponible:', (err as Error).message);
  }

  const signalBlock = signalContext
    ? [
        '',
        '--- SEÑAL ENTRANTE ---',
        signalContext.trim(),
        '--- FIN SEÑAL ---',
        '',
        'Esta señal ya tiene dirección y niveles definidos por el indicador QUANTUM.',
        'Tu tarea es proveer SOLO contexto macro que explique o complemente esos niveles de precio.',
        'Menciona si hay noticias o datos del calendario económico que afecten esa zona de precio.',
        'NO repitas la señal ni das otra recomendación direccional. Solo contexto y factores a vigilar.',
        '',
      ].join('\n')
    : '';

  const systemInstruction = [
    'Eres un analista fundamental del NASDAQ-100 (NAS100/USTEC/NQ=F).',
    'Se te da el precio actual de NQ=F — úsalo como dato de apertura.',
    'Usa Google Search para basar el análisis en noticias y calendario económico REALES de hoy.',
    'NO des pronósticos ni sesgos direccionales (alcista/bajista). Solo hechos y contexto.',
    signalBlock,
    PABLO_VOICE,
    '',
    'Estructura (en ese orden):',
    '• Precio actual al momento del análisis',
    '• 2-3 noticias macro más relevantes para el NASDAQ hoy',
    '• Calendario económico si hay datos importantes (CPI, NFP, FOMC, etc.)',
    '• Qué factores estar mirando hoy (sin decir hacia dónde va el precio)',
    'Máximo 220 palabras.',
  ].join('\n');

  const userPrompt =
    priceBlock +
    'Análisis fundamental del NASDAQ-100 para la sesión de HOY, con noticias macro reales y calendario económico de Estados Unidos.';

  return generateWithSearch(systemInstruction, userPrompt);
}

export async function runNasdaqAnalysis(
  targets = config.productionGroups,
): Promise<{ sent: string[]; text: string }> {
  const text = await buildNasdaqAnalysis();
  const sent: string[] = [];
  for (const chatId of targets) {
    try {
      await sendText(chatId, text);
      sent.push(chatId);
      console.log(`[nasdaq-analysis] enviado a ${chatId}`);
    } catch (err) {
      console.error(`[nasdaq-analysis] error enviando a ${chatId}:`, (err as Error).message);
    }
  }
  return { sent, text };
}

function formatConsolidated(signal: string, analysis: string): string {
  return [
    '🚨 *SEÑAL QUANTUM*',
    '',
    signal.trim(),
    '',
    '─────────────────',
    '📊 *CONTEXTO FUNDAMENTAL*',
    '',
    analysis,
  ].join('\n');
}

export async function runSignalAnalysis(signalText: string, targets: string[]): Promise<void> {
  console.log(`[signal-analysis] iniciando análisis con contexto de señal → ${targets.join(', ')}`);
  const analysis = await buildNasdaqAnalysis(signalText);
  const message = formatConsolidated(signalText, analysis);
  for (const chatId of targets) {
    try {
      await sendText(chatId, message);
      console.log(`[signal-analysis] enviado a ${chatId}`);
    } catch (err) {
      console.error(`[signal-analysis] error enviando a ${chatId}:`, (err as Error).message);
    }
  }
}
