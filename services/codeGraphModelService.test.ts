import { describe, it, expect } from 'vitest';
import { codeGraphModelService } from './codeGraphModelService';

const { createEmptyGraph, addNode, removeNode, addRelation, removeRelation,
        getChildren, getDescendants, getAncestors, getVisibleNodes,
        getVisibleRelations, validateGraph, getDefaultLenses } = codeGraphModelService;

// ── Helpers ──────────────────────────────────────────────────────────

function makeGraph() {
  return createEmptyGraph('ws-1', 'repo-1', 'TestSystem');
}

function makeNode(
  graph: ReturnType<typeof makeGraph>,
  name: string,
  kind: Parameters<typeof addNode>[1]['kind'],
  depth: Parameters<typeof addNode>[1]['depth'],
  parentId: string | null
) {
  return addNode(graph, {
    name,
    kind,
    depth,
    parentId,
    children: [],
    sourceRef: null,
    tags: [],
    lensConfig: {},
    domainProjections: [],
  });
}

// ── createEmptyGraph ─────────────────────────────────────────────────

describe('createEmptyGraph', () => {
  it('creates a graph with a root system node', () => {
    const g = makeGraph();
    expect(g.name).toBe('TestSystem');
    expect(g.workspaceId).toBe('ws-1');
    expect(g.repoId).toBe('repo-1');
    const root = g.nodes[g.rootNodeId];
    expect(root).toBeDefined();
    expect(root.kind).toBe('system');
    expect(root.depth).toBe(0);
    expect(root.parentId).toBeNull();
  });

  it('includes 3 default lenses', () => {
    const g = makeGraph();
    expect(g.lenses).toHaveLength(3);
    expect(g.lenses.map(l => l.type)).toEqual(
      expect.arrayContaining(['component', 'flow', 'domain'])
    );
  });

  it('sets activeLensId to first lens', () => {
    const g = makeGraph();
    expect(g.activeLensId).toBe(g.lenses[0].id);
  });
});

// ── addNode ──────────────────────────────────────────────────────────

describe('addNode', () => {
  it('adds a node and returns its id', () => {
    const g = makeGraph();
    const { graph: g2, nodeId } = makeNode(g, 'ServiceA', 'package', 1, g.rootNodeId);
    expect(g2.nodes[nodeId]).toBeDefined();
    expect(g2.nodes[nodeId].name).toBe('ServiceA');
  });

  it('registers node as child of parent', () => {
    const g = makeGraph();
    const { graph: g2, nodeId } = makeNode(g, 'ServiceA', 'package', 1, g.rootNodeId);
    expect(g2.nodes[g.rootNodeId].children).toContain(nodeId);
  });

  it('does not mutate the original graph', () => {
    const g = makeGraph();
    const originalChildCount = g.nodes[g.rootNodeId].children.length;
    makeNode(g, 'ServiceA', 'package', 1, g.rootNodeId);
    expect(g.nodes[g.rootNodeId].children).toHaveLength(originalChildCount);
  });

  it('uses provided id when specified', () => {
    const g = makeGraph();
    const { nodeId } = addNode(g, {
      id: 'custom-id',
      name: 'X',
      kind: 'module',
      depth: 1,
      parentId: g.rootNodeId,
      children: [],
      sourceRef: null,
      tags: [],
      lensConfig: {},
      domainProjections: [],
    });
    expect(nodeId).toBe('custom-id');
  });
});

// ── removeNode ───────────────────────────────────────────────────────

describe('removeNode', () => {
  it('removes the node and its descendants', () => {
    const g = makeGraph();
    const { graph: g2, nodeId: pkgId } = makeNode(g, 'Pkg', 'package', 1, g.rootNodeId);
    const { graph: g3, nodeId: modId } = makeNode(g2, 'Mod', 'module', 2, pkgId);
    const g4 = removeNode(g3, pkgId);
    expect(g4.nodes[pkgId]).toBeUndefined();
    expect(g4.nodes[modId]).toBeUndefined();
  });

  it('removes node from parent children list', () => {
    const g = makeGraph();
    const { graph: g2, nodeId } = makeNode(g, 'Pkg', 'package', 1, g.rootNodeId);
    const g3 = removeNode(g2, nodeId);
    expect(g3.nodes[g.rootNodeId].children).not.toContain(nodeId);
  });

  it('removes relations referencing the removed node', () => {
    const g = makeGraph();
    const { graph: g2, nodeId: a } = makeNode(g, 'A', 'module', 1, g.rootNodeId);
    const { graph: g3, nodeId: b } = makeNode(g2, 'B', 'module', 1, g.rootNodeId);
    const { graph: g4, relationId } = addRelation(g3, a, b, 'depends_on');
    const g5 = removeNode(g4, a);
    expect(g5.relations[relationId]).toBeUndefined();
  });

  it('returns the same graph when node does not exist', () => {
    const g = makeGraph();
    const g2 = removeNode(g, 'non-existent');
    expect(g2).toBe(g);
  });
});

