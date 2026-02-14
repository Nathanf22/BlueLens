/**
 * Transforms CodeGraph + active ViewLens + focus/depth into a Mermaid code string.
 * The output plugs directly into the existing Preview rendering pipeline.
 */

import {
  CodeGraph, ViewLens, GraphNode, GraphRelation,
  GraphDepth, ViewLensStyleRule, GraphNodeKind,
} from '../types';
import { codeGraphModelService } from './codeGraphModelService';

const RELATION_ARROWS: Record<string, string> = {
  contains: '-->',
  depends_on: '-->',
  implements: '-.->',
  inherits: '-->',
  calls: '-->',
  emits: '-.->>',
  subscribes: '-.->',
  reads: '-->',
  writes: '-->',
};

const RELATION_LABELS: Record<string, string> = {
  implements: 'implements',
  inherits: 'extends',
  calls: 'calls',
  emits: 'emits',
  subscribes: 'subscribes',
  reads: 'reads',
  writes: 'writes',
};

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

function sanitizeLabel(label: string): string {
  return label.replace(/"/g, '\\"');
}

function findMatchingRule(node: GraphNode, rules: ViewLensStyleRule[]): ViewLensStyleRule | null {
  for (const rule of rules) {
    const { match } = rule;
    if (match.kind && !match.kind.includes(node.kind)) continue;
    if (match.depth && !match.depth.includes(node.depth)) continue;
    if (match.tags && !match.tags.some(t => node.tags.includes(t))) continue;
    return rule;
  }
  return null;
}

function wrapInShape(id: string, label: string, shape?: string): string {
  const sid = sanitizeId(id);
  const slabel = sanitizeLabel(label);

  switch (shape) {
    case 'rounded':
      return `${sid}("${slabel}")`;
    case 'stadium':
      return `${sid}(["${slabel}"])`;
    case 'cylinder':
      return `${sid}[("${slabel}")]`;
    case 'hexagon':
      return `${sid}{{"${slabel}"}}`;
    case 'trapezoid':
      return `${sid}[/"${slabel}"\\]`;
    case 'circle':
      return `${sid}(("${slabel}"))`;
    case 'diamond':
      return `${sid}{"${slabel}"}`;
    default:
      return `${sid}["${slabel}"]`;
  }
}

function renderGraphToMermaid(
  graph: CodeGraph,
  lens: ViewLens,
  focusNodeId?: string,
  depthRange?: { min?: GraphDepth; max?: GraphDepth }
): string {
  // Domain lens uses a separate renderer
  if (lens.type === 'domain') {
    return renderDomainView(graph);
  }

  const visibleNodes = codeGraphModelService.getVisibleNodes(graph, lens, focusNodeId, depthRange);
  const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
  const visibleRelations = codeGraphModelService.getVisibleRelations(graph, lens, visibleNodeIds);

  // Skip containment relations — we'll use subgraphs for those
  const nonContainRelations = visibleRelations.filter(r => r.type !== 'contains');

  const lines: string[] = [];
  lines.push(`flowchart ${lens.layoutHint}`);

  // Collect style definitions
  const styleEntries: Array<{ nodeId: string; style: string }> = [];

  // Group nodes by parent for subgraph nesting
  const rootNodes: GraphNode[] = [];
  const childrenByParent = new Map<string, GraphNode[]>();

  for (const node of visibleNodes) {
    if (!node.parentId || !visibleNodeIds.has(node.parentId)) {
      rootNodes.push(node);
    } else {
      const siblings = childrenByParent.get(node.parentId) || [];
      siblings.push(node);
      childrenByParent.set(node.parentId, siblings);
    }
  }

  // Recursive subgraph rendering
  function renderSubgraph(node: GraphNode, indent: string): void {
    const children = childrenByParent.get(node.id) || [];
    const rule = findMatchingRule(node, lens.styleRules);

    if (children.length > 0) {
      // Render as subgraph
      lines.push(`${indent}subgraph ${sanitizeId(node.id)}["${sanitizeLabel(node.name)}"]`);

      for (const child of children) {
        renderSubgraph(child, indent + '  ');
      }

      lines.push(`${indent}end`);

      if (rule?.style) {
        lines.push(`${indent}style ${sanitizeId(node.id)} ${rule.style}`);
      }
    } else {
      // Render as node
      const nodeDef = wrapInShape(node.id, node.name, rule?.shape);
      lines.push(`${indent}${nodeDef}`);

      if (rule?.style) {
        styleEntries.push({ nodeId: node.id, style: rule.style });
      }
    }
  }

  for (const node of rootNodes) {
    renderSubgraph(node, '  ');
  }

  // Edges
  for (const rel of nonContainRelations) {
    const arrow = RELATION_ARROWS[rel.type] || '-->';
    const label = rel.label || RELATION_LABELS[rel.type] || '';
    const sid = sanitizeId(rel.sourceId);
    const tid = sanitizeId(rel.targetId);

    if (label) {
      lines.push(`  ${sid} ${arrow}|"${sanitizeLabel(label)}"| ${tid}`);
    } else {
      lines.push(`  ${sid} ${arrow} ${tid}`);
    }
  }

  // Apply styles
  for (const entry of styleEntries) {
    lines.push(`  style ${sanitizeId(entry.nodeId)} ${entry.style}`);
  }

  return lines.join('\n');
}

function renderDomainView(graph: CodeGraph): string {
  const domainNodes = Object.values(graph.domainNodes);
  const domainRelations = Object.values(graph.domainRelations);

  if (domainNodes.length === 0) {
    return `flowchart TD\n  empty["No domain model defined yet"]`;
  }

  const lines: string[] = [];
  lines.push('flowchart TD');

  // Render domain nodes
  const rootDomainNodes = domainNodes.filter(n => !n.parentId);
  const childDomainMap = new Map<string, typeof domainNodes>();
  for (const node of domainNodes) {
    if (node.parentId) {
      const siblings = childDomainMap.get(node.parentId) || [];
      siblings.push(node);
      childDomainMap.set(node.parentId, siblings);
    }
  }

  function renderDomainSubgraph(node: typeof domainNodes[0], indent: string): void {
    const children = childDomainMap.get(node.id) || [];
    if (children.length > 0) {
      lines.push(`${indent}subgraph ${sanitizeId(node.id)}["${sanitizeLabel(node.name)}"]`);
      for (const child of children) {
        renderDomainSubgraph(child, indent + '  ');
      }
      lines.push(`${indent}end`);
    } else {
      const projCount = node.projections.length;
      const label = projCount > 0
        ? `${node.name}\\n(${projCount} component${projCount !== 1 ? 's' : ''})`
        : node.name;
      lines.push(`${indent}${sanitizeId(node.id)}("${sanitizeLabel(label)}")`);
    }
  }

  for (const node of rootDomainNodes) {
    renderDomainSubgraph(node, '  ');
  }

  // Domain relations
  const DOMAIN_ARROWS: Record<string, string> = {
    owns: '-->',
    triggers: '-->',
    requires: '-.->',
    produces: '-.->>',
    consumes: '-.->',
  };

  for (const rel of domainRelations) {
    const arrow = DOMAIN_ARROWS[rel.type] || '-->';
    const label = rel.label || rel.type;
    lines.push(`  ${sanitizeId(rel.sourceId)} ${arrow}|"${sanitizeLabel(label)}"| ${sanitizeId(rel.targetId)}`);
  }

  // Style domain nodes
  for (const node of domainNodes) {
    lines.push(`  style ${sanitizeId(node.id)} fill:#1e3a5f,stroke:#60a5fa,color:#93c5fd`);
  }

  return lines.join('\n');
}

export const codeGraphRendererService = {
  renderGraphToMermaid,
  renderDomainView,
};
