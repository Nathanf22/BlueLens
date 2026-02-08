import React from 'react';
import { MessageCircle, ZoomIn, ZoomOut, RotateCcw, Maximize, Download, Link2, Code, MessageSquare, Search, Brain } from 'lucide-react';
import { SyncStatus } from '../../types';

const SYNC_STATUS_COLORS: Record<SyncStatus, string> = {
  unknown: 'bg-gray-500',
  synced: 'bg-green-500',
  suggestions: 'bg-yellow-500',
  conflicts: 'bg-red-500',
};

const SYNC_STATUS_LABELS: Record<SyncStatus, string> = {
  unknown: 'Not scanned',
  synced: 'In sync',
  suggestions: 'Suggestions available',
  conflicts: 'Conflicts detected',
};

interface PreviewToolbarProps {
  isCommentMode: boolean;
  onToggleCommentMode: () => void;
  onZoom: (delta: number) => void;
  onReset: () => void;
  onFullscreen: () => void;
  onDownload: () => void;
  onManageLinks?: () => void;
  onManageCodeLinks?: () => void;
  onToggleAIChat?: () => void;
  isAIChatOpen?: boolean;
  onScanCode?: () => void;
  syncStatus?: SyncStatus;
  onAnalyze?: () => void;
}

export const PreviewToolbar: React.FC<PreviewToolbarProps> = ({
  isCommentMode,
  onToggleCommentMode,
  onZoom,
  onReset,
  onFullscreen,
  onDownload,
  onManageLinks,
  onManageCodeLinks,
  onToggleAIChat,
  isAIChatOpen,
  onScanCode,
  syncStatus = 'unknown',
  onAnalyze,
}) => {
  return (
    <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 bg-dark-900/90 p-2 rounded-lg backdrop-blur border border-gray-700 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200">
      <button
        onClick={onToggleCommentMode}
        className={`p-2 rounded hover:text-white transition-colors ${isCommentMode ? 'bg-brand-600 text-white' : 'hover:bg-gray-700 text-gray-300'}`}
        title="Toggle Comment Mode"
      >
        <MessageCircle className="w-5 h-5" />
      </button>
      <div className="h-px bg-gray-700 my-1" />
      <button onClick={() => onZoom(0.1)} className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white" title="Zoom In">
        <ZoomIn className="w-5 h-5" />
      </button>
      <button onClick={() => onZoom(-0.1)} className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white" title="Zoom Out">
        <ZoomOut className="w-5 h-5" />
      </button>
      <button onClick={onReset} className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white" title="Reset View">
        <RotateCcw className="w-5 h-5" />
      </button>
      <button onClick={onFullscreen} className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white" title="Fullscreen">
        <Maximize className="w-5 h-5" />
      </button>
      <div className="h-px bg-gray-700 my-1" />
      <button onClick={onDownload} className="p-2 hover:bg-brand-600 rounded text-brand-500 hover:text-white" title="Download Image (SVG)">
        <Download className="w-5 h-5" />
      </button>
      {onManageLinks && (
        <>
          <div className="h-px bg-gray-700 my-1" />
          <button onClick={onManageLinks} className="p-2 hover:bg-brand-600 rounded text-brand-500 hover:text-white" title="Manage Node Links">
            <Link2 className="w-5 h-5" />
          </button>
        </>
      )}
      {onManageCodeLinks && (
        <button onClick={onManageCodeLinks} className="p-2 hover:bg-green-600 rounded text-green-500 hover:text-white" title="Manage Code Links">
          <Code className="w-5 h-5" />
        </button>
      )}
      {onScanCode && (
        <button onClick={onScanCode} className="p-2 hover:bg-yellow-600 rounded text-yellow-500 hover:text-white relative" title={`Scan Code (${SYNC_STATUS_LABELS[syncStatus]})`}>
          <Search className="w-5 h-5" />
          <span className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full ${SYNC_STATUS_COLORS[syncStatus]} border border-dark-900`} />
        </button>
      )}
      {onAnalyze && (
        <button onClick={onAnalyze} className="p-2 hover:bg-purple-600 rounded text-purple-400 hover:text-white" title="Analyze Diagram">
          <Brain className="w-5 h-5" />
        </button>
      )}
      {onToggleAIChat && (
        <>
          <div className="h-px bg-gray-700 my-1" />
          <button
            onClick={onToggleAIChat}
            className={`p-2 rounded transition-colors ${isAIChatOpen ? 'bg-brand-600 text-white' : 'hover:bg-brand-600 text-brand-500 hover:text-white'}`}
            title="AI Chat"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
        </>
      )}
    </div>
  );
};