// ── addRelation / removeRelation ─────────────────────────────────────

describe('addRelation', () => {
  it('adds a relation between two nodes', () => {
    const g = makeGraph();
    const { graph: g2, nodeId: a } = makeNode(g, 'A', 'module', 1, g.rootNodeId);
    const { graph: g3, nodeId: b } = makeNode(g2, 'B', 'module', 1, g.rootNodeId);
    const { graph: g4, relationId } = addRelation(g3, a, b, 'calls', 'calls B');
    const rel = g4.relations[relationId];
    expect(rel.sourceId).toBe(a);
    expect(rel.targetId).toBe(b);
    expect(rel.type).toBe('calls');
    expect(rel.label).toBe('calls B');
  });

  it('initialises lensVisibility to true for all lenses', () => {
    const g = makeGraph();
    const { graph: g2, nodeId: a } = makeNode(g, 'A', 'module', 1, g.rootNodeId);
    const { graph: g3, nodeId: b } = makeNode(g2, 'B', 'module', 1, g.rootNodeId);
    const { graph: g4, relationId } = addRelation(g3, a, b, 'depends_on');
    const vis = g4.relations[relationId].lensVisibility;
    for (const lens of g4.lenses) {
      expect(vis[lens.id]).toBe(true);
    }
  });
});

describe('removeRelation', () => {
  it('removes a relation by id', () => {
    const g = makeGraph();
    const { graph: g2, nodeId: a } = makeNode(g, 'A', 'module', 1, g.rootNodeId);
    const { graph: g3, nodeId: b } = makeNode(g2, 'B', 'module', 1, g.rootNodeId);
    const { graph: g4, relationId } = addRelation(g3, a, b, 'depends_on');
    const g5 = removeRelation(g4, relationId);
    expect(g5.relations[relationId]).toBeUndefined();
  });
});

// ── Tree traversal ───────────────────────────────────────────────────

describe('getChildren', () => {
  it('returns direct children only', () => {
    const g = makeGraph();
    const { graph: g2, nodeId: pkgId } = makeNode(g, 'Pkg', 'package', 1, g.rootNodeId);
    makeNode(g2, 'Mod', 'module', 2, pkgId); // grandchild of root
    const children = getChildren(g2, g.rootNodeId);
    expect(children).toHaveLength(1);
    expect(children[0].id).toBe(pkgId);
  });

  it('returns empty array for unknown node', () => {
    expect(getChildren(makeGraph(), 'ghost')).toEqual([]);
  });
});

describe('getDescendants', () => {
  it('returns all descendants recursively', () => {
    const g = makeGraph();
    const { graph: g2, nodeId: pkgId } = makeNode(g, 'Pkg', 'package', 1, g.rootNodeId);
    const { graph: g3, nodeId: modId } = makeNode(g2, 'Mod', 'module', 2, pkgId);
    const { graph: g4, nodeId: fnId } = makeNode(g3, 'Fn', 'function', 3, modId);
    const desc = getDescendants(g4, g.rootNodeId);
    expect(desc.map(n => n.id)).toEqual(expect.arrayContaining([pkgId, modId, fnId]));
    expect(desc).toHaveLength(3);
  });

  it('returns empty array for leaf node', () => {
    const g = makeGraph();
    const { graph: g2, nodeId } = makeNode(g, 'Leaf', 'function', 1, g.rootNodeId);
    expect(getDescendants(g2, nodeId)).toEqual([]);
  });
});

describe('getAncestors', () => {
  it('returns ancestors ordered from direct parent to root', () => {
    const g = makeGraph();
    const { graph: g2, nodeId: pkgId } = makeNode(g, 'Pkg', 'package', 1, g.rootNodeId);
    const { graph: g3, nodeId: modId } = makeNode(g2, 'Mod', 'module', 2, pkgId);
    const ancestors = getAncestors(g3, modId);
    expect(ancestors[0].id).toBe(pkgId);
    expect(ancestors[1].id).toBe(g.rootNodeId);
  });

  it('returns empty array for root node', () => {
    const g = makeGraph();
    expect(getAncestors(g, g.rootNodeId)).toEqual([]);
  });
});

// ── getVisibleNodes ──────────────────────────────────────────────────

