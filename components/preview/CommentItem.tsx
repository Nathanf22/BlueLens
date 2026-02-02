import React from 'react';
import { MessageCircle, Trash2 } from 'lucide-react';
import { Comment } from '../../types';

interface CommentItemProps {
  comment: Comment;
  zoom: number;
  isActive: boolean;
  onActivate: (id: string | null) => void;
  onDelete: (id: string) => void;
}

export const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  zoom,
  isActive,
  onActivate,
  onDelete
}) => {
  return (
    <div 
      style={{ 
          left: comment.x, 
          top: comment.y,
          position: 'absolute'
       }}
      className="transform -translate-x-1/2 -translate-y-1/2 z-30"
    >
      <div 
        className={`
          comment-marker group relative
          w-8 h-8 rounded-full flex items-center justify-center shadow-lg cursor-pointer transition-all
          ${isActive ? 'bg-brand-500 z-50 scale-110' : 'bg-dark-700 hover:bg-brand-600 border border-gray-600'}
        `}
        style={{ transform: `scale(${1 / zoom})` }}
        onClick={(e) => {
          e.stopPropagation();
          onActivate(isActive ? null : comment.id);
        }}
      >
        <MessageCircle className="w-4 h-4 text-white" />
        
        {/* Tooltip/Card */}
        <div className={`
          absolute left-1/2 bottom-full mb-3 -translate-x-1/2 w-64 bg-dark-800 border border-gray-700 rounded-lg shadow-xl p-3
          transition-all duration-200 origin-bottom cursor-auto
          ${isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}
        `}>
          <div className="text-sm text-gray-200 mb-2 whitespace-pre-wrap leading-relaxed">{comment.content}</div>
          <div className="flex justify-between items-center border-t border-gray-700 pt-2">
            <span className="text-[10px] text-gray-500">
              {new Date(comment.createdAt).toLocaleTimeString()}
            </span>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onDelete(comment.id);
              }}
              className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-900/30"
              title="Delete comment"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
          <div className="absolute left-1/2 top-full -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-dark-800" />
        </div>
      </div>
    </div>
  );
};
