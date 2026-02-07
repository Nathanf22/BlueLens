import { Diagram, CodeLink } from '../types';

export const useCodeLinkHandlers = (
  activeDiagram: Diagram | undefined,
  updateActiveDiagram: (updates: Partial<Diagram>) => void
) => {
  const handleAddCodeLink = (
    nodeId: string,
    repoId: string,
    filePath: string,
    lineStart?: number,
    lineEnd?: number,
    label?: string
  ) => {
    if (!activeDiagram) return;

    const currentLinks = activeDiagram.codeLinks || [];

    // Remove existing code link for this node if any
    const filteredLinks = currentLinks.filter(link => link.nodeId !== nodeId);

    const newLink: CodeLink = { nodeId, repoId, filePath, lineStart, lineEnd, label };
    updateActiveDiagram({
      codeLinks: [...filteredLinks, newLink],
    });
  };

  const handleRemoveCodeLink = (nodeId: string) => {
    if (!activeDiagram) return;

    const currentLinks = activeDiagram.codeLinks || [];
    updateActiveDiagram({
      codeLinks: currentLinks.filter(link => link.nodeId !== nodeId),
    });
  };

  return {
    handleAddCodeLink,
    handleRemoveCodeLink,
  };
};
