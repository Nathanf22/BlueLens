import React from 'react';
import { GripVertical } from 'lucide-react';
import { Editor } from './Editor';
import { Preview } from './Preview';
import { CodePanel } from './CodePanel';
import { AIChatPanel } from './AIChatPanel';
import { CodeGraphPanel } from './CodeGraphPanel';
import { Diagram, Comment, CodeFile, ChatMessage, ChatSession, LLMSettings, SyncStatus, CodeGraph, ViewLens, CodeGraphAnomaly } from '../types';
import { useCodePanelResize } from '../hooks/useCodePanelResize';

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
  // AI Chat
  isAIChatOpen: boolean;
  onToggleAIChat: () => void;
  onCloseAIChat: () => void;
  chatSession: ChatSession | null;
  isAIChatLoading: boolean;
  onSendChatMessage: (text: string) => void;
  onApplyCode: (msg: ChatMessage) => void;
  onClearChat: () => void;
  activeProvider: LLMSettings['activeProvider'];
  // Scan
  onScanCode: () => void;
  syncStatus?: SyncStatus;
  onAnalyze?: () => void;
  onGenerateScaffold?: (language: string) => void;
  leftWidthPercent: number;
  isDragging: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
  onMouseDown: (e: React.MouseEvent) => void;
  // CodeGraph
  codeGraph?: CodeGraph | null;
  codeGraphLens?: ViewLens | null;
  codeGraphMermaidCode?: string | null;
  codeGraphFocusNodeId?: string | null;
  codeGraphBreadcrumbStack?: Array<{ nodeId: string; name: string }>;
  codeGraphIsSyncing?: boolean;
  onCodeGraphSwitchLens?: (lensId: string) => void;
  onCodeGraphFocusNode?: (nodeId: string) => void;
  onCodeGraphFocusUp?: () => void;
  onCodeGraphFocusRoot?: () => void;
  onCodeGraphNavigateBreadcrumb?: (index: number) => void;
  onCodeGraphSync?: () => void;
  onCodeGraphGetAnomalies?: () => CodeGraphAnomaly[];
  onCodeGraphDelete?: () => void;
  onCodeGraphRename?: (name: string) => void;
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
  isAIChatOpen,
  onToggleAIChat,
  onCloseAIChat,
  chatSession,
  isAIChatLoading,
  onSendChatMessage,
  onApplyCode,
  onClearChat,
  activeProvider,
  onScanCode,
  syncStatus,
  onAnalyze,
  onGenerateScaffold,
  leftWidthPercent,
  isDragging,
  containerRef,
  onMouseDown,
  codeGraph,
  codeGraphLens,
  codeGraphMermaidCode,
  codeGraphFocusNodeId,
  codeGraphBreadcrumbStack = [],
  codeGraphIsSyncing = false,
  onCodeGraphSwitchLens,
  onCodeGraphFocusNode,
  onCodeGraphFocusUp,
  onCodeGraphFocusRoot,
  onCodeGraphNavigateBreadcrumb,
  onCodeGraphSync,
  onCodeGraphGetAnomalies,
  onCodeGraphDelete,
  onCodeGraphRename,
}) => {
  const { codePanelWidthPercent, isDraggingCodePanel, handleCodePanelMouseDown } = useCodePanelResize(containerRef);

  const isCodeGraphMode = !!codeGraph;
  const previewCode = isCodeGraphMode ? (codeGraphMermaidCode || '') : (activeDiagram?.code || '');

  return (
    <main
      ref={containerRef}
      className="flex-1 overflow-hidden flex flex-col lg:flex-row relative bg-[#0d0d0d]"
    >
      {activeDiagram || isCodeGraphMode ? (
        <>
          {/* Left Pane: Editor or CodeGraphPanel */}
          {isCodeGraphMode && codeGraph ? (
            <div className="w-72 flex-shrink-0 h-1/2 lg:h-full overflow-hidden">
              <CodeGraphPanel
                graph={codeGraph}
                activeLens={codeGraphLens || null}
                focusNodeId={codeGraphFocusNodeId || null}
                breadcrumbStack={codeGraphBreadcrumbStack}
                isSyncing={codeGraphIsSyncing}
                onSwitchLens={onCodeGraphSwitchLens || (() => {})}
                onFocusNode={onCodeGraphFocusNode || (() => {})}
                onFocusUp={onCodeGraphFocusUp || (() => {})}
                onFocusRoot={onCodeGraphFocusRoot || (() => {})}
                onNavigateBreadcrumb={onCodeGraphNavigateBreadcrumb || (() => {})}
                onSyncGraph={onCodeGraphSync || (() => {})}
                onGetAnomalies={onCodeGraphGetAnomalies || (() => [])}
                onDeleteGraph={onCodeGraphDelete || (() => {})}
                onRenameGraph={onCodeGraphRename || (() => {})}
              />
            </div>
          ) : (
            <div
              className={`min-w-0 h-1/2 lg:h-full ${isEditorCollapsed ? '' : 'flex-1 lg:flex-none'}`}
              style={isEditorCollapsed ? {} : { width: `${leftWidthPercent}%` }}
            >
              <Editor
                code={activeDiagram!.code}
                name={activeDiagram!.name}
                onCodeChange={onCodeChange}
                onNameChange={onNameChange}
                error={error}
                isCollapsed={isEditorCollapsed}
                onToggleCollapse={onToggleEditorCollapse}
              />
            </div>
          )}

          {/* Resizer Handle */}
          {!isCodeGraphMode && !isEditorCollapsed && (
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
              code={previewCode}
              comments={activeDiagram?.comments || []}
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
              onToggleAIChat={onToggleAIChat}
              isAIChatOpen={isAIChatOpen}
              onScanCode={onScanCode}
              syncStatus={syncStatus}
              onAnalyze={onAnalyze}
            />
          </div>

          {/* Code Panel Resizer + Panel */}
          {isCodePanelOpen && activeCodeFile && (
            <>
              <div
                className="hidden lg:flex w-2 bg-dark-900 border-l border-r border-gray-800 hover:bg-green-600 cursor-col-resize items-center justify-center transition-colors z-10"
                onMouseDown={handleCodePanelMouseDown}
              >
                <GripVertical className="w-3 h-3 text-gray-600 pointer-events-none" />
              </div>
              <div
                className="h-1/2 lg:h-full flex-shrink-0"
                style={{ width: `${codePanelWidthPercent}%` }}
              >
                <CodePanel
                  codeFile={activeCodeFile}
                  onClose={onCloseCodePanel}
                />
              </div>
            </>
          )}

          {/* AI Chat Panel */}
          {isAIChatOpen && (
            <>
              <div
                className="hidden lg:flex w-2 bg-dark-900 border-l border-r border-gray-800 hover:bg-brand-600 cursor-col-resize items-center justify-center transition-colors z-10"
                onMouseDown={handleCodePanelMouseDown}
              >
                <GripVertical className="w-3 h-3 text-gray-600 pointer-events-none" />
              </div>
              <div
                className="h-1/2 lg:h-full flex-shrink-0"
                style={{ width: `${codePanelWidthPercent}%` }}
              >
                <AIChatPanel
                  chatSession={chatSession}
                  isLoading={isAIChatLoading}
                  onSendMessage={onSendChatMessage}
                  onApplyCode={onApplyCode}
                  onClearChat={onClearChat}
                  onClose={onCloseAIChat}
                  activeProvider={activeProvider}
                  onGenerateScaffold={onGenerateScaffold}
                />
              </div>
            </>
          )}
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-500">
          Select or create a diagram
        </div>
      )}
      
      {/* Overlay while dragging */}
      {(isDragging || isDraggingCodePanel) && (
        <div className="absolute inset-0 z-50 cursor-col-resize" />
      )}
    </main>
  );
};
