import { TokenUsageRecord, LLMProvider } from '../types';

const STORAGE_KEY = 'bluelens_token_usage';
const MAX_RECORDS = 1000; // cap to avoid unbounded growth

// ── Pricing table (USD per 1M tokens, approximate) ────────────────────────────

const PRICING: Record<string, { input: number; output: number }> = {
  // Gemini
  'gemini-3.1-flash-lite-preview': { input: 0.10,  output: 0.40  },
  'gemini-3.1-pro-preview':        { input: 1.25,  output: 5.00  },
  'gemini-3-flash-preview':        { input: 0.10,  output: 0.40  },
  'gemini-3-pro-preview':          { input: 1.25,  output: 5.00  },
  'gemini-2.5-flash-preview':      { input: 0.15,  output: 0.60  },
  'gemini-2.5-pro-preview':        { input: 1.25,  output: 10.00 },
  'gemini-2.0-flash':              { input: 0.10,  output: 0.40  },
  'gemini-2.0-flash-lite':         { input: 0.075, output: 0.30  },
  'gemini-1.5-flash':              { input: 0.075, output: 0.30  },
  'gemini-1.5-pro':                { input: 1.25,  output: 5.00  },
  // OpenAI
  'gpt-4o-mini':  { input: 0.15,  output: 0.60  },
  'gpt-4o':       { input: 2.50,  output: 10.00 },
  'gpt-4.1':      { input: 2.00,  output: 8.00  },
  'gpt-4.1-mini': { input: 0.40,  output: 1.60  },
  'gpt-4.1-nano': { input: 0.10,  output: 0.40  },
  'gpt-5':        { input: 2.50,  output: 10.00 },
  'gpt-5.1':      { input: 2.50,  output: 10.00 },
  'gpt-5.2':      { input: 2.50,  output: 10.00 },
  'o3':           { input: 10.00, output: 40.00 },
  'o3-pro':       { input: 20.00, output: 80.00 },
  'o4-mini':      { input: 1.10,  output: 4.40  },
  'o1':           { input: 15.00, output: 60.00 },
  'o1-mini':      { input: 3.00,  output: 12.00 },
  // Anthropic
  'claude-haiku-4-5-20251001':    { input: 0.80,  output: 4.00  },
  'claude-sonnet-4-5-20250929':   { input: 3.00,  output: 15.00 },
  'claude-sonnet-4-6':            { input: 3.00,  output: 15.00 },
  'claude-opus-4-6':              { input: 15.00, output: 75.00 },
  'claude-3-5-sonnet-20241022':   { input: 3.00,  output: 15.00 },
  'claude-3-5-haiku-20241022':    { input: 0.80,  output: 4.00  },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICING[model];
  if (!price) return 0;
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

export function hasKnownPricing(model: string): boolean {
  return model in PRICING;
}

// ── Persistence ───────────────────────────────────────────────────────────────

function load(): TokenUsageRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TokenUsageRecord[]) : [];
  } catch {
    return [];
  }
}

function save(records: TokenUsageRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Quota exceeded or unavailable — fail silently
  }
}

export function appendRecord(record: Omit<TokenUsageRecord, 'id'>): TokenUsageRecord {
  const records = load();
  const newRecord: TokenUsageRecord = { ...record, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
  const updated = [...records, newRecord].slice(-MAX_RECORDS);
  save(updated);
  return newRecord;
}

export function getRecords(): TokenUsageRecord[] {
  return load();
}

export function clearRecords(): void {
  save([]);
}

// ── Aggregation helpers ───────────────────────────────────────────────────────

export type Period = 'today' | '7d' | '30d' | 'all';

function periodStart(period: Period): number {
  const now = Date.now();
  if (period === 'today') return new Date().setHours(0, 0, 0, 0);
  if (period === '7d')    return now - 7  * 86_400_000;
  if (period === '30d')   return now - 30 * 86_400_000;
  return 0;
}

export function filterByPeriod(records: TokenUsageRecord[], period: Period): TokenUsageRecord[] {
  const start = periodStart(period);
  return records.filter(r => r.timestamp >= start);
}

export interface ProviderStats {
  provider: LLMProvider;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

export function aggregateByProvider(records: TokenUsageRecord[]): ProviderStats[] {
  const map = new Map<LLMProvider, ProviderStats>();
  for (const r of records) {
    const existing = map.get(r.provider) ?? { provider: r.provider, inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCost: 0 };
    map.set(r.provider, {
      ...existing,
      inputTokens:    existing.inputTokens    + r.inputTokens,
      outputTokens:   existing.outputTokens   + r.outputTokens,
      totalTokens:    existing.totalTokens    + r.totalTokens,
      estimatedCost:  existing.estimatedCost  + estimateCost(r.model, r.inputTokens, r.outputTokens),
    });
  }
  return [...map.values()].sort((a, b) => b.totalTokens - a.totalTokens);
}

export interface SourceStats {
  source: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  callCount: number;
}

export function aggregateBySource(records: TokenUsageRecord[]): SourceStats[] {
  const map = new Map<string, SourceStats>();
  for (const r of records) {
    const s = r.source ?? 'unknown';
    const existing = map.get(s) ?? { source: s, totalTokens: 0, inputTokens: 0, outputTokens: 0, callCount: 0 };
    map.set(s, {
      ...existing,
      totalTokens:  existing.totalTokens  + r.totalTokens,
      inputTokens:  existing.inputTokens  + r.inputTokens,
      outputTokens: existing.outputTokens + r.outputTokens,
      callCount:    existing.callCount    + 1,
    });
  }
  return [...map.values()].sort((a, b) => b.totalTokens - a.totalTokens);
}

export interface DailyStats {
  date: string; // YYYY-MM-DD
  totalTokens: number;
}

export function aggregateByDay(records: TokenUsageRecord[], days: number): DailyStats[] {
  const result: DailyStats[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const date = d.toISOString().slice(0, 10);
    const totalTokens = records
      .filter(r => r.timestamp >= d.getTime() && r.timestamp < next.getTime())
      .reduce((sum, r) => sum + r.totalTokens, 0);
    result.push({ date, totalTokens });
  }
  return result;
}
