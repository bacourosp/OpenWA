import { config } from '../config.js';
import { generateWithSearch } from '../agent.js';
import { sendText } from '../openwa.js';
import { PABLO_VOICE } from './voice.js';

export async function buildNewsShare(): Promise<string> {
  const systemInstruction = [
    'Busca en Google una noticia MUY reciente (hoy o últimas 48h) O una declaración/publicación',
    'de una figura relevante del mercado financiero, relacionada con NASDAQ, tech o macro de EE.UU.',
    '',
    'Figuras de referencia (prioriza en este orden si encontrás algo suyo reciente):',
    'Ray Dalio, Jerome Powell, Stanley Druckenmiller, Bill Ackman, Cathie Wood,',
    'Warren Buffett, Michael Burry, Elon Musk (solo si habla de mercados, no de otra cosa).',
    '',
    PABLO_VOICE,
    '',
    'Formato: compártelo como si Pablo lo encontró navegando y se lo manda a sus amigos traders.',
    'Si es una cita de alguien, menciona quién lo dijo y cuándo.',
    'Si es una noticia, agrega 1 frase de comentario personal al final.',
    'Sin URLs ni fuentes citadas. Máximo 120 palabras.',
  ].join('\n');

  return generateWithSearch(
    systemInstruction,
    'Busca la noticia o declaración más relevante de hoy para traders de NASDAQ y tech.',
  );
}

export async function runNewsShare(
  targets = config.productionGroups,
): Promise<{ sent: string[]; text: string }> {
  const text = await buildNewsShare();
  const sent: string[] = [];
  for (const chatId of targets) {
    try {
      await sendText(chatId, text);
      sent.push(chatId);
      console.log(`[news-share] enviado a ${chatId}`);
    } catch (err) {
      console.error(`[news-share] error enviando a ${chatId}:`, (err as Error).message);
    }
  }
  return { sent, text };
}
