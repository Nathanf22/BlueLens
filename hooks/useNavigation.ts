import React, { useState, useCallback, useEffect, useRef } from 'react';
import { ViewSettings } from '../types';

export const useNavigation = (
  svgContent: string
) => {
  const [viewSettings, setViewSettings] = useState<ViewSettings>({ 
    zoom: 1, 
    pan: { x: 0, y: 0 } 
  });
  const [isDragging, setIsDragging] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [containerNode, setContainerNode] = useState<HTMLDivElement | null>(null);

  // Callback ref to capture the DOM node reliably
  const containerRef = useCallback((node: HTMLDivElement | null) => {
    setContainerNode(node);
  }, []);

  const handleZoom = useCallback((delta: number) => {
    setViewSettings(prev => ({
      ...prev,
      zoom: Math.max(0.1, Math.min(5, prev.zoom + delta))
    }));
  }, []);

  const handleReset = useCallback(() => {
    setViewSettings({ zoom: 1, pan: { x: 0, y: 0 } });
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent, isCommentMode: boolean) => {
    if (isCommentMode) return;
    if (e.target instanceof Element && e.target.closest('.comment-marker')) return;

    setIsDragging(true);
    setStartPan({ 
      x: e.clientX - viewSettings.pan.x, 
      y: e.clientY - viewSettings.pan.y 
    });
  }, [viewSettings.pan.x, viewSettings.pan.y]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setViewSettings(prev => ({
      ...prev,
      pan: {
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y
      }
    }));
  }, [isDragging, startPan]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Refs to access latest state in event listener without re-binding
  const viewSettingsRef = useRef(viewSettings);
  const svgContentRef = useRef(svgContent);

  useEffect(() => {
    viewSettingsRef.current = viewSettings;
  }, [viewSettings]);

  useEffect(() => {
    svgContentRef.current = svgContent;
  }, [svgContent]);

  // Effect to attach non-passive wheel listener
  useEffect(() => {
    if (!containerNode) return;

    const handleWheelNative = (e: WheelEvent) => {
      // ctrlKey (Windows/Linux) or metaKey (Mac)
      // We also add altKey as a fallback if the OS captures Ctrl (common on Linux)
      const isZoom = e.ctrlKey || e.metaKey || e.altKey;
      const isHorizontalPan = e.shiftKey;
      const currentSvgContent = svgContentRef.current;
      
      // If no SVG, we might not want to intercept, but usually we do to prevent ghost scrolling
      if (!currentSvgContent) return;

      if (isZoom) {
        e.preventDefault();
        
        // Use consistent direction: negative deltaY (scrolling up) means Zoom IN
        const delta = -e.deltaY;
        const zoomStep = 0.1;
        // Cap the single-event change to avoid super fast zooming with momentum scrolling
        const factor = delta > 0 ? zoomStep : -zoomStep;
        
        setViewSettings(prev => {
          const newZoom = Math.max(0.1, Math.min(5, prev.zoom + factor));
          if (newZoom === prev.zoom) return prev;

          const rect = containerNode.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;

          return {
            zoom: newZoom,
            pan: {
              x: mouseX - (mouseX - prev.pan.x) * (newZoom / prev.zoom),
              y: mouseY - (mouseY - prev.pan.y) * (newZoom / prev.zoom)
            }
          };
        });
      } else if (isHorizontalPan) {
        e.preventDefault();
        setViewSettings(prev => ({
          ...prev,
          pan: { ...prev.pan, x: prev.pan.x - e.deltaY }
        }));
      } else {
        // Vertical pan
        if (currentSvgContent) e.preventDefault();
        setViewSettings(prev => ({
          ...prev,
          pan: { ...prev.pan, y: prev.pan.y - e.deltaY }
        }));
      }
    };

    containerNode.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => {
      containerNode.removeEventListener('wheel', handleWheelNative);
    };
  }, [containerNode]); // Only re-bind if container changes

  return {
    outerRef: containerRef,
    containerNode,
    viewSettings,
    setViewSettings,
    isDragging,
    handleZoom,
    handleReset,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp
  };
};
