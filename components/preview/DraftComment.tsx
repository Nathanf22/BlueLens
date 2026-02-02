import React from 'react';
import { X, Check } from 'lucide-react';

interface DraftCommentProps {
  x: number;
  y: number;
  zoom: number;
  text: string;
  onTextChange: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

export const DraftComment: React.FC<DraftCommentProps> = ({
  x,
  y,
  zoom,
  text,
  onTextChange,
  onSave,
  onCancel
}) => {
  return (
    <div 
      style={{ 
          left: x, 
          top: y,
          position: 'absolute',
          transform: `translate(-50%, 1rem) scale(${1 / zoom})` 
      }}
      className="z-50 w-64 origin-top-left"
    >
      <div className="bg-dark-800 border border-brand-500 rounded-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-2 border-b border-gray-700 bg-dark-900/50 flex justify-between items-center">
          <span className="text-xs font-semibold text-brand-400">New Comment</span>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-300">
            <X className="w-3 h-3" />
          </button>
        </div>
        <div className="p-2">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder="Type your comment..."
            className="w-full bg-dark-900 rounded p-2 text-sm text-gray-200 outline-none resize-none focus:ring-1 focus:ring-brand-500/50 h-20 mb-2 placeholder-gray-600"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSave();
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <button 
              onClick={onSave}
              className="bg-brand-600 hover:bg-brand-500 text-white text-xs px-3 py-1.5 rounded flex items-center gap-1"
            >
              <Check className="w-3 h-3" /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
