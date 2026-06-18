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

function parseTimeBlock(val: string): { startHour: number; startMin: number; windowMin: number } {
  const [start, end] = val.split('-');
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return { startHour: sh, startMin: sm, windowMin: eh * 60 + em - (sh * 60 + sm) };
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

  // Scheduler mode: test = every 5 min to TEST_GROUP_ID; production = time blocks to PRODUCTION_GROUPS.
  testMode: env('TEST_MODE', 'false') === 'true',
  testGroupId: env('TEST_GROUP_ID'),
  productionGroups: list('PRODUCTION_GROUPS'),
  schedulerTz: env('SCHEDULER_TZ', 'America/New_York'),

  // Job time blocks (HH:MM-HH:MM) + cron day expression (e.g. "1,3,5" or "1-5").
  nasdaqAnalysisBlock: parseTimeBlock(env('NASDAQ_ANALYSIS_BLOCK', '08:00-09:30')),
  nasdaqAnalysisDays: env('NASDAQ_ANALYSIS_DAYS', '1,3,5'),
  tradingTipsBlock: parseTimeBlock(env('TRADING_TIPS_BLOCK', '09:30-10:30')),
  tradingTipsDays: env('TRADING_TIPS_DAYS', '2,4'),
  newsShareBlock: parseTimeBlock(env('NEWS_SHARE_BLOCK', '15:00-16:30')),
  newsShareDays: env('NEWS_SHARE_DAYS', '1-5'),

  // Token to protect the admin endpoints (manual trigger). Empty = open in dev.
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
    console.warn('[config] ALLOWED_CHATS vacío y REPLY_TO_DIRECT=false → el bot no responderá mensajes entrantes.');
  }
  const targets = config.testMode ? [config.testGroupId].filter(Boolean) : config.productionGroups;
  if (targets.length === 0) {
    console.warn(
      config.testMode
        ? '[config] TEST_MODE=true pero TEST_GROUP_ID está vacío → los jobs no enviarán mensajes.'
        : '[config] PRODUCTION_GROUPS vacío → los jobs programados no enviarán mensajes. Configura PRODUCTION_GROUPS o activa TEST_MODE.',
    );
  }
}
