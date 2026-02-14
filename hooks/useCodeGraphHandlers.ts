/**
 * CRUD handlers for CodeGraph entities.
 * Follows the same pattern as useDiagramHandlers, useFolderHandlers, etc.
 */

import { useCallback } from 'react';
import { CodeGraph, GraphNode, GraphNodeKind, GraphDepth, RelationType } from '../types';
import { codeGraphModelService } from '../services/codeGraphModelService';

export const useCodeGraphHandlers = (
  activeGraph: CodeGraph | null,
  updateGraph: (graph: CodeGraph) => void
) => {
  const handleRenameCodeGraph = useCallback((name: string) => {
    if (!activeGraph) return;
    updateGraph({ ...activeGraph, name, updatedAt: Date.now() });
  }, [activeGraph, updateGraph]);

  const handleEditNode = useCallback((nodeId: string, updates: Partial<Pick<GraphNode, 'name' | 'tags'>>) => {
    if (!activeGraph) return;
    const node = activeGraph.nodes[nodeId];
    if (!node) return;

    const updatedNode = { ...node, ...updates };
    const nodes = { ...activeGraph.nodes, [nodeId]: updatedNode };
    updateGraph({ ...activeGraph, nodes, updatedAt: Date.now() });
  }, [activeGraph, updateGraph]);

  const handleAddManualNode = useCallback((
    parentId: string,
    name: string,
    kind: GraphNodeKind,
    depth: GraphDepth
  ) => {
    if (!activeGraph) return;

    const node: Omit<GraphNode, 'id'> = {
      name,
      kind,
      depth,
      parentId,
      children: [],
      sourceRef: null,
      tags: ['manual'],
      lensConfig: {},
      domainProjections: [],
    };

    const { graph: g1, nodeId } = codeGraphModelService.addNode(activeGraph, node);
    const { graph: g2 } = codeGraphModelService.addRelation(g1, parentId, nodeId, 'contains');
    updateGraph(g2);
  }, [activeGraph, updateGraph]);

  const handleRemoveNode = useCallback((nodeId: string) => {
    if (!activeGraph) return;
    if (nodeId === activeGraph.rootNodeId) return; // Can't remove root
    const updated = codeGraphModelService.removeNode(activeGraph, nodeId);
    updateGraph(updated);
  }, [activeGraph, updateGraph]);

  const handleAddRelation = useCallback((
    sourceId: string,
    targetId: string,
    type: RelationType,
    label?: string
  ) => {
    if (!activeGraph) return;
    const { graph } = codeGraphModelService.addRelation(activeGraph, sourceId, targetId, type, label);
    updateGraph(graph);
  }, [activeGraph, updateGraph]);

  const handleRemoveRelation = useCallback((relationId: string) => {
    if (!activeGraph) return;
    const updated = codeGraphModelService.removeRelation(activeGraph, relationId);
    updateGraph(updated);
  }, [activeGraph, updateGraph]);

  return {
    handleRenameCodeGraph,
    handleEditNode,
    handleAddManualNode,
    handleRemoveNode,
    handleAddRelation,
    handleRemoveRelation,
  };
};
