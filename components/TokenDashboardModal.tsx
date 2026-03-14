import React, { useState, useMemo } from 'react';
import { X, Trash2, AlertCircle } from 'lucide-react';
import { TokenUsageRecord } from '../types';
import {
  Period, filterByPeriod, aggregateByProvider, aggregateByDay, aggregateBySource,
  estimateCost, hasKnownPricing,
} from '../services/tokenUsageService';

interface TokenDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: TokenUsageRecord[];
  onClear: () => void;
}

const PERIOD_LABELS: { id: Period; label: string }[] = [
  { id: 'today', label: "Today" },
  { id: '7d',    label: "7 days" },
  { id: '30d',   label: "30 days" },
  { id: 'all',   label: "All time" },
];

const PROVIDER_COLORS: Record<string, string> = {
  gemini:    'bg-cyan-500',
  openai:    'bg-green-500',
  anthropic: 'bg-orange-400',
};

const PROVIDER_TEXT: Record<string, string> = {
  gemini:    'text-cyan-400',
  openai:    'text-green-400',
  anthropic: 'text-orange-400',
};

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtCost(usd: number): string {
  if (usd < 0.001)  return '< $0.001';
  if (usd < 1)      return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtTs(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const StatCard: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div className="bg-dark-800 border border-gray-800 rounded-lg px-4 py-3 flex flex-col gap-0.5">
    <span className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</span>
    <span className="text-xl font-bold text-white font-mono">{value}</span>
    {sub && <span className="text-[10px] text-gray-600">{sub}</span>}
  </div>
);

export const TokenDashboardModal: React.FC<TokenDashboardModalProps> = ({
  isOpen, onClose, records, onClear,
}) => {
  const [period, setPeriod] = useState<Period>('7d');
  const [confirmClear, setConfirmClear] = useState(false);

  const filtered = useMemo(() => filterByPeriod(records, period), [records, period]);
  const byProvider = useMemo(() => aggregateByProvider(filtered), [filtered]);
  const bySource = useMemo(() => aggregateBySource(filtered), [filtered]);
  const dailyData = useMemo(() => aggregateByDay(filtered, period === '30d' ? 30 : 14), [filtered, period]);

  const totalTokens   = filtered.reduce((s, r) => s + r.totalTokens, 0);
  const totalInput    = filtered.reduce((s, r) => s + r.inputTokens, 0);
  const totalOutput   = filtered.reduce((s, r) => s + r.outputTokens, 0);
  const totalCost     = filtered.reduce((s, r) => s + estimateCost(r.model, r.inputTokens, r.outputTokens), 0);
  const hasCostData   = filtered.some(r => hasKnownPricing(r.model));

  const maxDaily = Math.max(...dailyData.map(d => d.totalTokens), 1);
  const recent   = [...filtered].sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);

  if (!isOpen) return null;

  const handleClear = () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    onClear();
    setConfirmClear(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-dark-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-white">Token Usage</h2>
            <div className="flex items-center gap-1 bg-dark-800 rounded-lg p-0.5">
              {PERIOD_LABELS.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setPeriod(p.id); setConfirmClear(false); }}
                  className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                    period === p.id
                      ? 'bg-brand-600 text-white'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {records.length > 0 && (
              <button
                onClick={handleClear}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                  confirmClear
                    ? 'border-red-500/60 bg-red-500/10 text-red-400 hover:bg-red-500/20'
                    : 'border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                }`}
                title="Clear all usage records"
              >
                <Trash2 className="w-3 h-3" />
                {confirmClear ? 'Confirm clear' : 'Clear'}
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-5">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
              <AlertCircle className="w-8 h-8 text-gray-700" />
              <p className="text-sm text-gray-500">No data for this period.</p>
              <p className="text-xs text-gray-700">Token usage is recorded each time you use the AI chat.</p>
            </div>
          ) : (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Total tokens" value={fmt(totalTokens)} />
                <StatCard label="Input" value={fmt(totalInput)} sub={`${totalTokens > 0 ? Math.round(totalInput / totalTokens * 100) : 0}%`} />
                <StatCard label="Output" value={fmt(totalOutput)} sub={`${totalTokens > 0 ? Math.round(totalOutput / totalTokens * 100) : 0}%`} />
                <StatCard
                  label="Est. cost"
                  value={hasCostData ? fmtCost(totalCost) : '—'}
                  sub={hasCostData ? 'approximate' : 'pricing unavailable'}
                />
              </div>

              {/* By provider */}
              {byProvider.length > 0 && (
                <div className="bg-dark-800 border border-gray-800 rounded-lg p-4">
                  <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">By provider</h3>
                  <div className="space-y-3">
                    {byProvider.map(p => (
                      <div key={p.provider}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className={`font-medium capitalize ${PROVIDER_TEXT[p.provider] ?? 'text-gray-400'}`}>
                            {p.provider}
                          </span>
                          <div className="flex items-center gap-3 text-gray-400">
                            <span className="font-mono">{fmt(p.totalTokens)} tok</span>
                            {hasKnownPricing && p.estimatedCost > 0 && (
                              <span className="text-gray-600">{fmtCost(p.estimatedCost)}</span>
                            )}
                          </div>
                        </div>
                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${PROVIDER_COLORS[p.provider] ?? 'bg-brand-500'}`}
                            style={{ width: `${totalTokens > 0 ? (p.totalTokens / totalTokens * 100) : 0}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* By source */}
              {bySource.length > 0 && (
                <div className="bg-dark-800 border border-gray-800 rounded-lg p-4">
                  <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">By feature</h3>
                  <div className="space-y-3">
                    {bySource.map(s => (
                      <div key={s.source}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium text-gray-300 capitalize">{s.source.replace(/-/g, ' ')}</span>
                          <div className="flex items-center gap-3 text-gray-400">
                            <span className="text-gray-500">{s.callCount} call{s.callCount !== 1 ? 's' : ''}</span>
                            <span className="font-mono">{fmt(s.totalTokens)} tok</span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-brand-500/70"
                            style={{ width: `${totalTokens > 0 ? (s.totalTokens / totalTokens * 100) : 0}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Daily bar chart */}
              <div className="bg-dark-800 border border-gray-800 rounded-lg p-4">
                <h3 className="text-xs text-gray-500 uppercase tracking-wider mb-3">
                  Daily usage ({period === '30d' ? '30' : '14'} days)
                </h3>
                <div className="flex items-end gap-1 h-20">
                  {dailyData.map(d => (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5 group" title={`${fmtDate(d.date)}: ${fmt(d.totalTokens)} tokens`}>
                      <div className="w-full flex items-end" style={{ height: 64 }}>
                        <div
                          className="w-full bg-brand-600/60 hover:bg-brand-500 rounded-sm transition-colors"
                          style={{ height: `${d.totalTokens > 0 ? Math.max(2, (d.totalTokens / maxDaily) * 100) : 0}%` }}
                        />
                      </div>
                      {dailyData.length <= 14 && (
                        <span className="text-[8px] text-gray-700 group-hover:text-gray-500 transition-colors truncate w-full text-center">
                          {fmtDate(d.date).split(' ')[1]}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent records */}
              <div className="bg-dark-800 border border-gray-800 rounded-lg overflow-hidden">
                <h3 className="text-xs text-gray-500 uppercase tracking-wider px-4 py-3 border-b border-gray-800">
                  Recent ({filtered.length} record{filtered.length !== 1 ? 's' : ''})
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-600 border-b border-gray-800/60">
                        <th className="text-left px-4 py-2 font-normal">Date</th>
                        <th className="text-left px-4 py-2 font-normal">Provider / Model</th>
                        <th className="text-right px-4 py-2 font-normal">Input</th>
                        <th className="text-right px-4 py-2 font-normal">Output</th>
                        <th className="text-right px-4 py-2 font-normal">Total</th>
                        <th className="text-right px-4 py-2 font-normal">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map(r => {
                        const cost = estimateCost(r.model, r.inputTokens, r.outputTokens);
                        return (
                          <tr key={r.id} className="border-b border-gray-800/40 hover:bg-gray-800/20 transition-colors">
                            <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{fmtTs(r.timestamp)}</td>
                            <td className="px-4 py-2">
                              <span className={`capitalize font-medium ${PROVIDER_TEXT[r.provider] ?? 'text-gray-400'}`}>{r.provider}</span>
                              <span className="text-gray-600 ml-1.5 font-mono text-[10px]">{r.model}</span>
                            </td>
                            <td className="px-4 py-2 text-right text-gray-400 font-mono">{r.inputTokens.toLocaleString()}</td>
                            <td className="px-4 py-2 text-right text-gray-400 font-mono">{r.outputTokens.toLocaleString()}</td>
                            <td className="px-4 py-2 text-right text-white font-mono font-medium">{r.totalTokens.toLocaleString()}</td>
                            <td className="px-4 py-2 text-right text-gray-600 font-mono">
                              {cost > 0 ? fmtCost(cost) : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
