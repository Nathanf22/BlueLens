import { Diagram } from '../types';

export const useNodeLinkHandlers = (
  activeDiagram: Diagram | undefined,
  updateActiveDiagram: (updates: Partial<Diagram>) => void
) => {
  const handleAddNodeLink = (nodeId: string, targetDiagramId: string, label?: string) => {
    if (!activeDiagram) return;
    
    const currentLinks = activeDiagram.nodeLinks || [];
    
    // Remove existing link for this node if any
    const filteredLinks = currentLinks.filter(link => link.nodeId !== nodeId);
    
    // Add new link
    updateActiveDiagram({
      nodeLinks: [...filteredLinks, { nodeId, targetDiagramId, label }]
    });
  };

  const handleRemoveNodeLink = (nodeId: string) => {
    if (!activeDiagram) return;
    
    const currentLinks = activeDiagram.nodeLinks || [];
    updateActiveDiagram({
      nodeLinks: currentLinks.filter(link => link.nodeId !== nodeId)
    });
  };

  return {
    handleAddNodeLink,
    handleRemoveNodeLink
  };
};
