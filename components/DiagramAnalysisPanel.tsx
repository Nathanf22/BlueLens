import React from 'react';
import { X, AlertTriangle, AlertCircle, Info, BarChart3 } from 'lucide-react';
import { DiagramAnalysis, AnalysisFinding } from '../types';

interface DiagramAnalysisPanelProps {
  analysis: DiagramAnalysis | null;
  isOpen: boolean;
  onClose: () => void;
}

const severityIcon = (severity: AnalysisFinding['severity']) => {
  switch (severity) {
    case 'error': return <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />;
    case 'warning': return <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />;
    case 'info': return <Info className="w-4 h-4 text-blue-400 shrink-0" />;
  }
};

const severityBorder = (severity: AnalysisFinding['severity']) => {
  switch (severity) {
    case 'error': return 'border-red-900/40 bg-red-900/10';
    case 'warning': return 'border-yellow-900/40 bg-yellow-900/10';
    case 'info': return 'border-blue-900/40 bg-blue-900/10';
  }
};

export const DiagramAnalysisPanel: React.FC<DiagramAnalysisPanelProps> = ({
  analysis,
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const errors = analysis?.findings.filter(f => f.severity === 'error') || [];
  const warnings = analysis?.findings.filter(f => f.severity === 'warning') || [];
  const infos = analysis?.findings.filter(f => f.severity === 'info') || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-dark-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[75vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-dark-800/50 shrink-0">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-brand-400" />
            <h2 className="font-semibold text-white">Diagram Analysis</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats */}
        {analysis && (
          <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-800 text-xs text-gray-400 shrink-0">
            <span>{analysis.stats.nodeCount} nodes</span>
            <span>{analysis.stats.edgeCount} edges</span>
            <span>{analysis.stats.subgraphCount} subgraphs</span>
            <span className="ml-auto">
              {analysis.findings.length === 0 ? (
                <span className="text-green-400">No issues found</span>
              ) : (
                <span>
                  {errors.length > 0 && <span className="text-red-400">{errors.length} error{errors.length !== 1 ? 's' : ''}</span>}
                  {errors.length > 0 && warnings.length > 0 && ', '}
                  {warnings.length > 0 && <span className="text-yellow-400">{warnings.length} warning{warnings.length !== 1 ? 's' : ''}</span>}
                  {(errors.length > 0 || warnings.length > 0) && infos.length > 0 && ', '}
                  {infos.length > 0 && <span className="text-blue-400">{infos.length} info</span>}
                </span>
              )}
            </span>
          </div>
        )}

        {/* Findings */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0">
          {!analysis && (
            <p className="text-sm text-gray-500 text-center py-8">
              Click "Analyze" to run diagram analysis.
            </p>
          )}

          {analysis && analysis.findings.length === 0 && (
            <div className="text-center py-8">
              <Info className="w-8 h-8 text-green-400 mx-auto mb-2" />
              <p className="text-sm text-green-400">Your diagram looks good! No anti-patterns detected.</p>
            </div>
          )}

          {/* Errors first, then warnings, then info */}
          {[...errors, ...warnings, ...infos].map((finding, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 text-sm rounded-lg border px-3 py-2 ${severityBorder(finding.severity)}`}
            >
              {severityIcon(finding.severity)}
              <div className="flex-1 min-w-0">
                <p className="text-gray-200">{finding.message}</p>
                {finding.nodeIds && finding.nodeIds.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Nodes: {finding.nodeIds.join(', ')}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
