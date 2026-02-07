import { useState, useEffect, useCallback } from 'react';

export const useCodePanelResize = (containerRef: React.RefObject<HTMLDivElement | null>) => {
  const [codePanelWidthPercent, setCodePanelWidthPercent] = useState(30);
  const [isDraggingCodePanel, setIsDraggingCodePanel] = useState(false);

  const handleCodePanelMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingCodePanel(true);
  }, []);

  useEffect(() => {
    if (!isDraggingCodePanel) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      // Width from the right edge
      const fromRight = rect.right - e.clientX;
      const percent = (fromRight / rect.width) * 100;
      setCodePanelWidthPercent(Math.max(15, Math.min(60, percent)));
    };

    const handleMouseUp = () => {
      setIsDraggingCodePanel(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingCodePanel, containerRef]);

  return {
    codePanelWidthPercent,
    isDraggingCodePanel,
    handleCodePanelMouseDown,
  };
};
