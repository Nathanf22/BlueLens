import React from 'react';
import { GlobalAIChatModal } from './GlobalAIChatModal';
import { NodeLinkManager } from './NodeLinkManager';
import { RepoManager } from './RepoManager';
import { CodeLinkManager } from './CodeLinkManager';
import { AISettingsModal } from './AISettingsModal';
import { ScanResultsPanel } from './ScanResultsPanel';
import { DiffViewModal } from './DiffViewModal';
import { DiagramAnalysisPanel } from './DiagramAnalysisPanel';
import { CodebaseImportModal } from './CodebaseImportModal';
import { CodeGraphConfigModal } from './CodeGraphConfigModal';
import { Diagram, ChatMessage, RepoConfig, LLMSettings, LLMProvider, LLMProviderConfig, ScanResult, SyncSuggestion, SyncMode, ScanConfig, DiagramAnalysis, CodebaseImportProgress, CodeGraphConfig } from '../types';

interface ModalManagerProps {
  isGlobalAIOpen: boolean;
  onCloseGlobalAI: () => void;
  globalChatMessages: ChatMessage[];
  isGlobalAILoading: boolean;
  onGlobalSend: (text: string) => void;
  onClearGlobalMessages: () => void;
  onApplyGlobalToDiagram: (code: string) => void;
  onCreateGlobalDiagram: (code: string) => void;
  hasActiveDiagram: boolean;
  llmSettings: LLMSettings;
  isNodeLinkManagerOpen: boolean;
  onCloseNodeLinkManager: () => void;
  currentDiagram: Diagram | undefined;
  allDiagrams: Diagram[];
  onAddLink: (nodeId: string, targetDiagramId: string, label?: string) => void;
  onRemoveLink: (nodeId: string) => void;
  // Repo Manager
  isRepoManagerOpen: boolean;
  onCloseRepoManager: () => void;
  repos: RepoConfig[];
  onAddRepo: () => void;
  onAddGithubRepo: (url: string) => boolean;
  hasConfiguredAI: boolean;
  onRemoveRepo: (repoId: string) => void;
  onReopenRepo: (repoId: string) => void;
  // Code Link Manager
  isCodeLinkManagerOpen: boolean;
  onCloseCodeLinkManager: () => void;
  onAddCodeLink: (nodeId: string, repoId: string, filePath: string, lineStart?: number, lineEnd?: number, label?: string) => void;
  onRemoveCodeLink: (nodeId: string) => void;
  // AI Settings
  isAISettingsOpen: boolean;
  onCloseAISettings: () => void;
  onUpdateProvider: (provider: LLMProvider, config: LLMProviderConfig | null) => void;
  onSetActiveProvider: (provider: LLMProvider) => void;
  // Scan Results
  isScanResultsOpen: boolean;
  onCloseScanResults: () => void;
  scanResult: ScanResult | null;
  isScanning: boolean;
  scanError: string | null;
  onRunScan: (repoId: string) => void;
  onAddMissing: (entityNames: string[]) => void;
  syncMode: SyncMode;
  onSetSyncMode: (mode: SyncMode) => void;
  onApplySuggestion: (suggestion: SyncSuggestion) => void;
  onApplyAllSuggestions: (suggestions: SyncSuggestion[]) => void;
  onUpdateScanConfig?: (repoId: string, config: ScanConfig) => void;
  // Diff View
  isDiffViewOpen: boolean;
  onCloseDiffView: () => void;
  diffViewOriginal: string;
  diffViewModified: string;
  onApplyDiff: (code: string) => void;
  // Diagram Analysis
  isAnalysisPanelOpen: boolean;
  onCloseAnalysisPanel: () => void;
  diagramAnalysis: DiagramAnalysis | null;
  // Codebase Import
  isCodebaseImportOpen: boolean;
  onCloseCodebaseImport: () => void;
  onStartCodebaseImport: (repoId: string) => void;
  codebaseImportProgress: CodebaseImportProgress | null;
  isCodebaseImporting: boolean;
  onResetCodebaseImport: () => void;
  // Create Code Graph trigger from RepoManager
  onCreateGraph?: (repoId: string) => Promise<any>;
  // CodeGraph Config
  isCodeGraphConfigOpen: boolean;
  onCloseCodeGraphConfig: () => void;
  codeGraphConfig: CodeGraphConfig | null;
  onSaveCodeGraphConfig: (config: CodeGraphConfig) => void;
  codeGraphRepoId: string;
  codeGraphId: string;
}

