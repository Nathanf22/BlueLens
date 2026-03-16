import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AgentToolEvent, AgentId, ProgressLogEntry, AgentBlackboard } from '../types';
import { Terminal, X, ChevronDown, ChevronUp, Download, Cpu, FlaskConical, Shield, Layers, Loader2, Info, GripHorizontal } from 'lucide-react';

interface Props {
  events: AgentToolEvent[];
  isOpen: boolean;
  activeAgents: Set<AgentId>;
  progressEntries: ProgressLogEntry[];
  blackboard: AgentBlackboard;
  onClose: () => void;
  onDownload: (progressEntries: ProgressLogEntry[]) => void;
}

interface AgentInfo {
  role: string;
  philosophy: string;
  tools: string[];
  failureModes: string[];
}

const AGENT_INFO: Record<AgentId, AgentInfo> = {
  analyste: {
    role: 'Semantic clustering — groups files into meaningful domain clusters based on import graphs and coupling metrics.',
    philosophy: 'Structural inference. Reasons from import graphs and symbol counts, not business logic. Gives a stable, objective foundation — but cannot understand what a file does, only what it depends on.',
    tools: ['list_files_by_coupling', 'get_file_info'],
    failureModes: [
      'Groups files by location (public/) rather than domain',
      'Treats infrastructure files (db, config) as peer domains',
    ],
  },
  syntheseur: {
    role: 'Runtime flow generation — traces user journeys across the codebase end-to-end.',
    philosophy: 'Synthesis under uncertainty. Fills gaps with plausible inferences. Must connect cross-process boundaries (e.g. client fetch → server route) that are not explicit in the import graph — which is where hallucination risk is highest.',
    tools: ['find_entry_points', 'read_file', 'get_node_relations', 'get_cluster_files'],
    failureModes: [
      "Hallucinated method calls (e.g. db.findById() that doesn't exist)",
      'Missing important flows — fixed by completeness check in Evaluator',
      'Wrong scopeNodeId — fixed by validateAndBuildFlows',
    ],
  },
  evaluateur: {
    role: 'Adversarial verification — reads actual source code to falsify generated output. Also checks completeness of flow coverage.',
    philosophy: "Falsification. Does not build a model — it tests one. Its only tool is read_file, forcing every judgment to be grounded in actual source. Cannot hallucinate a connection; can only report one it found or didn't find.",
    tools: ['read_file'],
    failureModes: [
      'Cannot catch errors of omission it never read about',
      'Cannot detect internally consistent errors (correct code, wrong architecture)',
      'May render a verdict without reading the relevant file (LLM shortcut)',
    ],
  },
  architecte: {
    role: 'Architecture diagram generation — produces Mermaid graphs showing module structure at cluster and file level.',
    philosophy: 'Structural synthesis with code grounding. Reads actual code to write meaningful node descriptions and edge labels. Risk is the same as the Synthesizer: interpretation can diverge from reality, but there is no retry round because architecture errors are subjective.',
    tools: ['find_entry_points', 'read_file', 'get_node_relations', 'get_cluster_files'],
    failureModes: [
      'Misattributed cluster responsibilities',
      'Missing cross-cluster dependencies in the overview',
    ],
  },
};

const AGENTS: { id: AgentId; label: string; icon: React.ReactNode; color: string; borderColor: string; glowColor: string; bgHover: string }[] = [
  { id: 'analyste',   label: 'Analyst',     icon: <Cpu className="w-3.5 h-3.5" />,         color: 'text-violet-400', borderColor: 'border-violet-500/40', glowColor: '139, 92, 246',  bgHover: 'hover:bg-violet-500/10' },
  { id: 'syntheseur', label: 'Synthesizer',  icon: <FlaskConical className="w-3.5 h-3.5" />, color: 'text-emerald-400', borderColor: 'border-emerald-500/40', glowColor: '52, 211, 153', bgHover: 'hover:bg-emerald-500/10' },
  { id: 'evaluateur', label: 'Evaluator',    icon: <Shield className="w-3.5 h-3.5" />,       color: 'text-amber-400',   borderColor: 'border-amber-500/40', glowColor: '251, 191, 36',  bgHover: 'hover:bg-amber-500/10' },
  { id: 'architecte', label: 'Architect',    icon: <Layers className="w-3.5 h-3.5" />,       color: 'text-sky-400',     borderColor: 'border-sky-500/40', glowColor: '56, 189, 248',   bgHover: 'hover:bg-sky-500/10' },
];

