import React, { useRef, useState, useCallback, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { Comment, Diagram, SyncStatus } from '../types';
import { PreviewToolbar } from './preview/PreviewToolbar';
import { CommentItem } from './preview/CommentItem';
import { DraftComment } from './preview/DraftComment';
import { Breadcrumb } from './Breadcrumb';
import { SubDiagramBadge } from './SubDiagramBadge';
import { useNavigation } from '../hooks/useNavigation';
import { useDiagramRenderer } from '../hooks/useDiagramRenderer';
import { useKeyboardNavigation } from '../hooks/useKeyboardNavigation';
import { svgParserService } from '../services/svgParserService';

interface BreadcrumbItem {
  id: string;
  name: string;
}

interface PreviewProps {
  code: string;
  comments: Comment[];
  onAddComment: (comment: { x: number; y: number; content: string }) => void;
  onDeleteComment: (id: string) => void;
  onError: (error: string) => void;
  onSuccess: () => void;

  // Multi-level navigation props
  currentDiagram: Diagram | undefined;
  breadcrumbPath: BreadcrumbItem[];
  onZoomIn: (targetDiagramId: string, sourceNodeId?: string, sourceNodeName?: string) => void;
  onZoomOut: () => void;
  onGoToRoot: () => void;
  onBreadcrumbNavigate: (index: number) => void;
  onManageLinks?: () => void;
  onManageCodeLinks?: () => void;
  onViewCode?: (nodeId: string) => void;
  onToggleAIChat?: () => void;
  isAIChatOpen?: boolean;
  onScanCode?: () => void;
  syncStatus?: SyncStatus;
  onAnalyze?: () => void;
}

export const Preview: React.FC<PreviewProps> = ({ 
  code, 
  comments, 
  onAddComment, 
  onDeleteComment, 
  onError, 
  onSuccess,
  currentDiagram,
  breadcrumbPath,
  onZoomIn,
  onZoomOut,
  onGoToRoot,
  onBreadcrumbNavigate,
  onManageLinks,
  onManageCodeLinks,
  onViewCode,
  onToggleAIChat,
  isAIChatOpen,
  onScanCode,
  syncStatus,
  onAnalyze,
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

  // Track fullscreen state to show name/description overlay
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // Keyboard navigation
  useKeyboardNavigation({
    onZoomIn: currentDiagram && currentDiagram.nodeLinks && currentDiagram.nodeLinks.length > 0 ? () => {} : undefined,
    onZoomOut: breadcrumbPath.length > 0 ? onZoomOut : undefined,
    onGoToRoot: breadcrumbPath.length > 0 ? onGoToRoot : undefined
  }, !isCommentMode);

  // Function to inject badges into the SVG
  const injectBadges = useCallback(() => {
    if (!innerContainerRef.current || !currentDiagram) return;

    const svgContainer = innerContainerRef.current.querySelector('.mermaid-svg-container');
    const svgElement = svgContainer?.querySelector('svg');
    if (!svgElement) return;

    const nodeLinks = currentDiagram.nodeLinks || [];
    const codeLinks = currentDiagram.codeLinks || [];

    // Check if badges already exist to avoid duplicates
    const existingBlueBadges = svgElement.querySelectorAll('.node-link-badge');
    const existingGreenBadges = svgElement.querySelectorAll('.code-link-badge');

    if (
      existingBlueBadges.length === nodeLinks.length &&
      existingGreenBadges.length === codeLinks.length &&
      (existingBlueBadges.length > 0 || existingGreenBadges.length > 0)
    ) return;

    // Remove any existing badges first
    svgParserService.removeAllBadges(svgElement as SVGElement);

    // Inject blue node-link badges
    nodeLinks.forEach(link => {
      const nodeElement = svgParserService.findNodeElement(svgElement as SVGElement, link.nodeId);
      if (nodeElement) {
        svgParserService.attachDoubleClickHandler(nodeElement, () => {
          onZoomIn(link.targetDiagramId, link.nodeId, link.label || link.nodeId);
        });
        svgParserService.injectBadge(nodeElement, () => {
          onZoomIn(link.targetDiagramId, link.nodeId, link.label || link.nodeId);
        });
      }
    });

    // Inject green code-link badges
    codeLinks.forEach(link => {
      const nodeElement = svgParserService.findNodeElement(svgElement as SVGElement, link.nodeId);
      if (nodeElement) {
        svgParserService.injectCodeBadge(nodeElement, () => {
          onViewCode?.(link.nodeId);
        });
      }
    });
  }, [currentDiagram, onZoomIn, onViewCode]);

  // Inject badges when SVG content changes
  useEffect(() => {
    if (!svgContent) return;
    // Small delay to ensure React has updated the DOM
    const timeoutId = setTimeout(injectBadges, 0);
    return () => clearTimeout(timeoutId);
  }, [svgContent, injectBadges]);

  // Use MutationObserver to re-inject badges if React recreates the SVG container
  useEffect(() => {
    if (!innerContainerRef.current || !svgContent) return;

    const observer = new MutationObserver((mutations) => {
      // Check if the SVG container was modified
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          // Re-inject badges after DOM update
          requestAnimationFrame(injectBadges);
          break;
        }
      }
    });

    const svgContainer = innerContainerRef.current.querySelector('.mermaid-svg-container');
    if (svgContainer) {
      observer.observe(svgContainer, { childList: true, subtree: false });
    }

    return () => observer.disconnect();
  }, [svgContent, injectBadges]);

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
    <div ref={outerRef} className="relative w-full h-full bg-black overflow-hidden flex flex-col rounded-lg border border-gray-700 group">
      
      {/* Breadcrumb Navigation */}
      {breadcrumbPath.length > 0 && (
        <Breadcrumb
          path={breadcrumbPath}
          onNavigate={onBreadcrumbNavigate}
        />
      )}

      {/* Name + description — shown in fullscreen where editor and context bar are hidden */}
      {isFullscreen && currentDiagram?.name && (
        <div className="flex items-baseline gap-4 px-5 py-3 bg-dark-900/80 border-b border-gray-800 backdrop-blur-sm flex-shrink-0 pointer-events-none select-none">
          <span className="text-lg font-semibold text-white truncate">{currentDiagram.name}</span>
          {currentDiagram.description && (
            <span className="text-sm text-gray-400 truncate">{currentDiagram.description}</span>
          )}
        </div>
      )}
      
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
        onManageLinks={onManageLinks}
        onManageCodeLinks={onManageCodeLinks}
        onToggleAIChat={onToggleAIChat}
        isAIChatOpen={isAIChatOpen}
        onScanCode={onScanCode}
        syncStatus={syncStatus}
        onAnalyze={onAnalyze}
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
        onMouseDown={(e) => {
          // Don't start panning if clicking on a badge or linked node
          const target = e.target as Element;
          if (target.closest('.node-link-badge') || target.closest('.code-link-badge') || target.closest('[data-has-double-click="true"]')) {
            return;
          }
          handleMouseDown(e, isCommentMode);
        }}
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
              {/* Sub-diagram badge */}
              {currentDiagram?.hasSubDiagram && (
                <SubDiagramBadge onZoomIn={onZoomIn} />
              )}

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
