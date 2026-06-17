import { config } from './config.js';

/**
 * Thin client for the OpenWA gateway REST API.
 * Endpoints per docs/06-api-specification.md (confirmed against the running Swagger).
 */

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-ID': `req_${Date.now()}`,
  };
  if (config.openwaApiKey) h['X-API-Key'] = config.openwaApiKey;
  return h;
}

const WA_MAX_CHARS = 4096;

/** POST /api/sessions/:sessionId/messages/send-text — splits at WA_MAX_CHARS if needed. */
export async function sendText(chatId: string, text: string): Promise<void> {
  const url = `${config.openwaBaseUrl}/sessions/${config.sessionId}/messages/send-text`;
  const chunks = text.length <= WA_MAX_CHARS ? [text] : splitText(text, WA_MAX_CHARS);
  for (const chunk of chunks) {
    const res = await fetch(url, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ chatId, text: chunk }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`send-text failed (${res.status}): ${body}`);
    }
  }
}

function splitText(text: string, limit: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    // Prefer splitting at the last newline before the limit.
    let cut = remaining.lastIndexOf('\n', limit);
    if (cut < limit * 0.5) cut = limit; // no sensible break — hard cut
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

/** GET /api/sessions/:sessionId → current status (or null if unreachable). */
export async function getSessionStatus(): Promise<string | null> {
  try {
    const res = await fetch(`${config.openwaBaseUrl}/sessions/${config.sessionId}`, { headers: headers() });
    if (!res.ok) return null;
    const j = (await res.json()) as { status?: string };
    return j.status ?? null;
  } catch {
    return null;
  }
}

/** POST /api/sessions/:sessionId/start */
export async function startSession(): Promise<void> {
  await fetch(`${config.openwaBaseUrl}/sessions/${config.sessionId}/start`, { method: 'POST', headers: headers() });
}

/**
 * On boot, make sure the WhatsApp session is running. OpenWA resets sessions to "disconnected" on
 * startup and does not auto-start them, so after a reboot/relaunch we start it here. The WhatsApp
 * auth persists on disk → it reconnects WITHOUT a new QR.
 */
export async function ensureSessionStarted(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    const status = await getSessionStatus();
    if (status === 'ready' || status === 'connected' || status === 'initializing' || status === 'qr_ready') {
      console.log(`[session] estado=${status} (ok)`);
      return;
    }
    if (status === null) {
      await new Promise((r) => setTimeout(r, 3000)); // gateway aún arrancando
      continue;
    }
    // disconnected / failed / created → arrancar
    console.log(`[session] estado=${status} → enviando start`);
    await startSession();
    await new Promise((r) => setTimeout(r, 5000));
  }
  console.warn('[session] no se pudo confirmar el arranque de la sesión tras varios intentos');
}

/**
 * Register this bot as a webhook on the session (idempotent enough for setup).
 * POST /api/sessions/:sessionId/webhooks
 */
export async function registerWebhook(targetUrl: string): Promise<unknown> {
  const url = `${config.openwaBaseUrl}/sessions/${config.sessionId}/webhooks`;
  const res = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      url: targetUrl,
      events: ['message.received'],
      secret: config.webhookSecret,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`register webhook failed (${res.status}): ${JSON.stringify(body)}`);
  return body;
}