// ─── Tool call descriptions ──────────────────────────────────────────────────

function describeToolCall(toolName: string, argsSummary: string): string {
  const arg = argsSummary?.trim() ?? '';
  switch (toolName) {
    case 'read_file':
      return arg ? `Reading ${arg}` : 'Reading file…';
    case 'list_files_by_coupling':
      return 'Scanning file coupling graph…';
    case 'get_file_info':
      return arg ? `Fetching metadata for ${arg}` : 'Fetching file metadata…';
    case 'find_entry_points':
      return 'Discovering application entry points…';
    case 'get_node_relations':
      return arg ? `Mapping dependencies of ${arg}` : 'Mapping node dependencies…';
    case 'get_cluster_files':
      return arg ? `Loading files in cluster "${arg}"` : 'Loading cluster files…';
    default:
      return '';
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

// ─── AgentTerminal ────────────────────────────────────────────────────────────

function AgentTerminal({
  label,
  icon,
  color,
  borderColor,
  glowColor,
  bgHover,
  events,
  isActive,
  onInfoClick,
}: {
  agentId: AgentId;
  label: string;
  icon: React.ReactNode;
  color: string;
  borderColor: string;
  glowColor: string;
  bgHover: string;
  events: AgentToolEvent[];
  isActive: boolean;
  onInfoClick: () => void;
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
    <div
      className={`flex flex-col min-w-0 flex-1 border ${borderColor} rounded-lg overflow-hidden bg-gray-950 ${isActive ? 'terminal-active' : ''}`}
      style={{ '--glow': glowColor } as React.CSSProperties}
    >
      {/* Header — clickable for agent detail */}
      <button
        onClick={onInfoClick}
        className={`flex items-center gap-1.5 px-2 py-1.5 border-b ${borderColor} bg-gray-900/60 ${bgHover} transition-colors w-full text-left group`}
        title="View agent details"
      >
        <span className={color}>{icon}</span>
        <span className={`text-xs font-mono font-semibold ${color}`}>{label}</span>
        <Info className="w-2.5 h-2.5 text-gray-700 group-hover:text-gray-400 transition-colors ml-0.5" />
        {isActive ? (
          <Loader2 className="w-2.5 h-2.5 text-gray-400 animate-spin ml-auto" />
        ) : events.length > 0 ? (
          <span className="ml-auto text-[10px] text-gray-500">{events.length} calls</span>
        ) : (
          <span className="ml-auto text-[10px] text-gray-600">idle</span>
        )}
      </button>

      {/* Terminal body */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-2 space-y-1.5 font-mono text-[10px] min-h-0"
      >
        {events.length === 0 ? (
          <div className="text-gray-700 italic">waiting…</div>
        ) : (
          events.map(ev => {
            if (ev.toolName === '__eval_start__') {
              return (
                <div key={ev.id} className="text-amber-500/70 text-[10px] agent-line">
                  ▶ Validation {ev.argsSummary}…
                </div>
              );
            }
            if (ev.toolName === '__eval_result__') {
              return (
                <div key={ev.id} className="space-y-0.5 agent-line">
                  <div className="text-amber-400">✓ {ev.argsSummary}</div>
                  <div className="pl-2 text-gray-500 whitespace-pre-wrap">{ev.resultSummary.slice(0, 200)}</div>
                </div>
              );
            }
            const desc = describeToolCall(ev.toolName, ev.argsSummary);
            return (
              <div key={ev.id} className="space-y-0.5 agent-line">
                <div className="flex items-baseline gap-1">
                  <span className="text-gray-600 shrink-0">{formatTime(ev.elapsedMs)}</span>
                  <span className="text-green-400">$</span>
                  <span className="text-white font-semibold">{ev.toolName}</span>
                  {ev.argsSummary && (
                    <span className="text-gray-500 truncate">{formatArgs(ev.argsSummary)}</span>
                  )}
                  <span className="ml-auto text-gray-600 shrink-0">{ev.durationMs}ms</span>
                </div>
                {desc && (
                  <div className="pl-4 text-gray-400 leading-snug">{desc}</div>
                )}
                <div className="pl-4 text-gray-600 leading-snug break-all">
                  ↳ {formatResult(ev.resultSummary)}
                </div>
              </div>
            );
          })
        )}
        {isActive && (
          <div className="flex items-center gap-1 text-gray-600 agent-line">
            <span className="text-green-400">$</span>
            <span className="animate-pulse">▋</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Agent detail modal (portal) ─────────────────────────────────────────────

function AgentDetailModal({ agentId, onClose }: { agentId: AgentId; onClose: () => void }) {
  const ag = AGENTS.find(a => a.id === agentId)!;
  const info = AGENT_INFO[agentId];
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-gray-700 shadow-2xl flex flex-col overflow-hidden"
        style={{ background: '#0d1117', maxHeight: '80vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className={`flex items-center gap-2.5 px-5 py-3.5 border-b ${ag.borderColor}`}>
          <span className={`${ag.color} scale-125`}>{ag.icon}</span>
          <span className={`text-sm font-mono font-bold ${ag.color}`}>{ag.label}</span>
          <button onClick={onClose} className="ml-auto p-1 text-gray-500 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5 font-mono">
          <section>
            <div className="text-gray-500 uppercase tracking-widest text-[10px] mb-2">Role</div>
            <p className="text-gray-200 text-sm leading-relaxed">{info.role}</p>
          </section>
          <section>
            <div className="text-gray-500 uppercase tracking-widest text-[10px] mb-2">Philosophy</div>
            <p className="text-gray-400 text-sm leading-relaxed italic">{info.philosophy}</p>
          </section>
          <section>
            <div className="text-gray-500 uppercase tracking-widest text-[10px] mb-2">Tools</div>
            <div className="flex flex-wrap gap-2">
              {info.tools.map(t => (
                <span key={t} className={`px-2.5 py-1 rounded-md text-xs border ${ag.borderColor} ${ag.color}`} style={{ background: '#161b22' }}>
                  {t}
                </span>
              ))}
            </div>
          </section>
          <section>
            <div className="text-gray-500 uppercase tracking-widest text-[10px] mb-2">Failure modes</div>
            <ul className="space-y-1.5">
              {info.failureModes.map((f, i) => (
                <li key={i} className="flex gap-2 text-gray-400 text-sm">
                  <span className="text-amber-500 shrink-0 mt-0.5">⚠</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

const MIN_HEIGHT = 220;
const MAX_HEIGHT = 700;
const DEFAULT_HEIGHT = 320;

const PANEL_STYLES = `
  @keyframes agentLineFadeIn {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes terminalGlow {
    0%, 100% { box-shadow: 0 0 0 1px rgba(var(--glow), 0.4), 0 0 10px rgba(var(--glow), 0.1); }
    50%       { box-shadow: 0 0 0 1px rgba(var(--glow), 0.8), 0 0 22px rgba(var(--glow), 0.35); }
  }
  .agent-line {
    animation: agentLineFadeIn 0.35s cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  .terminal-active {
    animation: terminalGlow 1.8s ease-in-out infinite;
  }
`;

export function AgentMissionPanel({ events, isOpen, activeAgents, progressEntries, blackboard, onClose, onDownload }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentId | null>(null);
  const [panelHeight, setPanelHeight] = useState(DEFAULT_HEIGHT);
  const dragStartY = useRef<number | null>(null);
  const dragStartHeight = useRef<number>(DEFAULT_HEIGHT);

  useEffect(() => {
    const el = document.createElement('style');
    el.id = 'mission-control-styles';
    el.textContent = PANEL_STYLES;
    if (!document.getElementById('mission-control-styles')) {
      document.head.appendChild(el);
    }
    return () => { document.getElementById('mission-control-styles')?.remove(); };
  }, []);

  const onDragStart = useCallback((e: React.MouseEvent) => {
    dragStartY.current = e.clientY;
    dragStartHeight.current = panelHeight;
    e.preventDefault();
  }, [panelHeight]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (dragStartY.current === null) return;
      const delta = dragStartY.current - e.clientY;
      const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, dragStartHeight.current + delta));
      setPanelHeight(next);
    };
    const onMouseUp = () => { dragStartY.current = null; };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

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

  // Terminal body height = total panel height minus fixed chrome (title + blackboard)
  const terminalHeight = collapsed ? 0 : panelHeight - 80;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pointer-events-none px-4 pb-0">
        <div
          className="pointer-events-auto w-full max-w-5xl border border-gray-700/60 rounded-t-xl bg-gray-900/95 backdrop-blur-sm shadow-2xl flex flex-col"
          style={{ fontFamily: 'monospace' }}
        >
          {/* Drag handle */}
          <div
            onMouseDown={onDragStart}
            className="flex items-center justify-center h-3 cursor-ns-resize group"
            title="Drag to resize"
          >
            <GripHorizontal className="w-4 h-3 text-gray-700 group-hover:text-gray-500 transition-colors" />
          </div>

          {/* Title bar */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-700/50">
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
              {selectedAgent && (
                <AgentDetailModal agentId={selectedAgent} onClose={() => setSelectedAgent(null)} />
              )}

              {/* Terminals */}
              <div className="flex gap-2 p-2 min-h-0" style={{ height: terminalHeight }}>
                {AGENTS.map(ag => (
                  <AgentTerminal
                    key={ag.id}
                    agentId={ag.id}
                    label={ag.label}
                    icon={ag.icon}
                    color={ag.color}
                    borderColor={ag.borderColor}
                    glowColor={ag.glowColor}
                    bgHover={ag.bgHover}
                    events={events.filter(e => e.agent === ag.id)}
                    isActive={activeAgents.has(ag.id)}
                    onInfoClick={() => setSelectedAgent(prev => prev === ag.id ? null : ag.id)}
                  />
                ))}
              </div>

              {/* Blackboard */}
              <div className="border-t border-gray-700/50 bg-gray-950/40 shrink-0">
                <div className="flex items-center gap-3 px-3 py-1.5 text-[10px] font-mono">
                  <span className="text-gray-500">📋</span>
                  <span className="text-violet-400">{blackboard.clusters.length} clusters</span>
                  {blackboard.clusters.length > 0 && (
                    <span className="text-gray-600 truncate">
                      {blackboard.clusters.map(c => c.name).join(' · ')}
                    </span>
                  )}
                  <span className="text-emerald-400 ml-2">{blackboard.flows.length} flows</span>
                  {blackboard.flows.length > 0 && (
                    <span className="text-gray-600 truncate">
                      {blackboard.flows.map(f => f.name).join(' · ')}
                    </span>
                  )}
                  {(blackboard.clusterIssues.length + blackboard.flowIssues.length + blackboard.archIssues.length) > 0 && (
                    <span className="text-amber-400 ml-auto shrink-0">
                      ⚠ {blackboard.clusterIssues.filter(i => i.severity === 'error').length + blackboard.flowIssues.filter(i => i.severity === 'error').length + blackboard.archIssues.filter(i => i.severity === 'error').length} errors
                    </span>
                  )}
                  <span className="text-gray-700 shrink-0 ml-auto">
                    A:{analysteCount} S:{synthCount} E:{evalCount}
                  </span>
                </div>
                {(blackboard.flowIssues.length > 0 || blackboard.archIssues.length > 0) && (
                  <div className="px-3 pb-1.5 space-y-0.5 max-h-20 overflow-y-auto">
                    {blackboard.flowIssues.map((issue, i) => (
                      <div key={`f${i}`} className={`text-[10px] font-mono flex gap-1 ${issue.severity === 'error' ? 'text-red-400' : 'text-amber-400'}`}>
                        <span>{issue.severity === 'error' ? '✗' : '⚠'}</span>
                        <span className="text-gray-400">{issue.message}</span>
                      </div>
                    ))}
                    {blackboard.archIssues.map((issue, i) => (
                      <div key={`a${i}`} className={`text-[10px] font-mono flex gap-1 ${issue.severity === 'error' ? 'text-red-400' : 'text-amber-400'}`}>
                        <span className="text-sky-500">[arch]</span>
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
