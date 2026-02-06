import React from 'react';
import { AIGeneratorModal } from './AIGeneratorModal';
import { NodeLinkManager } from './NodeLinkManager';
import { Diagram } from '../types';

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
  onRemoveLink
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
    </>
  );
};
