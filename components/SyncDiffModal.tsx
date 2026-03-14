import React, { useState } from 'react';
import { GitBranch, Plus, Minus, Check, X, ChevronDown, ChevronRight } from 'lucide-react';
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

const DiagramDiffRow: React.FC<{
  diff: DiagramDiff;
  isSelected: boolean;
  onToggle: () => void;
}> = ({ diff, isSelected, onToggle }) => {
  const [expanded, setExpanded] = useState(false);

  const hasChanges =
    diff.addedNodes.length > 0 ||
    diff.removedNodes.length > 0 ||
    diff.addedEdges.length > 0 ||
    diff.removedEdges.length > 0;

  return (
    <div className="border border-gray-700 rounded-lg overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2 bg-dark-800">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggle}
          className="w-3.5 h-3.5 rounded border-gray-600 bg-dark-700 text-brand-500 focus:ring-brand-500"
        />
        <span className="text-sm font-medium text-gray-200 truncate flex-1" title={diff.diagramName}>
          {diff.diagramName}
        </span>

        {/* Change summary */}
        <div className="flex items-center gap-2 text-xs shrink-0">
          {diff.addedNodes.length > 0 && (
            <span className="flex items-center gap-0.5 text-green-400">
              <Plus className="w-3 h-3" />
              {diff.addedNodes.length} nodes
            </span>
          )}
          {diff.removedNodes.length > 0 && (
            <span className="flex items-center gap-0.5 text-red-400">
              <Minus className="w-3 h-3" />
              {diff.removedNodes.length} nodes
            </span>
          )}
          {diff.addedEdges.length > 0 && (
            <span className="flex items-center gap-0.5 text-green-400">
              <Plus className="w-3 h-3" />
              {diff.addedEdges.length} edges
            </span>
          )}
          {diff.removedEdges.length > 0 && (
            <span className="flex items-center gap-0.5 text-red-400">
              <Minus className="w-3 h-3" />
              {diff.removedEdges.length} edges
            </span>
          )}
          {diff.brokenNodeLinkIds && diff.brokenNodeLinkIds.length > 0 && (
            <span className="flex items-center gap-0.5 text-amber-400" title={`Node links broken: ${diff.brokenNodeLinkIds.join(', ')}`}>
              ⚠ {diff.brokenNodeLinkIds.length} link{diff.brokenNodeLinkIds.length > 1 ? 's' : ''} broken
            </span>
          )}
          {!hasChanges && (
            <span className="text-gray-500 text-xs">No changes</span>
          )}
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="p-0.5 rounded hover:bg-dark-700 text-gray-500 hover:text-gray-300 transition-colors"
          title={expanded ? 'Collapse' : 'Expand code preview'}
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Expanded visual diff */}
      {expanded && (
        <div className="border-t border-gray-700 bg-dark-900 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-4 min-h-[300px]">
            <div className="flex flex-col">
              <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1.5">Before</p>
              <div className="flex-1">
                <InlineDiagramPreview code={diff.currentCode} />
              </div>
            </div>
            <div className="flex flex-col">
              <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1.5">
                After
                {diff.addedNodes.length > 0 && <span className="ml-2 text-green-400">+{diff.addedNodes.length}</span>}
                {diff.removedNodes.length > 0 && <span className="ml-1 text-red-400">-{diff.removedNodes.length}</span>}
              </p>
              <div className="flex-1">
                <InlineDiagramPreview code={diff.annotatedCode} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

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
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
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

        {/* Graph diff summary */}
        <div className="flex flex-wrap gap-3 mt-2 text-xs">
          {totalAdded > 0 && (
            <span className="flex items-center gap-1 text-green-400">
              <Plus className="w-3 h-3" />
              {totalAdded} node{totalAdded !== 1 ? 's' : ''} added
            </span>
          )}
          {totalRemoved > 0 && (
            <span className="flex items-center gap-1 text-red-400">
              <Minus className="w-3 h-3" />
              {totalRemoved} node{totalRemoved !== 1 ? 's' : ''} removed
            </span>
          )}
          {totalModified > 0 && (
            <span className="flex items-center gap-1 text-yellow-400">
              {totalModified} node{totalModified !== 1 ? 's' : ''} modified
            </span>
          )}
          {totalAdded === 0 && totalRemoved === 0 && totalModified === 0 && (
            <span className="text-gray-500">No graph node changes</span>
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
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl bg-dark-900 border border-gray-700 shadow-2xl overflow-hidden">
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
