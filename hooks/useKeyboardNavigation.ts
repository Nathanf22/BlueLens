import { useState, useEffect, useCallback } from 'react';

interface KeyboardNavigationCallbacks {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onGoToRoot?: () => void;
}

export const useKeyboardNavigation = (
  callbacks: KeyboardNavigationCallbacks,
  enabled: boolean = true
) => {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return;
    
    // Ignore if user is typing in an input/textarea
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    // Z - Zoom in
    if (e.key === 'z' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      callbacks.onZoomIn?.();
    }
    
    // Shift+Z - Zoom out
    if (e.key === 'Z' && e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      callbacks.onZoomOut?.();
    }
    
    // Home - Go to root
    if (e.key === 'Home' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      callbacks.onGoToRoot?.();
    }
  }, [callbacks, enabled]);

  useEffect(() => {
    if (enabled) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [handleKeyDown, enabled]);
};