export const ModalManager: React.FC<ModalManagerProps> = ({
  isGlobalAIOpen,
  onCloseGlobalAI,
  globalChatMessages,
  isGlobalAILoading,
  onGlobalSend,
  onClearGlobalMessages,
  onApplyGlobalToDiagram,
  onCreateGlobalDiagram,
  hasActiveDiagram,
  llmSettings,
  isNodeLinkManagerOpen,
  onCloseNodeLinkManager,
  currentDiagram,
  allDiagrams,
  onAddLink,
  onRemoveLink,
  isRepoManagerOpen,
  onCloseRepoManager,
  repos,
  onAddRepo,
  onAddGithubRepo,
  hasConfiguredAI,
  onRemoveRepo,
  onReopenRepo,
  isCodeLinkManagerOpen,
  onCloseCodeLinkManager,
  onAddCodeLink,
  onRemoveCodeLink,
  isAISettingsOpen,
  onCloseAISettings,
  onUpdateProvider,
  onSetActiveProvider,
  isScanResultsOpen,
  onCloseScanResults,
  scanResult,
  isScanning,
  scanError,
  onRunScan,
  onAddMissing,
  syncMode,
  onSetSyncMode,
  onApplySuggestion,
  onApplyAllSuggestions,
  onUpdateScanConfig,
  isDiffViewOpen,
  onCloseDiffView,
  diffViewOriginal,
  diffViewModified,
  onApplyDiff,
  isAnalysisPanelOpen,
  onCloseAnalysisPanel,
  diagramAnalysis,
  isCodebaseImportOpen,
  onCloseCodebaseImport,
  onStartCodebaseImport,
  codebaseImportProgress,
  isCodebaseImporting,
  onResetCodebaseImport,
  onCreateGraph,
  isCodeGraphConfigOpen,
  onCloseCodeGraphConfig,
  codeGraphConfig,
  onSaveCodeGraphConfig,
  codeGraphRepoId,
  codeGraphId,
}) => {
  return (
    <>
      {/* Global AI Chat Modal */}
      <GlobalAIChatModal
        isOpen={isGlobalAIOpen}
        onClose={onCloseGlobalAI}
        messages={globalChatMessages}
        isLoading={isGlobalAILoading}
        onSend={onGlobalSend}
        onClearMessages={onClearGlobalMessages}
        onApplyToDiagram={onApplyGlobalToDiagram}
        onCreateDiagram={onCreateGlobalDiagram}
        hasActiveDiagram={hasActiveDiagram}
        activeProvider={llmSettings.activeProvider}
      />

      {/* Node Link Manager Modal */}
      {isNodeLinkManagerOpen && currentDiagram && (
        <NodeLinkManager
          currentDiagram={currentDiagram}
          allDiagrams={allDiagrams}
          onAddLink={onAddLink}
          onRemoveLink={onRemoveLink}
          onClose={onCloseNodeLinkManager}
        />
      )}

      {/* Repo Manager Modal */}
      {isRepoManagerOpen && (
        <RepoManager
          repos={repos}
          onAddRepo={onAddRepo}
          onAddGithubRepo={onAddGithubRepo}
          hasConfiguredAI={hasConfiguredAI}
          onRemoveRepo={onRemoveRepo}
          onReopenRepo={onReopenRepo}
          onClose={onCloseRepoManager}
          onCreateGraph={onCreateGraph}
        />
      )}

      {/* Code Link Manager Modal */}
      {isCodeLinkManagerOpen && currentDiagram && (
        <CodeLinkManager
          currentDiagram={currentDiagram}
          repos={repos}
          onAddCodeLink={onAddCodeLink}
          onRemoveCodeLink={onRemoveCodeLink}
          onClose={onCloseCodeLinkManager}
        />
      )}

      {/* AI Settings Modal */}
      <AISettingsModal
        isOpen={isAISettingsOpen}
        onClose={onCloseAISettings}
        llmSettings={llmSettings}
        onUpdateProvider={onUpdateProvider}
        onSetActiveProvider={onSetActiveProvider}
      />

      {/* Scan Results Panel */}
      <ScanResultsPanel
        isOpen={isScanResultsOpen}
        onClose={onCloseScanResults}
        repos={repos}
        scanResult={scanResult}
        isScanning={isScanning}
        scanError={scanError}
        onRunScan={onRunScan}
        onAddMissing={onAddMissing}
        syncMode={syncMode}
        onSetSyncMode={onSetSyncMode}
        onApplySuggestion={onApplySuggestion}
        onApplyAllSuggestions={onApplyAllSuggestions}
        onUpdateScanConfig={onUpdateScanConfig}
      />

      {/* Diff View Modal */}
      <DiffViewModal
        isOpen={isDiffViewOpen}
        onClose={onCloseDiffView}
        originalCode={diffViewOriginal}
        modifiedCode={diffViewModified}
        onApply={onApplyDiff}
      />

      {/* Diagram Analysis Panel */}
      <DiagramAnalysisPanel
        analysis={diagramAnalysis}
        isOpen={isAnalysisPanelOpen}
        onClose={onCloseAnalysisPanel}
      />

      {/* Codebase Import Modal */}
      <CodebaseImportModal
        isOpen={isCodebaseImportOpen}
        onClose={onCloseCodebaseImport}
        repos={repos}
        onStartImport={onStartCodebaseImport}
        progress={codebaseImportProgress}
        isImporting={isCodebaseImporting}
        onReset={onResetCodebaseImport}
      />

      {/* CodeGraph Config Modal */}
      <CodeGraphConfigModal
        isOpen={isCodeGraphConfigOpen}
        onClose={onCloseCodeGraphConfig}
        config={codeGraphConfig}
        onSave={onSaveCodeGraphConfig}
        repoId={codeGraphRepoId}
        graphId={codeGraphId}
      />
    </>
  );
};
