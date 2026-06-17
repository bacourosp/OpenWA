import { config } from './config.js';

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number };
    message_thread_id?: number;
    text?: string;
  };
}

interface GetUpdatesResponse {
  ok: boolean;
  result: TelegramUpdate[];
}

function isSignal(text?: string): boolean {
  if (!text) return false;
  return text.includes('Entrada:') && (text.includes('Stop Loss:') || text.includes('SL:'));
}

async function getUpdates(token: string, offset: number): Promise<TelegramUpdate[]> {
  const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&timeout=10&allowed_updates=["message"]`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const data = (await res.json()) as GetUpdatesResponse;
  if (!data.ok) throw new Error(`Telegram getUpdates failed: ${JSON.stringify(data)}`);
  return data.result ?? [];
}

export function startTelegramListener(onSignal: (signalText: string) => Promise<void>): void {
  const { signalsBotToken: token, signalsChannelId: channelId, signalsThreadId: threadId } = config;

  if (!token || !channelId || !threadId) {
    console.warn('[telegram] SIGNALS_BOT_TOKEN / SIGNALS_CHANNEL_ID / SIGNALS_THREAD_ID no configurados — listener no iniciado');
    return;
  }

  let offset = 0;
  let isProcessing = false;
  // Only keep the latest unprocessed signal to avoid backlog flooding
  let queued: string | null = null;

  const runHandler = async (signalText: string): Promise<void> => {
    isProcessing = true;
    try {
      await onSignal(signalText);
    } catch (err) {
      console.error('[telegram] error procesando señal:', (err as Error).message);
    } finally {
      isProcessing = false;
      // Process queued signal if one arrived while we were busy
      if (queued !== null) {
        const next = queued;
        queued = null;
        runHandler(next).catch(console.error);
      }
    }
  };

  const poll = async (): Promise<void> => {
    while (true) {
      try {
        const updates = await getUpdates(token, offset);
        for (const u of updates) {
          offset = u.update_id + 1;
          const msg = u.message;
          if (!msg) continue;
          if (msg.chat.id !== channelId) continue;
          if (msg.message_thread_id !== threadId) continue;
          if (!isSignal(msg.text)) continue;

          const text = msg.text!;
          console.log(`[telegram] señal recibida (update_id=${u.update_id}): ${text.slice(0, 80)}`);

          if (isProcessing) {
            queued = text; // overwrite — keep only the latest
            console.log('[telegram] análisis en curso — señal encolada (la anterior descartada)');
          } else {
            runHandler(text).catch(console.error);
          }
        }
      } catch (err) {
        console.error('[telegram] poll error, reintentando en 5s:', (err as Error).message);
        await new Promise((r) => setTimeout(r, 5_000));
      }
    }
  };

  poll().catch((err) => console.error('[telegram] loop fatal:', err));
  console.log(`[telegram] listener iniciado — canal=${channelId} thread=${threadId}`);
}
