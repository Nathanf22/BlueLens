import React from 'react';
import { AIGeneratorModal } from './AIGeneratorModal';
import { NodeLinkManager } from './NodeLinkManager';
import { RepoManager } from './RepoManager';
import { CodeLinkManager } from './CodeLinkManager';
import { Diagram, RepoConfig } from '../types';

interface ModalManagerProps {
  isAIModalOpen: boolean;
  onCloseAIModal: () => void;
  onGenerate: (newCode: string) => void;
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
}

export const ModalManager: React.FC<ModalManagerProps> = ({
  isAIModalOpen,
  onCloseAIModal,
  onGenerate,
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
  onRemoveCodeLink
}) => {
  return (
    <>
      {/* AI Generator Modal */}
      <AIGeneratorModal
        isOpen={isAIModalOpen}
        onClose={onCloseAIModal}
        onGenerate={onGenerate}
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
    </>
  );
};
