import 'dotenv/config';

function env(name: string, fallback = ''): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function list(name: string): string[] {
  return env(name)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * All runtime configuration for the bot. Nothing here is OpenWA-specific code —
 * it only needs the gateway's base URL + (optional in dev) API key, the session id,
 * the webhook secret, and the list of WhatsApp chats it is allowed to answer in.
 */
export const config = {
  // HTTP server the OpenWA webhook posts to (http://ai-bot:3000/webhook inside compose).
  port: Number(env('PORT', '3000')),

  // OpenWA gateway REST API.
  openwaBaseUrl: env('OPENWA_BASE_URL', 'http://openwa:2785/api'),
  openwaApiKey: env('OPENWA_API_KEY'), // empty is fine in dev (API_MASTER_KEY unset)
  sessionId: env('SESSION_ID'),

  // Shared secret used to register + verify the webhook HMAC (x-openwa-signature).
  webhookSecret: env('WEBHOOK_SECRET'),

  // Group/contact allow-list. Only messages from these chat ids get a reply.
  // Group ids look like "1203...@g.us"; direct chats like "628...@c.us".
  allowedChats: new Set(list('ALLOWED_CHATS')),
  // When false (default) the bot only answers groups in ALLOWED_CHATS, never 1:1 DMs.
  replyToDirect: env('REPLY_TO_DIRECT', 'false') === 'true',

  // LLM provider chain — tried in order; first success wins.
  llmProviders: list('LLM_PROVIDERS').length ? list('LLM_PROVIDERS') : ['gemini'],

  // Google Gemini (primary)
  geminiApiKey: env('GEMINI_API_KEY'),
  geminiModel: env('GEMINI_MODEL', 'gemini-flash-latest'),
  // Separate model for the Google-Search-grounded NASDAQ job.
  geminiSearchModel: env('GEMINI_SEARCH_MODEL', 'gemini-2.5-flash'),

  // OpenRouter (fallback 1) — free key at openrouter.ai/keys
  openrouterApiKey: env('OPENROUTER_API_KEY'),
  openrouterModel: env('OPENROUTER_MODEL', 'openrouter/auto'),

  // HuggingFace (fallback 2) — free key at huggingface.co/settings/tokens
  hfApiKey: env('HF_API_KEY'),
  hfModel: env('HF_MODEL', 'mistralai/Mistral-7B-Instruct-v0.3'),

  systemPromptPath: env('SYSTEM_PROMPT_PATH', new URL('../system-prompt.md', import.meta.url).pathname),

  // Knowledge base (Obsidian vault) + retrieval budget.
  vaultDir: env('VAULT_DIR', '/vault'),
  ragTopK: Number(env('RAG_TOP_K', '6')),
  ragMaxChars: Number(env('RAG_MAX_CHARS', '120000')),

  // Daily NASDAQ fundamental report (scheduled automation).
  dailyReportChats: list('DAILY_REPORT_CHATS'),
  dailyReportCron: env('DAILY_REPORT_CRON', '0 7 * * 1-5'),
  dailyReportTz: env('DAILY_REPORT_TZ', 'America/New_York'),
  // Token to protect the admin endpoints (manual report trigger). Empty = allow in dev.
  adminToken: env('ADMIN_TOKEN'),

  // Guardrails.
  ignoreFromMe: env('IGNORE_FROM_ME', 'true') === 'true',
  maxInboundChars: Number(env('MAX_INBOUND_CHARS', '4000')),
};

export function assertConfig(): void {
  const missing: string[] = [];
  if (!config.sessionId) missing.push('SESSION_ID');
  if (!config.webhookSecret) missing.push('WEBHOOK_SECRET');
  if (!config.geminiApiKey) missing.push('GEMINI_API_KEY');
  if (missing.length) {
    throw new Error(`Missing required env: ${missing.join(', ')}`);
  }
  if (config.allowedChats.size === 0 && !config.replyToDirect) {
    console.warn(
      '[config] ALLOWED_CHATS is empty and REPLY_TO_DIRECT=false → the bot will not reply to anything. ' +
        'Add group ids to ALLOWED_CHATS.',
    );
  }
}
