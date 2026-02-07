import React from 'react';
import { GripVertical } from 'lucide-react';
import { Editor } from './Editor';
import { Preview } from './Preview';
import { CodePanel } from './CodePanel';
import { Diagram, Comment, CodeFile } from '../types';

interface WorkspaceViewProps {
  activeDiagram: Diagram | undefined;
  error: string | null;
  isEditorCollapsed: boolean;
  onToggleEditorCollapse: () => void;
  onCodeChange: (code: string) => void;
  onNameChange: (name: string) => void;
  onAddComment: (commentData: { x: number; y: number; content: string }) => void;
  onDeleteComment: (commentId: string) => void;
  onError: (error: string | null) => void;
  onSuccess: () => void;
  breadcrumbPath: { id: string; name: string }[];
  onZoomIn: (targetDiagramId: string, sourceNodeId?: string, sourceNodeName?: string) => void;
  onZoomOut: () => void;
  onGoToRoot: () => void;
  onBreadcrumbNavigate: (index: number) => void;
  onManageLinks: () => void;
  onManageCodeLinks: () => void;
  onViewCode: (nodeId: string) => void;
  isCodePanelOpen: boolean;
  activeCodeFile: CodeFile | null;
  onCloseCodePanel: () => void;
  leftWidthPercent: number;
  isDragging: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
  onMouseDown: (e: React.MouseEvent) => void;
}

export const WorkspaceView: React.FC<WorkspaceViewProps> = ({
  activeDiagram,
  error,
  isEditorCollapsed,
  onToggleEditorCollapse,
  onCodeChange,
  onNameChange,
  onAddComment,
  onDeleteComment,
  onError,
  onSuccess,
  breadcrumbPath,
  onZoomIn,
  onZoomOut,
  onGoToRoot,
  onBreadcrumbNavigate,
  onManageLinks,
  onManageCodeLinks,
  onViewCode,
  isCodePanelOpen,
  activeCodeFile,
  onCloseCodePanel,
  leftWidthPercent,
  isDragging,
  containerRef,
  onMouseDown
}) => {
  return (
    <main 
      ref={containerRef}
      className="flex-1 overflow-hidden flex flex-col lg:flex-row relative bg-[#0d0d0d]"
    >
      {activeDiagram ? (
        <>
          {/* Editor Pane */}
          <div 
            className={`min-w-0 h-1/2 lg:h-full ${isEditorCollapsed ? '' : 'flex-1 lg:flex-none'}`}
            style={isEditorCollapsed ? {} : { width: `${leftWidthPercent}%` }}
          >
            <Editor 
              code={activeDiagram.code} 
              name={activeDiagram.name}
              onCodeChange={onCodeChange}
              onNameChange={onNameChange}
              error={error}
              isCollapsed={isEditorCollapsed}
              onToggleCollapse={onToggleEditorCollapse}
            />
          </div>

          {/* Resizer Handle */}
          {!isEditorCollapsed && (
          <div
            className="hidden lg:flex w-2 bg-dark-900 border-l border-r border-gray-800 hover:bg-brand-600 cursor-col-resize items-center justify-center transition-colors z-10"
            onMouseDown={onMouseDown}
          >
            <GripVertical className="w-3 h-3 text-gray-600 pointer-events-none" />
          </div>
          )}

          {/* Preview Pane */}
          <div className={`${isCodePanelOpen ? 'flex-1 min-w-0' : 'flex-1 min-w-0'} h-1/2 lg:h-full p-4 bg-[#0d0d0d]`}>
            <Preview
              code={activeDiagram.code}
              comments={activeDiagram.comments || []}
              onAddComment={onAddComment}
              onDeleteComment={onDeleteComment}
              onError={onError}
              onSuccess={onSuccess}
              currentDiagram={activeDiagram}
              breadcrumbPath={breadcrumbPath}
              onZoomIn={onZoomIn}
              onZoomOut={onZoomOut}
              onGoToRoot={onGoToRoot}
              onBreadcrumbNavigate={onBreadcrumbNavigate}
              onManageLinks={onManageLinks}
              onManageCodeLinks={onManageCodeLinks}
              onViewCode={onViewCode}
            />
          </div>

          {/* Code Panel */}
          {isCodePanelOpen && activeCodeFile && (
            <div className="w-[400px] min-w-[300px] h-1/2 lg:h-full flex-shrink-0">
              <CodePanel
                codeFile={activeCodeFile}
                onClose={onCloseCodePanel}
              />
            </div>
          )}
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          Select or create a diagram
        </div>
      )}
      
      {/* Overlay while dragging */}
      {isDragging && (
        <div className="absolute inset-0 z-50 cursor-col-resize" />
      )}
    </main>
  );
};
