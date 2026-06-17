import { config } from '../config.js';
import { callLLM } from '../llm.js';
import { sendText } from '../openwa.js';
import { PABLO_VOICE } from './voice.js';

// In-memory rotation: avoid repeating topics across consecutive runs (resets on restart)
const recentTopics: string[] = [];
const MAX_RECENT = 5;

export async function buildTradingTip(): Promise<string> {
  const avoidClause =
    recentTopics.length > 0
      ? `Evita estos temas (ya enviados recientemente): ${recentTopics.join(' / ')}. `
      : '';

  const systemInstruction = [
    'Eres un mentor de trading compartiendo un tip o buena práctica por WhatsApp.',
    avoidClause,
    '',
    PABLO_VOICE,
    '',
    'El tip debe ser práctico y accionable. Elige UN solo tema de esta lista:',
    'gestión de riesgo, psicología del trader, sizing de posición, disciplina,',
    'análisis técnico (soportes/resistencias, medias móviles, RSI), journaling,',
    'manejo del drawdown, errores comunes del retail, expectativa matemática.',
    'Máximo 140 palabras. Nada de introducción genérica.',
  ].join('\n');

  const tip = await callLLM(
    systemInstruction,
    'Escribe el tip de trading de hoy, directo al grano.',
    210,
  );

  // Track topic fingerprint to avoid repetition
  recentTopics.push(tip.split('\n')[0].slice(0, 70));
  if (recentTopics.length > MAX_RECENT) recentTopics.shift();

  return tip;
}

export async function runTradingTips(
  targets = config.productionGroups,
): Promise<{ sent: string[]; text: string }> {
  const text = await buildTradingTip();
  const sent: string[] = [];
  for (const chatId of targets) {
    try {
      await sendText(chatId, text);
      sent.push(chatId);
      console.log(`[trading-tips] enviado a ${chatId}`);
    } catch (err) {
      console.error(`[trading-tips] error enviando a ${chatId}:`, (err as Error).message);
    }
  }
  return { sent, text };
}
