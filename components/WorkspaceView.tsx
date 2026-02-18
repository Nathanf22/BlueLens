import React from 'react';
import { GripVertical, GitBranch, ChevronRight, ArrowRight } from 'lucide-react';
import { Editor } from './Editor';
import { Preview } from './Preview';
import { CodePanel } from './CodePanel';
import { AIChatPanel } from './AIChatPanel';
import { CodeGraphPanel } from './CodeGraphPanel';
import { CodeGraphVisualizer } from './CodeGraphVisualizer';
import { ProgressLogPanel } from './ProgressLogPanel';
import { Diagram, Comment, CodeFile, ChatMessage, ChatSession, LLMSettings, SyncStatus, CodeGraph, ViewLens, GraphNode, CodeGraphAnomaly, GraphFlow, ProgressLogEntry } from '../types';
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
  // TODO(DELETE): SCAN FEATURE — onScanCode, syncStatus, and their usages in Preview below
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
  codeGraphFocusNodeId?: string | null;
  codeGraphSelectedNodeId?: string | null;
  codeGraphSelectedNode?: GraphNode | null;
  codeGraphBreadcrumbStack?: Array<{ nodeId: string; name: string }>;
  codeGraphIsSyncing?: boolean;
  codeGraphIsAnalyzingDomain?: boolean;
  onCodeGraphSwitchLens?: (lensId: string) => void;
  onCodeGraphFocusNode?: (nodeId: string) => void;
  onCodeGraphFocusUp?: () => void;
  onCodeGraphFocusRoot?: () => void;
  onCodeGraphNavigateBreadcrumb?: (index: number) => void;
  onCodeGraphSync?: () => void;
  onCodeGraphGetAnomalies?: () => CodeGraphAnomaly[];
  onCodeGraphDelete?: () => void;
  onCodeGraphRename?: (name: string) => void;
  onCodeGraphSelectNode?: (nodeId: string) => void;
  onCodeGraphDeselectNode?: () => void;
  onCodeGraphAnalyzeDomain?: () => void;
  onCodeGraphOpenConfig?: () => void;
  onCodeGraphViewCode?: (nodeId: string) => void;
  // CodeGraph flows
  codeGraphContextualFlows?: GraphFlow[];
  codeGraphActiveFlow?: GraphFlow | null;
  codeGraphActiveFlowId?: string | null;
  onCodeGraphSelectFlow?: (flowId: string) => void;
  onCodeGraphDeselectFlow?: () => void;
  // CodeGraph flow generation
  codeGraphIsGeneratingFlows?: boolean;
  onCodeGraphRegenerateFlows?: (options?: { scopeNodeId?: string; customPrompt?: string }) => void;
  // Progress Log
  progressLogEntries?: ProgressLogEntry[];
  isProgressLogActive?: boolean;
  isProgressLogExpanded?: boolean;
  onToggleProgressLog?: () => void;
  onDismissProgressLog?: () => void;
  // Source CodeGraph context (when viewing an exported flow diagram)
  sourceGraph?: CodeGraph | null;
  onGoToSourceGraph?: (graphId: string) => void;
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
  codeGraphFocusNodeId,
  codeGraphSelectedNodeId,
  codeGraphSelectedNode,
  codeGraphBreadcrumbStack = [],
  codeGraphIsSyncing = false,
  codeGraphIsAnalyzingDomain = false,
  onCodeGraphSwitchLens,
  onCodeGraphFocusNode,
  onCodeGraphFocusUp,
  onCodeGraphFocusRoot,
  onCodeGraphNavigateBreadcrumb,
  onCodeGraphSync,
  onCodeGraphGetAnomalies,
  onCodeGraphDelete,
  onCodeGraphRename,
  onCodeGraphSelectNode,
  onCodeGraphDeselectNode,
  onCodeGraphAnalyzeDomain,
  onCodeGraphOpenConfig,
  onCodeGraphViewCode,
  codeGraphContextualFlows = [],
  codeGraphActiveFlow = null,
  codeGraphActiveFlowId = null,
  onCodeGraphSelectFlow,
  onCodeGraphDeselectFlow,
  codeGraphIsGeneratingFlows = false,
  onCodeGraphRegenerateFlows,
  progressLogEntries = [],
  isProgressLogActive = false,
  isProgressLogExpanded = false,
  onToggleProgressLog,
  onDismissProgressLog,
  sourceGraph,
  onGoToSourceGraph,
}) => {
  const { codePanelWidthPercent, isDraggingCodePanel, handleCodePanelMouseDown } = useCodePanelResize(containerRef);

  const isCodeGraphMode = !!codeGraph;

  return (
    <main
      ref={containerRef}
      className="flex-1 overflow-hidden flex flex-col relative bg-[#0d0d0d]"
    >
      {activeDiagram || isCodeGraphMode ? (
        <>
          {/* Source CodeGraph context bar — shown when diagram was exported from a flow */}
          {!isCodeGraphMode && activeDiagram?.sourceGraphId && sourceGraph && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-950/40 border-b border-cyan-900/40 text-xs flex-shrink-0">
              <GitBranch className="w-3.5 h-3.5 text-cyan-500 flex-shrink-0" />
              <span className="text-gray-500">Code Graph</span>
              <ChevronRight className="w-3 h-3 text-gray-700 flex-shrink-0" />
              <span className="text-cyan-400 font-medium">{sourceGraph.name}</span>
              <ChevronRight className="w-3 h-3 text-gray-700 flex-shrink-0" />
              <span className="text-gray-300 truncate">{activeDiagram.name}</span>
              {activeDiagram.description && (
                <span className="text-gray-600 truncate hidden md:block">— {activeDiagram.description}</span>
              )}
              {onGoToSourceGraph && (
                <button
                  onClick={() => onGoToSourceGraph(sourceGraph.id)}
                  className="ml-auto flex items-center gap-1 text-cyan-500 hover:text-cyan-300 font-medium transition-colors flex-shrink-0"
                  title="Open this Code Graph"
                >
                  <span>Open Code Graph</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          {/* Left Pane: Editor or CodeGraphPanel */}
          {isCodeGraphMode && codeGraph ? (
            <div className="w-72 flex-shrink-0 h-1/2 lg:h-full overflow-hidden">
              <CodeGraphPanel
                graph={codeGraph}
                activeLens={codeGraphLens || null}
                focusNodeId={codeGraphFocusNodeId || null}
                breadcrumbStack={codeGraphBreadcrumbStack}
                selectedNode={codeGraphSelectedNode || null}
                isSyncing={codeGraphIsSyncing}
                isAnalyzingDomain={codeGraphIsAnalyzingDomain}
                onSwitchLens={onCodeGraphSwitchLens || (() => {})}
                onFocusNode={onCodeGraphFocusNode || (() => {})}
                onFocusUp={onCodeGraphFocusUp || (() => {})}
                onFocusRoot={onCodeGraphFocusRoot || (() => {})}
                onNavigateBreadcrumb={onCodeGraphNavigateBreadcrumb || (() => {})}
                onSyncGraph={onCodeGraphSync || (() => {})}
                onGetAnomalies={onCodeGraphGetAnomalies || (() => [])}
                onDeleteGraph={onCodeGraphDelete || (() => {})}
                onRenameGraph={onCodeGraphRename || (() => {})}
                onAnalyzeDomain={onCodeGraphAnalyzeDomain || (() => {})}
                onOpenConfig={onCodeGraphOpenConfig || (() => {})}
                onViewCode={onCodeGraphViewCode || (() => {})}
                contextualFlows={codeGraphContextualFlows}
                activeFlowId={codeGraphActiveFlowId}
                onSelectFlow={onCodeGraphSelectFlow || (() => {})}
                onDeselectFlow={onCodeGraphDeselectFlow || (() => {})}
                isGeneratingFlows={codeGraphIsGeneratingFlows}
                onRegenerateFlows={onCodeGraphRegenerateFlows}
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

          {/* Center Pane: Preview or Force Graph */}
          {isCodeGraphMode && codeGraph && codeGraphLens ? (
            <div className="flex-1 min-w-0 h-1/2 lg:h-full p-2">
              <CodeGraphVisualizer
                graph={codeGraph}
                lens={codeGraphLens}
                focusNodeId={codeGraphFocusNodeId || null}
                selectedNodeId={codeGraphSelectedNodeId || null}
                activeFlow={codeGraphActiveFlow}
                onNodeClick={onCodeGraphSelectNode || (() => {})}
                onNodeDoubleClick={onCodeGraphFocusNode || (() => {})}
                onBackgroundClick={onCodeGraphDeselectNode || (() => {})}
              />
            </div>
          ) : (
            <div className={`flex-1 min-w-0 h-1/2 lg:h-full p-4 bg-[#0d0d0d]`}>
              <Preview
                code={activeDiagram?.code || ''}
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
          )}

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
          {isAIChatOpen && !isCodeGraphMode && (
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
          </div>

          {/* Progress Log Panel */}
          {progressLogEntries.length > 0 && onToggleProgressLog && onDismissProgressLog && (
            <ProgressLogPanel
              entries={progressLogEntries}
              isActive={isProgressLogActive}
              isExpanded={isProgressLogExpanded}
              onToggleExpanded={onToggleProgressLog}
              onDismiss={onDismissProgressLog}
            />
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
