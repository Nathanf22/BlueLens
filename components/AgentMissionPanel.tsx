import React, { useEffect, useRef, useState } from 'react';
import { AgentToolEvent, AgentId, ProgressLogEntry, AgentBlackboard } from '../types';
import { Terminal, X, ChevronDown, ChevronUp, Download, Cpu, FlaskConical, Shield, Layers, Loader2 } from 'lucide-react';

interface Props {
  events: AgentToolEvent[];
  isOpen: boolean;
  activeAgents: Set<AgentId>;
  progressEntries: ProgressLogEntry[];
  blackboard: AgentBlackboard;
  onClose: () => void;
  onDownload: (progressEntries: ProgressLogEntry[]) => void;
}

const AGENTS: { id: AgentId; label: string; icon: React.ReactNode; color: string; borderColor: string }[] = [
  { id: 'analyste',   label: 'Analyst',     icon: <Cpu className="w-3.5 h-3.5" />,         color: 'text-violet-400', borderColor: 'border-violet-500/40' },
  { id: 'syntheseur', label: 'Synthesizer',  icon: <FlaskConical className="w-3.5 h-3.5" />, color: 'text-emerald-400', borderColor: 'border-emerald-500/40' },
  { id: 'evaluateur', label: 'Evaluator',    icon: <Shield className="w-3.5 h-3.5" />,       color: 'text-amber-400',   borderColor: 'border-amber-500/40' },
  { id: 'architecte', label: 'Architect',    icon: <Layers className="w-3.5 h-3.5" />,       color: 'text-sky-400',     borderColor: 'border-sky-500/40' },
];

function formatArgs(argsSummary: string): string {
  if (!argsSummary) return '';
  return argsSummary.length > 50 ? argsSummary.slice(0, 50) + '…' : argsSummary;
}

function formatResult(resultSummary: string): string {
  if (!resultSummary) return '(empty)';
  const lines = resultSummary.split('\n');
  const preview = lines.slice(0, 3).join(' ').trim();
  return preview.length > 120 ? preview.slice(0, 120) + '…' : preview;
}

function formatTime(ms: number): string {
  return `+${(ms / 1000).toFixed(1)}s`;
}

