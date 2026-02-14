/**
 * CodeGraph model service — CRUD, validation, and querying for the graph data structure.
 */

import {
  CodeGraph, GraphNode, GraphRelation, ViewLens, ViewLensType,
  GraphDepth, GraphNodeKind, RelationType, CodeGraphAnomaly,
  DomainNode, DomainRelation,
} from '../types';

const generateId = () => Math.random().toString(36).substr(2, 9);

// --- Default Lenses ---

function getDefaultLenses(): ViewLens[] {
  const componentLens: ViewLens = {
    id: 'lens-component',
    name: 'Component',
    type: 'component',
    nodeFilter: {
      kinds: ['system', 'package', 'module', 'class', 'interface'],
      minDepth: 0,
      maxDepth: 3,
    },
    relationFilter: {
      types: ['contains', 'depends_on', 'implements', 'inherits'],
    },
    styleRules: [
      { match: { kind: ['system'] }, shape: 'rounded', style: 'fill:#1e3a5f,stroke:#3b82f6,color:#93c5fd' },
      { match: { kind: ['package'] }, shape: 'rounded', style: 'fill:#1e3a2f,stroke:#22c55e,color:#86efac' },
      { match: { kind: ['module'] }, shape: 'default', style: 'fill:#2d2d3d,stroke:#8b5cf6,color:#c4b5fd' },
      { match: { kind: ['class', 'interface'] }, shape: 'stadium', style: 'fill:#3d2d2d,stroke:#f97316,color:#fdba74' },
    ],
    layoutHint: 'TD',
  };

  const flowLens: ViewLens = {
    id: 'lens-flow',
    name: 'Flow',
    type: 'flow',
    nodeFilter: {
      kinds: ['package', 'module', 'class', 'function'],
      minDepth: 1,
      maxDepth: 3,
    },
    relationFilter: {
      types: ['calls', 'emits', 'subscribes', 'depends_on'],
    },
    styleRules: [
      { match: { kind: ['function'] }, shape: 'stadium', style: 'fill:#1e3a5f,stroke:#3b82f6,color:#93c5fd' },
      { match: { kind: ['class'] }, shape: 'rounded', style: 'fill:#3d2d2d,stroke:#f97316,color:#fdba74' },
    ],
    layoutHint: 'LR',
  };

  const domainLens: ViewLens = {
    id: 'lens-domain',
    name: 'Domain',
    type: 'domain',
    nodeFilter: {
      minDepth: 0,
      maxDepth: 4,
    },
    relationFilter: {},
    styleRules: [
      { match: { kind: ['system'] }, shape: 'rounded', style: 'fill:#1e3a5f,stroke:#60a5fa,color:#93c5fd' },
    ],
    layoutHint: 'TD',
  };

  return [componentLens, flowLens, domainLens];
}

// --- Graph Creation ---

function createEmptyGraph(workspaceId: string, repoId: string, name: string): CodeGraph {
  const lenses = getDefaultLenses();
  const rootId = generateId();
  const now = Date.now();

  const rootNode: GraphNode = {
    id: rootId,
    name,
    kind: 'system',
    depth: 0,
    parentId: null,
    children: [],
    sourceRef: null,
    tags: [],
    lensConfig: {},
    domainProjections: [],
  };

  return {
    id: generateId(),
    name,
    workspaceId,
    repoId,
    createdAt: now,
    updatedAt: now,
    nodes: { [rootId]: rootNode },
    relations: {},
    domainNodes: {},
    domainRelations: {},
    lenses,
    activeLensId: lenses[0].id,
    syncLock: {},
    rootNodeId: rootId,
  };
}

// --- Node CRUD ---

function addNode(graph: CodeGraph, node: Omit<GraphNode, 'id'> & { id?: string }): { graph: CodeGraph; nodeId: string } {
  const nodeId = node.id || generateId();
  const newNode: GraphNode = { ...node, id: nodeId };

  const nodes = { ...graph.nodes, [nodeId]: newNode };

  // Add to parent's children
  if (newNode.parentId && nodes[newNode.parentId]) {
    const parent = nodes[newNode.parentId];
    nodes[newNode.parentId] = {
      ...parent,
      children: [...parent.children, nodeId],
    };
  }

  return {
    graph: { ...graph, nodes, updatedAt: Date.now() },
    nodeId,
  };
}

