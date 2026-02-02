import React, { useRef, useState, useCallback } from 'react';
import { AlertCircle } from 'lucide-react';
import { Comment } from '../types';
import { PreviewToolbar } from './preview/PreviewToolbar';
import { CommentItem } from './preview/CommentItem';
import { DraftComment } from './preview/DraftComment';
import { useNavigation } from '../hooks/useNavigation';
import { useDiagramRenderer } from '../hooks/useDiagramRenderer';

interface PreviewProps {
  code: string;
  comments: Comment[];
  onAddComment: (comment: { x: number; y: number; content: string }) => void;
  onDeleteComment: (id: string) => void;
  onError: (error: string) => void;
  onSuccess: () => void;
}

export const Preview: React.FC<PreviewProps> = ({ 
  code, 
  comments, 
  onAddComment, 
  onDeleteComment, 
  onError, 
  onSuccess 
}) => {
  // This ref is for the INNER container (the one being transformed)
  // We need it for click calculations and download
  const innerContainerRef = useRef<HTMLDivElement>(null);
  
  // Interaction State
  const [isCommentMode, setIsCommentMode] = useState(false);
  const [draftComment, setDraftComment] = useState<{x: number, y: number} | null>(null);
  const [draftText, setDraftText] = useState("");
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);

  // Hooks
  const { svgContent } = useDiagramRenderer(code, onSuccess, onError);
  
  const {
    outerRef, // This is the ref for the outermost container, used for fullscreen
    containerNode, // This is the actual DOM node for the SVG container
    viewSettings,
    isDragging,
    handleZoom,
    handleReset,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp
  } = useNavigation(svgContent);

  // Handlers
  const handleFullscreen = useCallback(() => {
    if (containerNode) {
      if (!document.fullscreenElement) {
        containerNode.requestFullscreen().catch(err => {
          console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
      } else {
        document.exitFullscreen();
      }
    }
  }, [containerNode]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!isCommentMode || isDragging || draftComment) return;
    if (e.target instanceof Element && e.target.closest('.comment-marker')) return;

    if (innerContainerRef.current) {
      const rect = innerContainerRef.current.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;
      const relativeY = e.clientY - rect.top;
      
      const x = relativeX / viewSettings.zoom;
      const y = relativeY / viewSettings.zoom;
      
      setDraftComment({ x, y });
      setDraftText("");
    }
  };

  const saveComment = () => {
    if (draftComment && draftText.trim()) {
      onAddComment({
        x: draftComment.x,
        y: draftComment.y,
        content: draftText.trim()
      });
      setDraftComment(null);
      setDraftText("");
      setIsCommentMode(false); 
    }
  };

  const handleDownload = () => {
    if (!innerContainerRef.current) return;
    const svgDiv = innerContainerRef.current.querySelector('.mermaid-svg-container');
    const svgElement = svgDiv?.querySelector('svg');
    if (!svgElement) return;

    const svgData = new XMLSerializer().serializeToString(svgElement);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `mermaid-diagram-${Date.now()}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div ref={outerRef} className="relative w-full h-full bg-dark-800 overflow-hidden flex flex-col rounded-lg border border-gray-700 group">
      
      <PreviewToolbar 
        isCommentMode={isCommentMode}
        onToggleCommentMode={() => {
          setIsCommentMode(!isCommentMode);
          setDraftComment(null);
        }}
        onZoom={handleZoom}
        onReset={handleReset}
        onFullscreen={handleFullscreen}
        onDownload={handleDownload}
      />

      {isCommentMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-brand-900/80 text-brand-100 px-4 py-2 rounded-full text-sm font-medium border border-brand-500/30 backdrop-blur pointer-events-none animate-in fade-in slide-in-from-top-4">
          Click anywhere to add a comment
        </div>
      )}

      <div 
        className={`
          flex-1 w-full h-full overflow-hidden relative 
          ${isCommentMode ? 'cursor-crosshair' : isDragging ? 'cursor-grabbing' : 'cursor-grab'}
          ${!svgContent ? 'flex items-center justify-center' : ''}
        `}
        onMouseDown={(e) => handleMouseDown(e, isCommentMode)}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleCanvasClick}
      >
        {!svgContent && (
           <div className="text-gray-500 flex flex-col items-center">
             <AlertCircle className="w-12 h-12 mb-2 opacity-50" />
             <p>No valid diagram to render</p>
           </div>
        )}

        {svgContent && (
           <div 
             ref={innerContainerRef}
             style={{
               transform: `translate(${viewSettings.pan.x}px, ${viewSettings.pan.y}px) scale(${viewSettings.zoom})`,
               transformOrigin: '0 0',
               width: 'fit-content', 
               height: 'fit-content',
               display: 'block',
             }}
             className="relative"
           >
              <div 
                 className="mermaid-svg-container"
                 dangerouslySetInnerHTML={{ __html: svgContent }} 
              />

              {comments.map((comment) => (
                <CommentItem 
                  key={comment.id}
                  comment={comment}
                  zoom={viewSettings.zoom}
                  isActive={activeCommentId === comment.id}
                  onActivate={setActiveCommentId}
                  onDelete={onDeleteComment}
                />
              ))}

              {draftComment && (
                <DraftComment 
                  x={draftComment.x}
                  y={draftComment.y}
                  zoom={viewSettings.zoom}
                  text={draftText}
                  onTextChange={setDraftText}
                  onSave={saveComment}
                  onCancel={() => setDraftComment(null)}
                />
              )}
           </div>
        )}
      </div>
    </div>
  );
};
