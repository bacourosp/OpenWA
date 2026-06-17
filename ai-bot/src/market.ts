/**
 * Real-time NASDAQ-100 price via Yahoo Finance (NQ=F).
 * No API key required. ~15-min delay during regular hours.
 * USTEC.F (BlackBull Markets) tracks this instrument 1:1.
 */

export interface NasQuote {
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  marketState: 'abierto' | 'premarket' | 'afterhours' | 'cerrado';
  asOf: string; // human-readable NY time
}

const YF_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/NQ=F?interval=1d&range=1d';
const CACHE_TTL = 15 * 60 * 1000; // 15 min

let _cache: { quote: NasQuote; ts: number } | null = null;

export async function fetchNasPrice(): Promise<NasQuote> {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) return _cache.quote;

  const res = await fetch(YF_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; openwa-bot/1.0)' },
  });
  if (!res.ok) throw new Error(`Yahoo Finance ${res.status}`);

  const data = (await res.json()) as YFResponse;
  const m = data?.chart?.result?.[0]?.meta;
  if (!m?.regularMarketPrice) throw new Error('Yahoo Finance: respuesta inesperada');

  const now = Date.now() / 1000;
  const period = m.currentTradingPeriod;
  let marketState: NasQuote['marketState'] = 'cerrado';
  if (period) {
    if (now >= period.regular.start && now <= period.regular.end) marketState = 'abierto';
    else if (now < period.regular.start && now >= period.pre.start) marketState = 'premarket';
    else if (now > period.regular.end && now <= period.post.end) marketState = 'afterhours';
  }

  const price = m.regularMarketPrice;
  const prevClose = m.chartPreviousClose ?? price;
  const change = price - prevClose;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;

  const asOf = new Date(m.regularMarketTime * 1000).toLocaleString('es-MX', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: 'short',
  });

  const quote: NasQuote = {
    price,
    prevClose,
    change,
    changePct,
    high: m.regularMarketDayHigh ?? price,
    low: m.regularMarketDayLow ?? price,
    marketState,
    asOf,
  };

  _cache = { quote, ts: Date.now() };
  console.log(`[market] NQ=F: ${price.toFixed(0)} (${change >= 0 ? '+' : ''}${changePct.toFixed(2)}%) [${marketState}]`);
  return quote;
}

export function formatQuote(q: NasQuote): string {
  const sign = q.change >= 0 ? '+' : '';
  const stateLabel = { abierto: '🟢 abierto', premarket: '🟡 premarket', afterhours: '🌙 after hours', cerrado: '🔴 cerrado' }[q.marketState];
  return (
    `📊 *USTEC / NAS100 (NQ=F)*\n` +
    `Precio: *${q.price.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}*\n` +
    `Cambio: ${sign}${q.change.toFixed(2)} (${sign}${q.changePct.toFixed(2)}%)\n` +
    `H: ${q.high.toFixed(2)} | L: ${q.low.toFixed(2)}\n` +
    `Mercado: ${stateLabel} | ${q.asOf} NY`
  );
}

// ── Yahoo Finance response types ──────────────────────────────────────────────
interface TradingPeriod { start: number; end: number }
interface YFMeta {
  regularMarketPrice: number;
  chartPreviousClose?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketTime: number;
  currentTradingPeriod?: { pre: TradingPeriod; regular: TradingPeriod; post: TradingPeriod };
}
interface YFResponse { chart?: { result?: Array<{ meta: YFMeta }> } }
