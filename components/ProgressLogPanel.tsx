/**
 * ProgressLogPanel — bottom-docked build log for CodeGraph creation.
 *
 * Two states:
 * - Collapsed: 28px bar with latest message, entry count, expand/dismiss buttons
 * - Expanded: ~200px scrollable log with timestamps, category icons, details
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Search, Brain, GitBranch, Link2, Layers, Play, Info,
  ChevronUp, ChevronDown, X,
} from 'lucide-react';
import { ProgressLogEntry, ProgressLogCategory } from '../types';

interface ProgressLogPanelProps {
  entries: ProgressLogEntry[];
  isActive: boolean;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onDismiss: () => void;
}

const CATEGORY_ICONS: Record<ProgressLogCategory, React.ReactNode> = {
  scan: <Search className="w-3 h-3 text-blue-400" />,
  'ai-analyze': <Brain className="w-3 h-3 text-purple-400" />,
  'ai-architect': <Brain className="w-3 h-3 text-pink-400" />,
  parse: <GitBranch className="w-3 h-3 text-green-400" />,
  resolve: <Link2 className="w-3 h-3 text-cyan-400" />,
  hierarchy: <Layers className="w-3 h-3 text-orange-400" />,
  flow: <Play className="w-3 h-3 text-cyan-400" />,
  info: <Info className="w-3 h-3 text-gray-400" />,
};

function formatTimestamp(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toFixed(1).padStart(4, '0')}`;
}

export const ProgressLogPanel: React.FC<ProgressLogPanelProps> = ({
  entries,
  isActive,
  isExpanded,
  onToggleExpanded,
  onDismiss,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [userScrolled, setUserScrolled] = useState(false);
  const [panelHeight, setPanelHeight] = useState(200);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);

  // Auto-scroll to bottom (stops if user scrolls up)
  useEffect(() => {
    if (!userScrolled && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, userScrolled]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 20;
    setUserScrolled(!isAtBottom);
  }, []);

  // Drag handle for resizing
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startHeight: panelHeight };

    const handleDragMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - ev.clientY;
      const newHeight = Math.max(100, Math.min(500, dragRef.current.startHeight + delta));
      setPanelHeight(newHeight);
    };

    const handleDragEnd = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
    };

    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd);
  }, [panelHeight]);

  const latestEntry = entries[entries.length - 1];

  if (!isExpanded) {
    // Collapsed bar
    return (
      <div className="flex items-center h-7 px-3 bg-dark-900 border-t border-gray-800 text-xs gap-2 flex-shrink-0">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
        <span className="text-gray-400 truncate flex-1">
          {isActive ? 'Building graph...' : 'Build complete.'}{' '}
          {latestEntry && <span className="text-gray-500">{latestEntry.message}</span>}
        </span>
        <span className="text-gray-600 flex-shrink-0">{entries.length} entries</span>
        <button
          onClick={onToggleExpanded}
          className="p-0.5 rounded hover:bg-dark-700 text-gray-500 hover:text-gray-300"
          title="Expand log"
        >
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDismiss}
          className="p-0.5 rounded hover:bg-dark-700 text-gray-500 hover:text-gray-300"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // Expanded panel
  return (
    <div
      className="flex flex-col bg-dark-900 border-t border-gray-800 flex-shrink-0"
      style={{ height: panelHeight }}
    >
      {/* Resize handle */}
      <div
        className="h-1 cursor-row-resize hover:bg-brand-600 transition-colors flex-shrink-0"
        onMouseDown={handleDragStart}
      />

      {/* Header bar */}
      <div className="flex items-center h-7 px-3 border-b border-gray-800 gap-2 flex-shrink-0">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${isActive ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
        <span className="text-xs font-medium text-gray-400 flex-1">
          Build Log ({entries.length} entries)
        </span>
        <button
          onClick={onToggleExpanded}
          className="p-0.5 rounded hover:bg-dark-700 text-gray-500 hover:text-gray-300"
          title="Collapse"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDismiss}
          className="p-0.5 rounded hover:bg-dark-700 text-gray-500 hover:text-gray-300"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Log entries */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto font-mono text-xs"
        onScroll={handleScroll}
      >
        {entries.map(entry => (
          <div key={entry.id} className="flex items-start gap-2 px-3 py-0.5 hover:bg-dark-800/50">
            <span className="text-gray-600 flex-shrink-0 w-12 text-right tabular-nums">
              [{formatTimestamp(entry.timestamp)}]
            </span>
            <span className="flex-shrink-0 mt-0.5">
              {CATEGORY_ICONS[entry.category]}
            </span>
            <div className="min-w-0 flex-1">
              <span className="text-gray-300">{entry.message}</span>
              {entry.detail && (
                <div className="text-gray-600 truncate">{entry.detail}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
