import React from 'react';

interface NavigationStep {
  diagramId: string;
  nodeId?: string;
  nodeName?: string;
}

export const useNavigationHandlers = (
  activeId: string,
  setActiveId: React.Dispatch<React.SetStateAction<string>>,
  navigationStack: NavigationStep[],
  setNavigationStack: React.Dispatch<React.SetStateAction<NavigationStep[]>>
) => {

  const handleZoomIn = (targetDiagramId: string, sourceNodeId?: string, sourceNodeName?: string) => {
    setNavigationStack([
      ...navigationStack, 
      {
        diagramId: activeId,
        nodeId: sourceNodeId,
        nodeName: sourceNodeName
      }
    ]);
    setActiveId(targetDiagramId);
  };

  const handleZoomOut = () => {
    if (navigationStack.length > 0) {
      const previousStep = navigationStack[navigationStack.length - 1];
      setNavigationStack(navigationStack.slice(0, -1));
      setActiveId(previousStep.diagramId);
    }
  };

  const handleGoToRoot = () => {
    if (navigationStack.length > 0) {
      setActiveId(navigationStack[0].diagramId);
      setNavigationStack([]);
    }
  };

  const handleBreadcrumbNavigate = (index: number) => {
    if (index === 0 && navigationStack.length > 0) {
      setActiveId(navigationStack[0].diagramId);
      setNavigationStack([]);
    } else if (index < navigationStack.length) {
      const targetStep = navigationStack[index];
      setActiveId(targetStep.diagramId);
      setNavigationStack(navigationStack.slice(0, index));
    }
  };

  const clearNavigationForDiagram = (diagramId: string) => {
    setNavigationStack(prev => prev.filter(step => step.diagramId !== diagramId));
  };

  return {
    handleZoomIn,
    handleZoomOut,
    handleGoToRoot,
    handleBreadcrumbNavigate,
    clearNavigationForDiagram
  };
};
