import React from 'react';
import { MessageCircle, ZoomIn, ZoomOut, RotateCcw, Maximize, Download, Link2 } from 'lucide-react';

interface PreviewToolbarProps {
  isCommentMode: boolean;
  onToggleCommentMode: () => void;
  onZoom: (delta: number) => void;
  onReset: () => void;
  onFullscreen: () => void;
  onDownload: () => void;
  onManageLinks?: () => void;
}

export const PreviewToolbar: React.FC<PreviewToolbarProps> = ({
  isCommentMode,
  onToggleCommentMode,
  onZoom,
  onReset,
  onFullscreen,
  onDownload,
  onManageLinks
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
    </div>
  );
};