function removeNode(graph: CodeGraph, nodeId: string): CodeGraph {
  const node = graph.nodes[nodeId];
  if (!node) return graph;

  // Collect all descendant IDs
  const toRemove = new Set<string>();
  const collect = (id: string) => {
    toRemove.add(id);
    const n = graph.nodes[id];
    if (n) n.children.forEach(collect);
  };
  collect(nodeId);

  // Remove nodes
  const nodes = { ...graph.nodes };
  for (const id of toRemove) {
    delete nodes[id];
  }

  // Remove from parent's children
  if (node.parentId && nodes[node.parentId]) {
    const parent = nodes[node.parentId];
    nodes[node.parentId] = {
      ...parent,
      children: parent.children.filter(c => c !== nodeId),
    };
  }

  // Remove relations referencing removed nodes
  const relations = { ...graph.relations };
  for (const [relId, rel] of Object.entries(relations)) {
    if (toRemove.has(rel.sourceId) || toRemove.has(rel.targetId)) {
      delete relations[relId];
    }
  }

  // Remove syncLock entries
  const syncLock = { ...graph.syncLock };
  for (const id of toRemove) {
    delete syncLock[id];
  }

  return { ...graph, nodes, relations, syncLock, updatedAt: Date.now() };
}

// --- Relation CRUD ---

function addRelation(
  graph: CodeGraph,
  sourceId: string,
  targetId: string,
  type: RelationType,
  label?: string
): { graph: CodeGraph; relationId: string } {
  const relationId = generateId();
  // Default all lenses to visible
  const lensVisibility: Record<string, boolean> = {};
  for (const lens of graph.lenses) {
    lensVisibility[lens.id] = true;
  }

  const relation: GraphRelation = {
    id: relationId,
    sourceId,
    targetId,
    type,
    label,
    lensVisibility,
  };

  return {
    graph: {
      ...graph,
      relations: { ...graph.relations, [relationId]: relation },
      updatedAt: Date.now(),
    },
    relationId,
  };
}

function removeRelation(graph: CodeGraph, relationId: string): CodeGraph {
  const relations = { ...graph.relations };
  delete relations[relationId];
  return { ...graph, relations, updatedAt: Date.now() };
}

// --- Tree Traversal ---

function getChildren(graph: CodeGraph, nodeId: string): GraphNode[] {
  const node = graph.nodes[nodeId];
  if (!node) return [];
  return node.children.map(id => graph.nodes[id]).filter(Boolean);
}

function getDescendants(graph: CodeGraph, nodeId: string): GraphNode[] {
  const result: GraphNode[] = [];
  const visit = (id: string) => {
    const node = graph.nodes[id];
    if (!node) return;
    for (const childId of node.children) {
      const child = graph.nodes[childId];
      if (child) {
        result.push(child);
        visit(childId);
      }
    }
  };
  visit(nodeId);
  return result;
}

function getAncestors(graph: CodeGraph, nodeId: string): GraphNode[] {
  const result: GraphNode[] = [];
  let current = graph.nodes[nodeId];
  while (current?.parentId) {
    const parent = graph.nodes[current.parentId];
    if (!parent) break;
    result.push(parent);
    current = parent;
  }
  return result;
}

// --- Lens-Filtered Queries ---

function getVisibleNodes(
  graph: CodeGraph,
  lens: ViewLens,
  focusNodeId?: string,
  depth?: { min?: GraphDepth; max?: GraphDepth }
): GraphNode[] {
  const allNodes = Object.values(graph.nodes);

  // If domain lens, return all (domain rendering handled separately)
  if (lens.type === 'domain') {
    return allNodes;
  }

  return allNodes.filter(node => {
    // Per-node lens override
    const override = node.lensConfig[lens.id];
    if (override?.visible === false) return false;

    // Kind filter
    if (lens.nodeFilter.kinds && !lens.nodeFilter.kinds.includes(node.kind)) return false;

    // Depth filter (lens defaults, overridden by explicit depth param)
    const minD = depth?.min ?? lens.nodeFilter.minDepth ?? 0;
    const maxD = depth?.max ?? lens.nodeFilter.maxDepth ?? 4;
    if (node.depth < minD || node.depth > maxD) return false;

    // Tag filter
    if (lens.nodeFilter.tags && lens.nodeFilter.tags.length > 0) {
      if (!lens.nodeFilter.tags.some(tag => node.tags.includes(tag))) return false;
    }

    // Focus: if a focus node is set, only show descendants + ancestors
    if (focusNodeId && focusNodeId !== graph.rootNodeId) {
      const focusNode = graph.nodes[focusNodeId];
      if (!focusNode) return true;

      // Show the focus node itself
      if (node.id === focusNodeId) return true;

      // Show ancestors of focus (for context/subgraph nesting)
      const ancestors = getAncestors(graph, focusNodeId);
      if (ancestors.some(a => a.id === node.id)) return true;

      // Show descendants of focus
      const descendants = getDescendants(graph, focusNodeId);
      if (descendants.some(d => d.id === node.id)) return true;

      return false;
    }

    return true;
  });
}

