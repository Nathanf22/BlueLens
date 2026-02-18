import React, { useState, useEffect } from 'react';
import { Link2, Trash2, Plus, X } from 'lucide-react';
import { Diagram, NodeLink } from '../types';
import { svgParserService, ParsedNode } from '../services/svgParserService';

interface NodeLinkManagerProps {
  currentDiagram: Diagram;
  allDiagrams: Diagram[];
  onAddLink: (nodeId: string, targetDiagramId: string, label?: string) => void;
  onRemoveLink: (nodeId: string) => void;
  onClose: () => void;
}

export const NodeLinkManager: React.FC<NodeLinkManagerProps> = ({
  currentDiagram,
  allDiagrams,
  onAddLink,
  onRemoveLink,
  onClose
}) => {
  const [availableNodes, setAvailableNodes] = useState<ParsedNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('');
  const [selectedTargetDiagramId, setSelectedTargetDiagramId] = useState<string>('');
  const [customLabel, setCustomLabel] = useState<string>('');

  // Parse nodes from the rendered Mermaid SVG.
  // Uses [] so it re-runs every time the modal mounts (modal unmounts when closed).
  // Retries once after 150ms in case Mermaid hasn't finished rendering yet.
  useEffect(() => {
    const queryNodes = () => {
      const svgContainer = document.querySelector('.mermaid-svg-container');
      const svgElement = svgContainer?.querySelector('svg');
      if (svgElement) {
        const nodes = svgParserService.parseNodes(svgElement as SVGElement);
        if (nodes.length > 0) { setAvailableNodes(nodes); return true; }
      }
      return false;
    };
    if (!queryNodes()) {
      const t = setTimeout(queryNodes, 150);
      return () => clearTimeout(t);
    }
  }, []);

  // Get existing link for selected node
  const existingLink = currentDiagram.nodeLinks?.find(link => link.nodeId === selectedNodeId);

  // Filter out current diagram AND filter by workspace
  const targetDiagrams = allDiagrams.filter(d => 
    d.id !== currentDiagram.id && d.workspaceId === currentDiagram.workspaceId
  );

  const handleAddLink = () => {
    if (!selectedNodeId || !selectedTargetDiagramId) return;
    
    const selectedNode = availableNodes.find(n => n.id === selectedNodeId);
    const label = customLabel.trim() || selectedNode?.label || selectedNodeId;
    
    onAddLink(selectedNodeId, selectedTargetDiagramId, label);
    
    // Reset form
    setSelectedNodeId('');
    setSelectedTargetDiagramId('');
    setCustomLabel('');
  };

  const handleRemoveLink = () => {
    if (!selectedNodeId) return;
    onRemoveLink(selectedNodeId);
    setSelectedNodeId('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-dark-900 border border-gray-700 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Link2 className="w-5 h-5 text-brand-400" />
            <h2 className="text-lg font-semibold text-gray-100">Manage Node Links</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-dark-700 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Current Links Section */}
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-3">Existing Links</h3>
            {currentDiagram.nodeLinks && currentDiagram.nodeLinks.length > 0 ? (
              <div className="space-y-2">
                {currentDiagram.nodeLinks.map((link) => {
                  const targetDiagram = allDiagrams.find(d => d.id === link.targetDiagramId);
                  const node = availableNodes.find(n => n.id === link.nodeId);
                  
                  return (
                    <div
                      key={link.nodeId}
                      className="flex items-center justify-between p-3 bg-dark-800 rounded-lg border border-gray-700"
                    >
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-200">
                          Node: <span className="text-brand-400">{link.label || node?.label || link.nodeId}</span>
                          {link.label && link.label !== link.nodeId && (
                            <span className="text-xs text-gray-500 ml-2">({link.nodeId})</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          → {targetDiagram?.name || 'Unknown Diagram'}
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedNodeId(link.nodeId);
                          handleRemoveLink();
                        }}
                        className="p-2 rounded hover:bg-red-500/10 text-red-400 hover:text-red-300 transition-colors"
                        title="Remove link"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">No links configured yet</p>
            )}
          </div>

          {/* Add New Link Section */}
          <div className="border-t border-gray-700 pt-6">
            <h3 className="text-sm font-medium text-gray-300 mb-3">Add New Link</h3>
            
            <div className="space-y-4">
              {/* Node Selection */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Select Node
                </label>
                {availableNodes.length > 0 ? (
                  <select
                    value={selectedNodeId}
                    onChange={(e) => setSelectedNodeId(e.target.value)}
                    className="w-full px-3 py-2 bg-dark-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-brand-500"
                  >
                    <option value="">-- Choose a node --</option>
                    {availableNodes.map((node) => {
                      // Only show ID in parentheses if it's different from label
                      const displayText = node.label && node.label !== node.id 
                        ? `${node.label} (${node.id})`
                        : node.label || node.id;
                      
                      return (
                        <option key={node.id} value={node.id}>
                          {displayText}
                        </option>
                      );
                    })}
                  </select>
                ) : (
                  <p className="text-sm text-gray-500 italic">
                    No nodes found. Make sure the diagram is rendered.
                  </p>
                )}
              </div>

              {/* Show existing link warning */}
              {existingLink && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <p className="text-sm text-yellow-400">
                    ⚠️ This node already has a link. Adding a new one will replace it.
                  </p>
                </div>
              )}

              {/* Target Diagram Selection */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Target Diagram
                </label>
                <select
                  value={selectedTargetDiagramId}
                  onChange={(e) => setSelectedTargetDiagramId(e.target.value)}
                  className="w-full px-3 py-2 bg-dark-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-brand-500"
                  disabled={!selectedNodeId}
                >
                  <option value="">-- Choose target diagram --</option>
                  {targetDiagrams.map((diagram) => (
                    <option key={diagram.id} value={diagram.id}>
                      {diagram.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Custom Label (Optional) */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Custom Label (Optional)
                </label>
                <input
                  type="text"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="Leave empty to use node label"
                  className="w-full px-3 py-2 bg-dark-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-brand-500"
                  disabled={!selectedNodeId}
                />
              </div>

              {/* Add Button */}
              <button
                onClick={handleAddLink}
                disabled={!selectedNodeId || !selectedTargetDiagramId}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                {existingLink ? 'Update Link' : 'Add Link'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-dark-700 hover:bg-dark-600 text-gray-200 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