function AgentTerminal({
  label,
  icon,
  color,
  borderColor,
  events,
  isActive,
}: {
  agentId: AgentId;
  label: string;
  icon: React.ReactNode;
  color: string;
  borderColor: string;
  events: AgentToolEvent[];
  isActive: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [userScrolled, setUserScrolled] = useState(false);

  useEffect(() => {
    if (!userScrolled && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, userScrolled]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20;
    setUserScrolled(!atBottom);
  };

  return (
    <div className={`flex flex-col min-w-0 flex-1 border ${borderColor} rounded-lg overflow-hidden bg-gray-950`}>
      {/* Header */}
      <div className={`flex items-center gap-1.5 px-2 py-1.5 border-b ${borderColor} bg-gray-900/60`}>
        <span className={color}>{icon}</span>
        <span className={`text-xs font-mono font-semibold ${color}`}>{label}</span>
        {isActive ? (
          <Loader2 className="w-2.5 h-2.5 text-gray-400 animate-spin ml-auto" />
        ) : events.length > 0 ? (
          <span className="ml-auto text-[10px] text-gray-500">{events.length} calls</span>
        ) : (
          <span className="ml-auto text-[10px] text-gray-600">idle</span>
        )}
      </div>

      {/* Terminal body */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-2 space-y-1.5 font-mono text-[10px] min-h-0"
        style={{ maxHeight: '220px' }}
      >
        {events.length === 0 ? (
          <div className="text-gray-700 italic">waiting…</div>
        ) : (
          events.map(ev => {
            if (ev.toolName === '__eval_start__') {
              return (
                <div key={ev.id} className="text-amber-500/70 text-[10px]">
                  ▶ Validation {ev.argsSummary}…
                </div>
              );
            }
            if (ev.toolName === '__eval_result__') {
              return (
                <div key={ev.id} className="space-y-0.5">
                  <div className="text-amber-400">✓ {ev.argsSummary}</div>
                  <div className="pl-2 text-gray-500 whitespace-pre-wrap">{ev.resultSummary.slice(0, 200)}</div>
                </div>
              );
            }
            return (
              <div key={ev.id} className="space-y-0.5">
                <div className="flex items-baseline gap-1">
                  <span className="text-gray-600 shrink-0">{formatTime(ev.elapsedMs)}</span>
                  <span className="text-green-400">$</span>
                  <span className="text-white font-semibold">{ev.toolName}</span>
                  {ev.argsSummary && (
                    <span className="text-gray-400 truncate">{formatArgs(ev.argsSummary)}</span>
                  )}
                  <span className="ml-auto text-gray-600 shrink-0">{ev.durationMs}ms</span>
                </div>
                <div className="pl-4 text-gray-500 leading-snug break-all">
                  ↳ {formatResult(ev.resultSummary)}
                </div>
              </div>
            );
          })
        )}
        {isActive && (
          <div className="flex items-center gap-1 text-gray-600">
            <span className="text-green-400">$</span>
            <span className="animate-pulse">▋</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function AgentMissionPanel({ events, isOpen, activeAgents, progressEntries, blackboard, onClose, onDownload }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  if (!isOpen) return null;

  const analysteCount = events.filter(e => e.agent === 'analyste').length;
  const synthCount = events.filter(e => e.agent === 'syntheseur').length;
  const evalCount = events.filter(e => e.agent === 'evaluateur' && !e.toolName.startsWith('__')).length;
  const totalCalls = events.length;
  const anyActive = activeAgents.size > 0;

  const latestEvent = events[events.length - 1];
  const collapsedSummary = latestEvent
    ? `${latestEvent.agent}: ${latestEvent.toolName}(${formatArgs(latestEvent.argsSummary)})`
    : anyActive ? 'Agents initializing…' : 'Mission complete';

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pointer-events-none px-4 pb-0">
      <div
        className="pointer-events-auto w-full max-w-4xl border border-gray-700/60 rounded-t-xl bg-gray-900/95 backdrop-blur-sm shadow-2xl"
        style={{ fontFamily: 'monospace' }}
      >
        {/* Title bar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700/50">
          <Terminal className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs font-semibold text-gray-300">Mission Control</span>
          {anyActive && <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />}
          <span className="text-[10px] text-gray-600 font-mono">{totalCalls} tool calls</span>

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => onDownload(progressEntries)}
              title="Télécharger les logs"
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded transition-colors"
            >
              <Download className="w-3 h-3" />
              <span>Logs</span>
            </button>
            <button
              onClick={() => setCollapsed(c => !c)}
              className="p-1 text-gray-400 hover:text-white transition-colors"
            >
              {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-red-400 transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Collapsed summary */}
        {collapsed ? (
          <div className="px-3 py-1.5 text-[10px] text-gray-500 font-mono truncate">
            {collapsedSummary}
          </div>
        ) : (
          <>
            {/* 3 terminals */}
            <div className="flex gap-2 p-2" style={{ minHeight: '180px' }}>
              {AGENTS.map(ag => (
                <AgentTerminal
                  key={ag.id}
                  agentId={ag.id}
                  label={ag.label}
                  icon={ag.icon}
                  color={ag.color}
                  borderColor={ag.borderColor}
                  events={events.filter(e => e.agent === ag.id)}
                  isActive={activeAgents.has(ag.id)}
                />
              ))}
            </div>

            {/* Blackboard section */}
            <div className="border-t border-gray-700/50 bg-gray-950/40">
              <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] font-mono">
                <span className="text-gray-500">📋</span>
                {/* Clusters */}
                <span className="text-violet-400">{blackboard.clusters.length} clusters</span>
                {blackboard.clusters.length > 0 && (
                  <span className="text-gray-600 truncate">
                    {blackboard.clusters.map(c => c.name).join(' · ')}
                  </span>
                )}
                {/* Flows */}
                <span className="text-emerald-400 ml-2">{blackboard.flows.length} flows</span>
                {blackboard.flows.length > 0 && (
                  <span className="text-gray-600 truncate">
                    {blackboard.flows.map(f => f.name).join(' · ')}
                  </span>
                )}
                {/* Issues */}
                {(blackboard.clusterIssues.length + blackboard.flowIssues.length) > 0 && (
                  <span className="text-amber-400 ml-auto shrink-0">
                    ⚠ {blackboard.clusterIssues.filter(i => i.severity === 'error').length + blackboard.flowIssues.filter(i => i.severity === 'error').length} errors
                  </span>
                )}
                <span className="text-gray-700 shrink-0 ml-auto">
                  A:{analysteCount} S:{synthCount} E:{evalCount}
                </span>
              </div>
              {/* Flow issues list if any */}
              {blackboard.flowIssues.length > 0 && (
                <div className="px-3 pb-1.5 space-y-0.5 max-h-20 overflow-y-auto">
                  {blackboard.flowIssues.map((issue, i) => (
                    <div key={i} className={`text-[10px] font-mono flex gap-1 ${issue.severity === 'error' ? 'text-red-400' : 'text-amber-400'}`}>
                      <span>{issue.severity === 'error' ? '✗' : '⚠'}</span>
                      <span className="text-gray-400">{issue.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