function getVisibleRelations(
  graph: CodeGraph,
  lens: ViewLens,
  visibleNodeIds: Set<string>
): GraphRelation[] {
  return Object.values(graph.relations).filter(rel => {
    // Both endpoints must be visible
    if (!visibleNodeIds.has(rel.sourceId) || !visibleNodeIds.has(rel.targetId)) return false;

    // Per-relation lens visibility
    if (rel.lensVisibility[lens.id] === false) return false;

    // Relation type filter
    if (lens.relationFilter.types && !lens.relationFilter.types.includes(rel.type)) return false;

    return true;
  });
}

// --- Validation ---

function validateGraph(graph: CodeGraph): CodeGraphAnomaly[] {
  const anomalies: CodeGraphAnomaly[] = [];
  const nodes = Object.values(graph.nodes);
  const relations = Object.values(graph.relations);

  // Orphan nodes (no parent, not root)
  for (const node of nodes) {
    if (node.id === graph.rootNodeId) continue;
    if (!node.parentId || !graph.nodes[node.parentId]) {
      anomalies.push({
        type: 'orphan_node',
        severity: 'warning',
        message: `Node "${node.name}" has no valid parent`,
        nodeIds: [node.id],
      });
    }
  }

  // Broken references in relations
  for (const rel of relations) {
    if (!graph.nodes[rel.sourceId] || !graph.nodes[rel.targetId]) {
      anomalies.push({
        type: 'broken_reference',
        severity: 'error',
        message: `Relation "${rel.type}" references missing node(s)`,
        nodeIds: [rel.sourceId, rel.targetId].filter(id => !graph.nodes[id]),
        relationIds: [rel.id],
      });
    }
  }

  // Circular dependencies (non-"contains" relations)
  const depEdges = relations.filter(r => r.type !== 'contains');
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(nodeId: string, path: string[]): void {
    if (inStack.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId);
      const cycle = path.slice(cycleStart);
      anomalies.push({
        type: 'circular_dependency',
        severity: 'warning',
        message: `Circular dependency: ${cycle.map(id => graph.nodes[id]?.name || id).join(' → ')}`,
        nodeIds: cycle,
      });
      return;
    }
    if (visited.has(nodeId)) return;

    visited.add(nodeId);
    inStack.add(nodeId);

    const outgoing = depEdges.filter(e => e.sourceId === nodeId);
    for (const edge of outgoing) {
      dfs(edge.targetId, [...path, nodeId]);
    }

    inStack.delete(nodeId);
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id, []);
    }
  }

  // High coupling (fan-out > 8)
  for (const node of nodes) {
    const fanOut = depEdges.filter(e => e.sourceId === node.id).length;
    if (fanOut > 8) {
      anomalies.push({
        type: 'high_coupling',
        severity: 'warning',
        message: `Node "${node.name}" has high fan-out (${fanOut} dependencies)`,
        nodeIds: [node.id],
      });
    }
  }

  // God nodes (fan-in > 10)
  for (const node of nodes) {
    const fanIn = depEdges.filter(e => e.targetId === node.id).length;
    if (fanIn > 10) {
      anomalies.push({
        type: 'god_node',
        severity: 'warning',
        message: `Node "${node.name}" has high fan-in (${fanIn} dependents) — potential god node`,
        nodeIds: [node.id],
      });
    }
  }

  return anomalies;
}

export const codeGraphModelService = {
  createEmptyGraph,
  addNode,
  removeNode,
  addRelation,
  removeRelation,
  getChildren,
  getDescendants,
  getAncestors,
  getVisibleNodes,
  getVisibleRelations,
  validateGraph,
  getDefaultLenses,
};