describe('getVisibleNodes', () => {
  it('returns all nodes for domain lens', () => {
    const g = makeGraph();
    const { graph: g2 } = makeNode(g, 'Pkg', 'package', 1, g.rootNodeId);
    const domainLens = g2.lenses.find(l => l.type === 'domain')!;
    const visible = getVisibleNodes(g2, domainLens);
    expect(visible).toHaveLength(Object.keys(g2.nodes).length);
  });

  it('filters by kind for component lens', () => {
    const g = makeGraph();
    const { graph: g2 } = makeNode(g, 'Pkg', 'package', 1, g.rootNodeId);
    const { graph: g3 } = makeNode(g2, 'Fn', 'function', 1, g.rootNodeId);
    const componentLens = g3.lenses.find(l => l.type === 'component')!;
    // component lens includes 'system','package','module','class','interface' but NOT 'function'
    const visible = getVisibleNodes(g3, componentLens);
    const kinds = visible.map(n => n.kind);
    expect(kinds).not.toContain('function');
  });

  it('respects per-node lensConfig visibility override', () => {
    const lenses = getDefaultLenses();
    const componentLens = lenses.find(l => l.type === 'component')!;
    const g = makeGraph();
    const { graph: g2, nodeId } = addNode(g, {
      name: 'HiddenPkg',
      kind: 'package',
      depth: 1,
      parentId: g.rootNodeId,
      children: [],
      sourceRef: null,
      tags: [],
      lensConfig: { [componentLens.id]: { visible: false } },
      domainProjections: [],
    });
    const visible = getVisibleNodes(g2, componentLens);
    expect(visible.find(n => n.id === nodeId)).toBeUndefined();
  });
});

// ── getVisibleRelations ──────────────────────────────────────────────

describe('getVisibleRelations', () => {
  it('only includes relations where both endpoints are visible', () => {
    const g = makeGraph();
    const { graph: g2, nodeId: a } = makeNode(g, 'A', 'module', 1, g.rootNodeId);
    const { graph: g3, nodeId: b } = makeNode(g2, 'B', 'module', 1, g.rootNodeId);
    const { graph: g4, relationId } = addRelation(g3, a, b, 'depends_on');
    const componentLens = g4.lenses.find(l => l.type === 'component')!;
    // Both a and b are 'module' which is in componentLens kinds
    const visibleIds = new Set([a, b, g.rootNodeId]);
    const rels = getVisibleRelations(g4, componentLens, visibleIds);
    expect(rels.find(r => r.id === relationId)).toBeDefined();
  });

  it('hides relation when one endpoint is not in visibleNodeIds', () => {
    const g = makeGraph();
    const { graph: g2, nodeId: a } = makeNode(g, 'A', 'module', 1, g.rootNodeId);
    const { graph: g3, nodeId: b } = makeNode(g2, 'B', 'module', 1, g.rootNodeId);
    const { graph: g4, relationId } = addRelation(g3, a, b, 'depends_on');
    const componentLens = g4.lenses.find(l => l.type === 'component')!;
    const visibleIds = new Set([a]); // b is missing
    const rels = getVisibleRelations(g4, componentLens, visibleIds);
    expect(rels.find(r => r.id === relationId)).toBeUndefined();
  });
});

// ── validateGraph ────────────────────────────────────────────────────

describe('validateGraph', () => {
  it('returns no anomalies for a clean graph', () => {
    const g = makeGraph();
    const { graph: g2 } = makeNode(g, 'Pkg', 'package', 1, g.rootNodeId);
    expect(validateGraph(g2)).toHaveLength(0);
  });

  it('detects circular dependency', () => {
    const g = makeGraph();
    const { graph: g2, nodeId: a } = makeNode(g, 'A', 'module', 1, g.rootNodeId);
    const { graph: g3, nodeId: b } = makeNode(g2, 'B', 'module', 1, g.rootNodeId);
    const { graph: g4 } = addRelation(g3, a, b, 'depends_on');
    const { graph: g5 } = addRelation(g4, b, a, 'depends_on');
    const anomalies = validateGraph(g5);
    expect(anomalies.some(a => a.type === 'circular_dependency')).toBe(true);
  });

  it('detects high coupling (fan-out > 8)', () => {
    let g = makeGraph();
    const { graph: gA, nodeId: a } = makeNode(g, 'HubA', 'module', 1, g.rootNodeId);
    g = gA;
    for (let i = 0; i < 9; i++) {
      const { graph: gN, nodeId: n } = makeNode(g, `Dep${i}`, 'module', 1, g.rootNodeId);
      const { graph: gR } = addRelation(gN, a, n, 'depends_on');
      g = gR;
    }
    const anomalies = validateGraph(g);
    expect(anomalies.some(a => a.type === 'high_coupling')).toBe(true);
  });

  it('detects broken relation reference', () => {
    const g = makeGraph();
    const { graph: g2, nodeId: a } = makeNode(g, 'A', 'module', 1, g.rootNodeId);
    const { graph: g3, nodeId: b } = makeNode(g2, 'B', 'module', 1, g.rootNodeId);
    const { graph: g4 } = addRelation(g3, a, b, 'depends_on');
    // Manually break the graph by removing B from nodes but keeping the relation
    const brokenGraph = { ...g4, nodes: { ...g4.nodes } };
    delete brokenGraph.nodes[b];
    const anomalies = validateGraph(brokenGraph);
    expect(anomalies.some(a => a.type === 'broken_reference')).toBe(true);
  });
});
