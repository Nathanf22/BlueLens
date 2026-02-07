import React from 'react';
import { AIGeneratorModal } from './AIGeneratorModal';
import { NodeLinkManager } from './NodeLinkManager';
import { RepoManager } from './RepoManager';
import { CodeLinkManager } from './CodeLinkManager';
import { AISettingsModal } from './AISettingsModal';
import { ScanResultsPanel } from './ScanResultsPanel';
import { Diagram, RepoConfig, LLMSettings, LLMProvider, LLMProviderConfig, ScanResult } from '../types';

interface ModalManagerProps {
  isAIModalOpen: boolean;
  onCloseAIModal: () => void;
  onGenerate: (newCode: string) => void;
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
}

export const ModalManager: React.FC<ModalManagerProps> = ({
  isAIModalOpen,
  onCloseAIModal,
  onGenerate,
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
}) => {
  return (
    <>
      {/* AI Generator Modal */}
      <AIGeneratorModal
        isOpen={isAIModalOpen}
        onClose={onCloseAIModal}
        onGenerate={onGenerate}
        llmSettings={llmSettings}
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
          onRemoveRepo={onRemoveRepo}
          onReopenRepo={onReopenRepo}
          onClose={onCloseRepoManager}
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
      />
    </>
  );
};
