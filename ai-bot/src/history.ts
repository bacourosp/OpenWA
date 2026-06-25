import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';

export interface Turn {
  u: string;
  a: string;
  ts: number;
}

function historyPath(chatId: string): string {
  const safe = chatId.replace(/[^a-zA-Z0-9_-]/g, '_');
  return join(config.historyDir, `${safe}.json`);
}

export function loadHistory(chatId: string): Turn[] {
  const path = historyPath(chatId);
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Turn[];
  } catch {
    return [];
  }
}

function saveHistory(chatId: string, turns: Turn[]): void {
  try {
    mkdirSync(config.historyDir, { recursive: true });
    writeFileSync(historyPath(chatId), JSON.stringify(turns));
  } catch (err) {
    console.warn('[history] no se pudo guardar:', (err as Error).message);
  }
}

export function appendTurn(chatId: string, userMsg: string, assistantReply: string): void {
  const history = loadHistory(chatId);
  const updated = [...history, { u: userMsg, a: assistantReply, ts: Date.now() }].slice(-config.maxHistoryTurns);
  saveHistory(chatId, updated);
}
