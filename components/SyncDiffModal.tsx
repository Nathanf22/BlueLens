import React, { useState } from 'react';
import { GitBranch, Plus, Minus, Check, X, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import { SyncProposal, Diagram, DiagramDiff } from '../types';
import { InlineDiagramPreview } from './InlineDiagramPreview';

interface SyncDiffModalProps {
  proposals: SyncProposal[];
  diagrams: Diagram[];
  onApply: (proposalId: string, selectedDiagramIds: string[]) => void;
  onDismiss: (proposalId: string) => void;
  onClose: () => void;
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Line diff (LCS-based)
// ---------------------------------------------------------------------------

type DiffLine = { type: 'added' | 'removed' | 'unchanged'; text: string };

function computeLineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');

  // Build LCS table
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);

  // Backtrack
  const result: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      result.unshift({ type: 'unchanged', text: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', text: b[j - 1] });
      j--;
    } else {
      result.unshift({ type: 'removed', text: a[i - 1] });
      i--;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Human-readable change summary derived from line diff
// ---------------------------------------------------------------------------

function summarizeLineDiff(lines: DiffLine[]): { added: string[]; removed: string[] } {
  const added: string[] = [];
  const removed: string[] = [];
  for (const l of lines) {
    const text = l.text.trim();
    if (!text) continue;
    if (l.type === 'added') added.push(text);
    else if (l.type === 'removed') removed.push(text);
  }
  return { added, removed };
}

// ---------------------------------------------------------------------------
// Code diff view
// ---------------------------------------------------------------------------

const CodeDiff: React.FC<{ lines: DiffLine[] }> = ({ lines }) => {
  const hasChanges = lines.some(l => l.type !== 'unchanged');
  if (!hasChanges) return null;

  return (
    <div className="rounded-lg border border-gray-700 overflow-hidden">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 px-3 py-1.5 bg-dark-800 border-b border-gray-700">
        Code diff
      </p>
      <div className="overflow-x-auto bg-dark-950 font-mono text-xs leading-5 max-h-64 overflow-y-auto">
        {lines.map((line, i) => {
          if (line.type === 'unchanged') {
            return (
              <div key={i} className="flex text-gray-600 hover:bg-dark-800/40">
                <span className="w-6 shrink-0 text-center select-none opacity-40"> </span>
                <span className="px-2 whitespace-pre">{line.text || ' '}</span>
              </div>
            );
          }
          if (line.type === 'added') {
            return (
              <div key={i} className="flex bg-green-950/40 text-green-300">
                <span className="w-6 shrink-0 text-center select-none text-green-500">+</span>
                <span className="px-2 whitespace-pre">{line.text || ' '}</span>
              </div>
            );
          }
          return (
            <div key={i} className="flex bg-red-950/40 text-red-300">
              <span className="w-6 shrink-0 text-center select-none text-red-500">−</span>
              <span className="px-2 whitespace-pre">{line.text || ' '}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// DiagramDiffRow
// ---------------------------------------------------------------------------

const DiagramDiffRow: React.FC<{
  diff: DiagramDiff;
  isSelected: boolean;
  onToggle: () => void;
}> = ({ diff, isSelected, onToggle }) => {
  const [expanded, setExpanded] = useState(true);
  const [showVisual, setShowVisual] = useState(true);

  const lineDiff = computeLineDiff(diff.currentCode, diff.proposedCode);
  const { added: addedLines, removed: removedLines } = summarizeLineDiff(lineDiff);
  const hasChanges = addedLines.length > 0 || removedLines.length > 0;

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-dark-800 cursor-pointer hover:bg-dark-700 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={e => { e.stopPropagation(); onToggle(); }}
          className="w-3.5 h-3.5 rounded border-gray-600 bg-dark-700 text-brand-500 focus:ring-brand-500"
        />
        <span className="text-sm font-medium text-gray-200 truncate flex-1" title={diff.diagramName}>
          {diff.diagramName}
        </span>

        {/* Change summary badges */}
        <div className="flex items-center gap-2 text-xs shrink-0">
          {diff.addedNodes.length > 0 && (
            <span className="flex items-center gap-0.5 text-green-400">
              <Plus className="w-3 h-3" />{diff.addedNodes.length} nodes
            </span>
          )}
          {diff.removedNodes.length > 0 && (
            <span className="flex items-center gap-0.5 text-red-400">
              <Minus className="w-3 h-3" />{diff.removedNodes.length} nodes
            </span>
          )}
          {diff.addedEdges.length > 0 && (
            <span className="flex items-center gap-0.5 text-green-400">
              <Plus className="w-3 h-3" />{diff.addedEdges.length} steps
            </span>
          )}
          {diff.removedEdges.length > 0 && (
            <span className="flex items-center gap-0.5 text-red-400">
              <Minus className="w-3 h-3" />{diff.removedEdges.length} steps
            </span>
          )}
          {diff.brokenNodeLinkIds && diff.brokenNodeLinkIds.length > 0 && (
            <span className="flex items-center gap-0.5 text-amber-400" title={`Node links broken: ${diff.brokenNodeLinkIds.join(', ')}`}>
              ⚠ {diff.brokenNodeLinkIds.length} link{diff.brokenNodeLinkIds.length > 1 ? 's' : ''} broken
            </span>
          )}
          {!hasChanges && <span className="text-gray-500 text-xs">No changes</span>}
        </div>

        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500 shrink-0" />}
      </div>

      {/* Always-visible change summary */}
      {hasChanges && (
        <div className="px-3 py-2 bg-dark-900 border-t border-gray-800 space-y-0.5">
          {removedLines.map((line, i) => (
            <div key={`r${i}`} className="flex items-start gap-1.5 text-xs text-red-400">
              <Minus className="w-3 h-3 shrink-0 mt-0.5" />
              <span className="font-mono truncate" title={line}>{line}</span>
            </div>
          ))}
          {addedLines.map((line, i) => (
            <div key={`a${i}`} className="flex items-start gap-1.5 text-xs text-green-400">
              <Plus className="w-3 h-3 shrink-0 mt-0.5" />
              <span className="font-mono truncate" title={line}>{line}</span>
            </div>
          ))}
        </div>
      )}

      {/* Expanded: agent explanation + visual diff + code diff */}
      {expanded && (
        <div className="border-t border-gray-700 bg-dark-900 p-4 space-y-3">
          {/* Agent explanation */}
          {diff.explanation && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-brand-900/30 border border-brand-700/40">
              <MessageSquare className="w-3.5 h-3.5 text-brand-400 shrink-0 mt-0.5" />
              <p className="text-xs text-brand-200 leading-relaxed">{diff.explanation}</p>
            </div>
          )}

          {/* Visual before/after */}
          <div>
            <button
              onClick={() => setShowVisual(v => !v)}
              className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
            >
              {showVisual ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Visual diff
            </button>
            {showVisual && (
              <div className="grid grid-cols-2 gap-4 mt-2 min-h-[260px]">
                <div className="flex flex-col">
                  <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1.5">Before</p>
                  <div className="flex-1"><InlineDiagramPreview code={diff.currentCode} /></div>
                </div>
                <div className="flex flex-col">
                  <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1.5">After</p>
                  <div className="flex-1"><InlineDiagramPreview code={diff.annotatedCode} /></div>
                </div>
              </div>
            )}
          </div>

          <CodeDiff lines={lineDiff} />
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// ProposalCard
// ---------------------------------------------------------------------------

const ProposalCard: React.FC<{
  proposal: SyncProposal;
  diagrams: Diagram[];
  onApply: (selectedIds: string[]) => void;
  onDismiss: () => void;
}> = ({ proposal, diagrams: _diagrams, onApply, onDismiss }) => {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(proposal.diagramDiffs.map(d => d.diagramId))
  );

  const toggleDiagram = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const { graphDiff } = proposal;
  const totalAdded = graphDiff.addedNodes.length;
  const totalRemoved = graphDiff.removedNodes.length;
  const totalModified = graphDiff.modifiedNodes.length;

  return (
    <div className="border border-gray-700 rounded-xl overflow-hidden">
      {/* Card header */}
      <div className="px-4 py-3 bg-dark-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-brand-400 shrink-0" />
          <span className="text-sm font-semibold text-gray-200">
            Sync proposal &mdash; {proposal.diagramDiffs.length} diagram{proposal.diagramDiffs.length !== 1 ? 's' : ''} affected
          </span>
          <span className="ml-auto text-xs text-gray-500">{formatTimestamp(proposal.createdAt)}</span>
        </div>

        {/* Code changes that triggered this */}
        <div className="flex flex-wrap gap-3 mt-2 text-xs">
          {totalAdded > 0 && (
            <span className="flex items-center gap-1 text-green-400">
              <Plus className="w-3 h-3" />{totalAdded} symbol{totalAdded !== 1 ? 's' : ''} added
            </span>
          )}
          {totalRemoved > 0 && (
            <span className="flex items-center gap-1 text-red-400">
              <Minus className="w-3 h-3" />{totalRemoved} symbol{totalRemoved !== 1 ? 's' : ''} removed
            </span>
          )}
          {totalModified > 0 && (
            <span className="flex items-center gap-1 text-yellow-400">
              {totalModified} symbol{totalModified !== 1 ? 's' : ''} modified
            </span>
          )}
          {totalAdded === 0 && totalRemoved === 0 && totalModified === 0 && (
            <span className="text-gray-500">No code symbol changes</span>
          )}
        </div>
      </div>

      {/* Diagram diffs list */}
      <div className="px-4 py-3 space-y-2">
        {proposal.diagramDiffs.map(diff => (
          <DiagramDiffRow
            key={diff.diagramId}
            diff={diff}
            isSelected={selected.has(diff.diagramId)}
            onToggle={() => toggleDiagram(diff.diagramId)}
          />
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-700 bg-dark-800">
        <button
          onClick={onDismiss}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-gray-200 hover:bg-dark-700 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Ignore
        </button>
        <button
          onClick={() => onApply([...selected])}
          disabled={selected.size === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-brand-600 text-white hover:bg-brand-500 transition-colors disabled:opacity-40 disabled:hover:bg-brand-600"
        >
          <Check className="w-3.5 h-3.5" />
          Apply Selected ({selected.size})
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export const SyncDiffModal: React.FC<SyncDiffModalProps> = ({
  proposals,
  diagrams,
  onApply,
  onDismiss,
  onClose,
}) => {
  if (proposals.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl bg-dark-900 border border-gray-700 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-brand-400" />
            <h2 className="text-base font-semibold text-gray-100">Sync Proposals</h2>
            <span className="ml-1 px-2 py-0.5 rounded-full bg-brand-900/50 text-brand-300 text-xs font-medium">
              {proposals.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-dark-700 text-gray-500 hover:text-gray-300 transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {proposals.map(proposal => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              diagrams={diagrams}
              onApply={(selectedIds) => onApply(proposal.id, selectedIds)}
              onDismiss={() => onDismiss(proposal.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
