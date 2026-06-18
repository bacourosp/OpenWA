import crypto from 'node:crypto';
import express from 'express';
import { config, assertConfig } from './config.js';
import { generateReply } from './agent.js';
import { sendText, ensureSessionStarted } from './openwa.js';
import { startSchedulers } from './scheduler.js';
import { runNasdaqAnalysis } from './jobs/nasdaq-analysis.js';

assertConfig();

const app = express();

// Capture the raw body so the HMAC is computed over the exact bytes OpenWA signed.
// limit raised well above Express' 100kb default: group message.received payloads (metadata/media)
// exceed it and were rejected with HTTP 413, so the bot never processed them.
app.use(
  express.json({
    limit: '25mb',
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);

function verifySignature(req: express.Request): boolean {
  // Dev convenience: if no secret configured, skip (OpenWA also allows unsigned in dev).
  if (!config.webhookSecret) return true;
  const sig = req.header('x-openwa-signature');
  if (!sig) return false;
  const raw = (req as express.Request & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body));
  const expected = 'sha256=' + crypto.createHmac('sha256', config.webhookSecret).update(raw).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Deduplication: prevent double-processing when OpenWA retries the same webhook.
// OpenWA sends unusable IDs ("msg_unknown") so we key on sender+body+30s bucket.
const seen = new Map<string, number>();
const SEEN_TTL = 60_000; // 60s is enough to catch retries
function alreadyHandled(from: string, body: string): boolean {
  const bucket = Math.floor(Date.now() / 30_000);
  const key = `${from}|${body.slice(0, 60)}|${bucket}`;
  const now = Date.now();
  for (const [k, t] of seen) if (now - t > SEEN_TTL) seen.delete(k);
  if (seen.has(key)) return true;
  seen.set(key, now);
  return false;
}

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

/**
 * Manually trigger the NASDAQ report (to test without waiting for 07:00 NY).
 * Optional body { "to": ["<chatId>", ...] } overrides DAILY_REPORT_CHATS (e.g. send to a test group).
 * Protected by ADMIN_TOKEN when set (header x-admin-token).
 */
app.post('/admin/nasdaq-report', async (req, res) => {
  if (config.adminToken && req.header('x-admin-token') !== config.adminToken) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const to = Array.isArray(req.body?.to) && req.body.to.length ? (req.body.to as string[]) : undefined;
  try {
    const result = await runNasdaqAnalysis(to);
    res.json({ ok: true, sent: result.sent, preview: result.text.slice(0, 500) });
  } catch (err) {
    console.error('[admin] nasdaq-report error:', err);
    res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

app.post('/webhook', (req, res) => {
  if (!verifySignature(req)) {
    console.warn('[webhook] invalid signature');
    return res.status(401).send('invalid signature');
  }

  // ACK immediately — LLM generation can exceed the 10s webhook timeout, so process async.
  res.status(200).json({ status: 'accepted' });

  console.log(`[webhook] event=${req.body?.event} from=${req.body?.data?.from} type=${req.body?.data?.type}`);

  handleEvent(req.body).catch((err) => console.error('[webhook] handler error:', err));
});

// Suppress noisy body-parser stack traces when the webhook client disconnects mid-stream.
app.use((err: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.name === 'BadRequestError' || err.message === 'request aborted') return res.status(400).end();
  next(err);
});

interface InboundMessage {
  event?: string;
  data?: {
    id?: string;
    from?: string;
    chatId?: string;
    body?: string;
    type?: string;
    isGroup?: boolean;
    fromMe?: boolean;
    contact?: { name?: string; pushName?: string };
  };
}

async function handleEvent(payload: InboundMessage): Promise<void> {
  if (payload.event && payload.event !== 'message.received') {
    // Uncomment to debug non-message events: console.log(`[event] ignored: ${payload.event}`);
    return;
  }
  const d = payload.data ?? {};

  // The chat to reply into: group id for groups, sender id for direct chats.
  const chatId = d.chatId || d.from;
  if (!chatId) { console.log('[filter] no chatId'); return; }

  if (config.ignoreFromMe && d.fromMe) { console.log(`[filter] fromMe — ignorado`); return; }
  if (chatId === 'status@broadcast') return;
  if (!d.body) { console.log(`[filter] ${chatId} sin body (type=${d.type})`); return; }
  if (d.type && d.type !== 'chat' && d.type !== 'text') {
    console.log(`[filter] ${chatId} tipo no-texto: ${d.type}`);
    return;
  }

  // Allow-list: only attend configured groups (and DMs only if explicitly enabled).
  const isGroup = d.isGroup ?? chatId.endsWith('@g.us');
  if (!config.allowedChats.has(chatId)) {
    if (!(config.replyToDirect && !isGroup)) {
      console.log(`[skip] ${chatId} not in ALLOWED_CHATS`);
      return;
    }
  }

  const body = d.body.slice(0, config.maxInboundChars);

  // Dedup using sender+body+time — OpenWA sends unusable message IDs.
  if (alreadyHandled(chatId, body)) {
    console.log(`[filter] duplicado en ventana 30s — ignorado`);
    return;
  }

  console.log(`[msg] ${chatId}${isGroup ? ' (group)' : ''}: ${body.slice(0, 80)}`);

  let reply: string;
  try {
    reply = await generateReply({
      body,
      isGroup,
      senderName: d.contact?.name || d.contact?.pushName,
      chatId,
    });
  } catch (err) {
    console.error(`[reply] Gemini error for ${chatId}:`, (err as Error).message);
    await sendText(chatId, '⚠️ El asistente tuvo un problema técnico. Intenta de nuevo en un momento.').catch(() => {});
    return;
  }

  if (!reply) {
    console.log('[reply] empty — nothing sent');
    return;
  }
  await sendText(chatId, reply);
  console.log(`[reply] sent to ${chatId} (${reply.length} chars)`);
}

app.listen(config.port, () => {
  console.log(`openwa-ai-bot listening on :${config.port}`);
  console.log(`  session=${config.sessionId} allowedChats=${[...config.allowedChats].join(',') || '(none)'}`);
  ensureSessionStarted().catch((err) => console.error('[session] ensureSessionStarted error:', err));
  startSchedulers();

});
