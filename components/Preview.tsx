import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { ZoomIn, ZoomOut, RotateCcw, Download, AlertCircle, Maximize, MessageCircle, X, Check, Trash2 } from 'lucide-react';
import { ViewSettings, Comment } from '../types';

interface PreviewProps {
  code: string;
  comments: Comment[];
  onAddComment: (comment: { x: number; y: number; content: string }) => void;
  onDeleteComment: (id: string) => void;
  onError: (error: string) => void;
  onSuccess: () => void;
}

// Initialize immediately to ensure styles are injected
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  fontFamily: 'Inter, sans-serif',
});

export const Preview: React.FC<PreviewProps> = ({ 
  code, 
  comments, 
  onAddComment, 
  onDeleteComment, 
  onError, 
  onSuccess 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [viewSettings, setViewSettings] = useState<ViewSettings>({ zoom: 1, pan: { x: 0, y: 0 } });
  
  // Interaction State
  const [isDragging, setIsDragging] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [isCommentMode, setIsCommentMode] = useState(false);
  const [draftComment, setDraftComment] = useState<{x: number, y: number} | null>(null);
  const [draftText, setDraftText] = useState("");
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const renderDiagram = async () => {
      // Clear previous content immediately to avoid stale diagrams if render fails
      if (!code.trim()) {
        setSvgContent('');
        return;
      }

      try {
        // Reset mermaid config to ensure theme matches
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
          fontFamily: 'Inter, sans-serif',
        });

        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, code);
        
        if (isMounted) {
          // Robust SVG processing using DOMParser
          // This avoids fragile regex and ensures we get valid XML manipulation
          const parser = new DOMParser();
          const doc = parser.parseFromString(svg, 'image/svg+xml');
          const svgElement = doc.documentElement;
          
          if (svgElement.tagName.toLowerCase() !== 'svg') {
             throw new Error('Rendered content is not an SVG');
          }

          // 1. Get dimensions from viewBox
          const viewBox = svgElement.getAttribute('viewBox');
          if (viewBox) {
            const [, , width, height] = viewBox.split(/\s+/).map(Number);
            // Set explicit pixel width/height to match the coordinate system
            // This prevents the "collapsed to 0" issue and layout shifts
            if (width && height) {
                svgElement.setAttribute('width', `${width}px`);
                svgElement.setAttribute('height', `${height}px`);
            }
          }

          // 2. Remove restrictive styles that conflict with our zoom container
          svgElement.style.maxWidth = ''; // Remove max-width constraint
          svgElement.style.width = ''; // Remove width: 100% or similar
          svgElement.style.height = ''; 
          
          // 3. Serialize back to string
          const serializer = new XMLSerializer();
          const cleanSvg = serializer.serializeToString(svgElement);

          setSvgContent(cleanSvg);
          onSuccess();
        }
      } catch (err: any) {
        if (isMounted) {
          console.error("Mermaid Render Error", err);
          // Don't show error for empty/partial code while typing, unless it's a real syntax error
          // Note: mermaid.parse() could be used for validation but render catches it too.
          const message = err.message || "Syntax error";
          onError(message);
        }
      }
    };

    renderDiagram();

    return () => {
      isMounted = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Handle Zoom
  const handleZoom = (delta: number) => {
    setViewSettings(prev => ({
      ...prev,
      zoom: Math.max(0.1, Math.min(5, prev.zoom + delta))
    }));
  };

  const handleReset = () => {
    setViewSettings({ zoom: 1, pan: { x: 0, y: 0 } });
  };

  const handleFullscreen = () => {
    if (wrapperRef.current) {
      if (!document.fullscreenElement) {
        wrapperRef.current.requestFullscreen().catch(err => {
          console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
      } else {
        document.exitFullscreen();
      }
    }
  };

  // Handle Pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isCommentMode) return;
    if (e.target instanceof Element && e.target.closest('.comment-marker')) return;

    setIsDragging(true);
    setStartPan({ x: e.clientX - viewSettings.pan.x, y: e.clientY - viewSettings.pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setViewSettings(prev => ({
      ...prev,
      pan: {
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y
      }
    }));
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Handle Comments
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!isCommentMode || isDragging || draftComment) return;
    
    if (e.target instanceof Element && e.target.closest('.comment-marker')) return;

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
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

  const cancelComment = () => {
    setDraftComment(null);
    setDraftText("");
  };

  const handleDownload = () => {
    if (!containerRef.current) return;
    const svgDiv = containerRef.current.querySelector('.mermaid-svg-container');
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
    <div ref={wrapperRef} className="relative w-full h-full bg-dark-800 overflow-hidden flex flex-col rounded-lg border border-gray-700 group">
      
      {/* Toolbar */}
      <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 bg-dark-900/90 p-2 rounded-lg backdrop-blur border border-gray-700 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        <button 
          onClick={() => {
            setIsCommentMode(!isCommentMode);
            setDraftComment(null);
          }}
          className={`p-2 rounded hover:text-white transition-colors ${isCommentMode ? 'bg-brand-600 text-white' : 'hover:bg-gray-700 text-gray-300'}`} 
          title="Toggle Comment Mode"
        >
          <MessageCircle className="w-5 h-5" />
        </button>
        <div className="h-px bg-gray-700 my-1" />
        <button onClick={() => handleZoom(0.1)} className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white" title="Zoom In">
          <ZoomIn className="w-5 h-5" />
        </button>
        <button onClick={() => handleZoom(-0.1)} className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white" title="Zoom Out">
          <ZoomOut className="w-5 h-5" />
        </button>
        <button onClick={handleReset} className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white" title="Reset View">
          <RotateCcw className="w-5 h-5" />
        </button>
        <button onClick={handleFullscreen} className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white" title="Fullscreen">
          <Maximize className="w-5 h-5" />
        </button>
        <div className="h-px bg-gray-700 my-1" />
        <button onClick={handleDownload} className="p-2 hover:bg-brand-600 rounded text-brand-500 hover:text-white" title="Download Image (SVG)">
          <Download className="w-5 h-5" />
        </button>
      </div>

      {/* Mode Indicator */}
      {isCommentMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-brand-900/80 text-brand-100 px-4 py-2 rounded-full text-sm font-medium border border-brand-500/30 backdrop-blur pointer-events-none animate-in fade-in slide-in-from-top-4">
          Click anywhere to add a comment
        </div>
      )}

      {/* Canvas */}
      <div 
        className={`
          flex-1 w-full h-full overflow-hidden relative 
          ${isCommentMode ? 'cursor-crosshair' : isDragging ? 'cursor-grabbing' : 'cursor-grab'}
          ${!svgContent ? 'flex items-center justify-center' : ''}
        `}
        onMouseDown={handleMouseDown}
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

        {/* Content Container - This is what gets transformed */}
        {svgContent && (
           <div 
             ref={containerRef}
             style={{
               transform: `translate(${viewSettings.pan.x}px, ${viewSettings.pan.y}px) scale(${viewSettings.zoom})`,
               transformOrigin: '0 0',
               width: 'fit-content', 
               height: 'fit-content',
               display: 'block', // Changed from flex to block to avoid flexbox quirks with SVG dimensions
             }}
             className="relative"
           >
              {/* The Diagram */}
              <div 
                 className="mermaid-svg-container"
                 dangerouslySetInnerHTML={{ __html: svgContent }} 
              />

              {/* Comments Layer - Overlay on top of diagram */}
              {comments.map((comment) => (
               <div 
                 key={comment.id}
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
                     ${activeCommentId === comment.id ? 'bg-brand-500 z-50 scale-110' : 'bg-dark-700 hover:bg-brand-600 border border-gray-600'}
                   `}
                   style={{ transform: `scale(${1 / viewSettings.zoom})` }}
                   onClick={(e) => {
                     e.stopPropagation();
                     setActiveCommentId(activeCommentId === comment.id ? null : comment.id);
                   }}
                 >
                   <MessageCircle className="w-4 h-4 text-white" />
                   
                   {/* Tooltip/Card */}
                   <div className={`
                     absolute left-1/2 bottom-full mb-3 -translate-x-1/2 w-64 bg-dark-800 border border-gray-700 rounded-lg shadow-xl p-3
                     transition-all duration-200 origin-bottom cursor-auto
                     ${activeCommentId === comment.id ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}
                   `}>
                     <div className="text-sm text-gray-200 mb-2 whitespace-pre-wrap leading-relaxed">{comment.content}</div>
                     <div className="flex justify-between items-center border-t border-gray-700 pt-2">
                       <span className="text-[10px] text-gray-500">
                         {new Date(comment.createdAt).toLocaleTimeString()}
                       </span>
                       <button 
                         onClick={(e) => {
                           e.stopPropagation();
                           onDeleteComment(comment.id);
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
             ))}

             {/* Draft Comment Input */}
             {draftComment && (
               <div 
                 style={{ 
                     left: draftComment.x, 
                     top: draftComment.y,
                     position: 'absolute',
                     transform: `translate(-50%, 1rem) scale(${1 / viewSettings.zoom})` 
                 }}
                 className="z-50 w-64 origin-top-left"
               >
                 <div className="bg-dark-800 border border-brand-500 rounded-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                   <div className="p-2 border-b border-gray-700 bg-dark-900/50 flex justify-between items-center">
                     <span className="text-xs font-semibold text-brand-400">New Comment</span>
                     <button onClick={cancelComment} className="text-gray-500 hover:text-gray-300">
                       <X className="w-3 h-3" />
                     </button>
                   </div>
                   <div className="p-2">
                     <textarea
                       autoFocus
                       value={draftText}
                       onChange={(e) => setDraftText(e.target.value)}
                       placeholder="Type your comment..."
                       className="w-full bg-dark-900 rounded p-2 text-sm text-gray-200 outline-none resize-none focus:ring-1 focus:ring-brand-500/50 h-20 mb-2 placeholder-gray-600"
                       onKeyDown={(e) => {
                         if (e.key === 'Enter' && !e.shiftKey) {
                           e.preventDefault();
                           saveComment();
                         }
                       }}
                     />
                     <div className="flex justify-end gap-2">
                       <button 
                         onClick={saveComment}
                         className="bg-brand-600 hover:bg-brand-500 text-white text-xs px-3 py-1.5 rounded flex items-center gap-1"
                       >
                         <Check className="w-3 h-3" /> Save
                       </button>
                     </div>
                   </div>
                 </div>
               </div>
             )}
           </div>
        )}
      </div>
    </div>
  );
};