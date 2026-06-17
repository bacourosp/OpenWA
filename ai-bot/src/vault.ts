import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';

/**
 * Loads the knowledge base from the Obsidian vault folder (mounted at /vault) and selects
 * the most relevant notes for a given question, to ground the model's answer.
 *
 * This is "files + relevant-context injection": robust, no external index/embeddings needed,
 * and ideal for a small/medium vault. For a very large vault, swap selectContext() for a
 * vector-RAG retrieval (e.g. Gemini embeddings) — the rest of the bot stays the same.
 */

export interface Note {
  title: string;
  path: string;
  text: string;
}

export function loadNotes(dir = config.vaultDir): Note[] {
  const notes: Note[] = [];
  const walk = (d: string): void => {
    let entries: string[] = [];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.startsWith('.')) continue;
      const p = join(d, e);
      let st;
      try {
        st = statSync(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) walk(p);
      else if (/\.(md|markdown|txt)$/i.test(e)) {
        try {
          notes.push({ title: e.replace(/\.(md|markdown|txt)$/i, ''), path: p, text: readFileSync(p, 'utf8') });
        } catch {
          /* skip unreadable */
        }
      }
    }
  };
  walk(dir);
  return notes;
}

/** Naive keyword overlap scoring → pick the top-K notes, capped by a character budget. */
export function selectContext(notes: Note[], queryText: string): { context: string; used: string[] } {
  const terms = queryText
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 3);

  const scored = notes
    .map((n) => {
      const hay = (n.title + '\n' + n.text).toLowerCase();
      let score = 0;
      for (const w of terms) if (hay.includes(w)) score++;
      return { n, score };
    })
    .sort((a, b) => b.score - a.score);

  // Prefer notes that actually match; if nothing matches, fall back to the whole (small) vault.
  const matched = scored.filter((s) => s.score > 0).map((s) => s.n);
  const list = (matched.length ? matched : notes).slice(0, config.ragTopK);

  let context = '';
  const used: string[] = [];
  for (const n of list) {
    const block = `## ${n.title}\n${n.text.trim()}\n\n`;
    if (context.length + block.length > config.ragMaxChars) break;
    context += block;
    used.push(n.title);
  }
  return { context, used };
}
