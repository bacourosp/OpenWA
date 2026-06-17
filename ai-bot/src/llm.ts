import { config } from './config.js';

/**
 * Multi-provider LLM layer with automatic fallback.
 * Providers are tried in the order defined by LLM_PROVIDERS.
 * A provider is skipped when its API key is missing.
 * 503/429 errors trigger one retry (2 s wait) before moving to the next provider.
 */

// ── Gemini ────────────────────────────────────────────────────────────────────

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { code?: number; status?: string; message?: string };
}

async function callGemini(system: string, user: string, maxTokens: number): Promise<string> {
  if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY not set');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.geminiModel}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-goog-api-key': config.geminiApiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as GeminiResponse;
  if (!res.ok || data.error) throw Object.assign(new Error(`gemini ${res.status}: ${data.error?.message || ''}`), { status: res.status });
  return (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
}

// ── OpenRouter (OpenAI-compatible) ────────────────────────────────────────────

interface OpenAIResponse {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
}

async function callOpenRouter(system: string, user: string, maxTokens: number): Promise<string> {
  if (!config.openrouterApiKey) throw new Error('OPENROUTER_API_KEY not set');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.openrouterApiKey}`,
      'HTTP-Referer': 'https://github.com/openwa',
    },
    body: JSON.stringify({
      model: config.openrouterModel,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.3,
      max_tokens: maxTokens,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as OpenAIResponse;
  if (!res.ok || data.error) throw Object.assign(new Error(`openrouter ${res.status}: ${data.error?.message || ''}`), { status: res.status });
  return (data.choices?.[0]?.message?.content || '').trim();
}

// ── HuggingFace Inference API ─────────────────────────────────────────────────

interface HFResponse {
  generated_text?: string;
  error?: string;
}

async function callHuggingFace(system: string, user: string, maxTokens: number): Promise<string> {
  if (!config.hfApiKey) throw new Error('HF_API_KEY not set');
  // Mistral instruct format; works for most HF chat models.
  const prompt = `<s>[INST] ${system}\n\n${user} [/INST]`;
  const res = await fetch(`https://api-inference.huggingface.co/models/${config.hfModel}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.hfApiKey}` },
    body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: maxTokens, temperature: 0.3, return_full_text: false } }),
  });
  const raw = await res.json().catch(() => ({}));
  const data = (Array.isArray(raw) ? raw[0] : raw) as HFResponse;
  if (!res.ok || data.error) throw Object.assign(new Error(`huggingface ${res.status}: ${data.error || ''}`), { status: res.status });
  return (data.generated_text || '').trim();
}

// ── Fallback chain ────────────────────────────────────────────────────────────

const ADAPTERS: Record<string, (system: string, user: string, maxTokens: number) => Promise<string>> = {
  gemini: callGemini,
  openrouter: callOpenRouter,
  huggingface: callHuggingFace,
};

const RETRYABLE = new Set([429, 503]);

export async function callLLM(system: string, user: string, maxTokens = 450): Promise<string> {
  const providers = config.llmProviders.filter((p) => p in ADAPTERS);
  if (providers.length === 0) throw new Error('No LLM providers configured');

  let lastError = 'no providers available';
  for (const name of providers) {
    const call = ADAPTERS[name];
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const text = await call(system, user, maxTokens);
        if (attempt > 1 || providers.indexOf(name) > 0) console.log(`[llm] respondió: ${name}`);
        return text;
      } catch (err) {
        const e = err as Error & { status?: number };
        lastError = e.message;
        const isRetryable = RETRYABLE.has(e.status ?? 0);
        if (isRetryable && attempt === 1) {
          console.warn(`[llm] ${name} falló (${e.status}), reintentando en 2s…`);
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        console.warn(`[llm] ${name} falló definitivamente: ${e.message.slice(0, 120)}`);
        break;
      }
    }
    // Try next provider
    const next = providers[providers.indexOf(name) + 1];
    if (next) console.log(`[llm] cambiando a ${next}…`);
  }
  throw new Error(lastError);
}
