/**
 * Deterministic architecture diagram generation from a CodeGraph.
 *
 * Produces two kinds of Mermaid diagrams:
 *   - Overview: all D1 modules as nodes + D1→D1 depends_on edges
 *   - Service:  D2 files within a D1 module + D2→D2 deps inside the module
 */

import { CodeGraph, GraphNode } from '../types';

// Sanitize a string for use as a Mermaid node ID
function mermaidId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

// Sanitize a label (escape quotes)
function mermaidLabel(s: string): string {
  return s.replace(/"/g, "'");
}

/**
 * Generate a high-level architecture overview diagram (all D1 modules + dependencies).
 */
export function generateOverviewDiagram(graph: CodeGraph): string {
  const d1Nodes = Object.values(graph.nodes).filter(n => n.depth === 1);
  if (d1Nodes.length === 0) return '';

  const lines: string[] = ['graph LR'];

  // Classdefs
  lines.push('  classDef module fill:#1e3a5f,stroke:#3b82f6,color:#e2e8f0,rx:4');
  lines.push('  classDef external fill:#2d1f3d,stroke:#7c3aed,color:#e2e8f0,rx:4,stroke-dasharray:4');

  // Node declarations
  for (const node of d1Nodes) {
    const fileCount = node.children.length;
    const mid = mermaidId(node.id);
    const label = mermaidLabel(node.name);
    const subtitle = fileCount > 0 ? `\\n${fileCount} file${fileCount > 1 ? 's' : ''}` : '';
    lines.push(`  ${mid}["${label}${subtitle}"]:::module`);
  }

  // D1→D1 depends_on edges
  const d1Ids = new Set(d1Nodes.map(n => n.id));
  const seen = new Set<string>();

  for (const rel of Object.values(graph.relations)) {
    if (rel.type !== 'depends_on') continue;
    const src = graph.nodes[rel.sourceId];
    const tgt = graph.nodes[rel.targetId];
    if (!src || !tgt) continue;
    if (!d1Ids.has(src.id) || !d1Ids.has(tgt.id)) continue;
    const key = `${src.id}→${tgt.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`  ${mermaidId(src.id)} --> ${mermaidId(tgt.id)}`);
  }

  // If no D1→D1 edges exist, derive them from D2→D2 (cross-module)
  if (seen.size === 0) {
    const d2ToD1 = new Map<string, string>();
    for (const node of d1Nodes) {
      for (const childId of node.children) {
        d2ToD1.set(childId, node.id);
      }
    }
    for (const rel of Object.values(graph.relations)) {
      if (rel.type !== 'depends_on') continue;
      const srcD1 = d2ToD1.get(rel.sourceId);
      const tgtD1 = d2ToD1.get(rel.targetId);
      if (!srcD1 || !tgtD1 || srcD1 === tgtD1) continue;
      const key = `${srcD1}→${tgtD1}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`  ${mermaidId(srcD1)} --> ${mermaidId(tgtD1)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Generate a per-service diagram showing D2 files and their intra-module dependencies.
 */
export function generateServiceDiagram(graph: CodeGraph, d1NodeId: string): string {
  const d1Node = graph.nodes[d1NodeId];
  if (!d1Node || d1Node.depth !== 1) return '';

  const d2Nodes: GraphNode[] = d1Node.children
    .map(id => graph.nodes[id])
    .filter((n): n is GraphNode => !!n && n.depth === 2);

  if (d2Nodes.length === 0) return '';

  const lines: string[] = ['graph TD'];
  lines.push('  classDef file fill:#1a2744,stroke:#6366f1,color:#e2e8f0');
  lines.push('  classDef entrypoint fill:#1a3a2a,stroke:#22c55e,color:#e2e8f0');

  const d2Ids = new Set(d2Nodes.map(n => n.id));

  // Find entry points (not imported by any other file in the module)
  const importedByInModule = new Set<string>();
  for (const rel of Object.values(graph.relations)) {
    if (rel.type !== 'depends_on') continue;
    if (d2Ids.has(rel.sourceId) && d2Ids.has(rel.targetId)) {
      importedByInModule.add(rel.targetId);
    }
  }

  for (const node of d2Nodes) {
    const nid = mermaidId(node.id);
    const label = mermaidLabel(node.name);
    const symbolCount = node.children.length;
    const subtitle = symbolCount > 0 ? `\\n${symbolCount} symbol${symbolCount > 1 ? 's' : ''}` : '';
    const cls = importedByInModule.has(node.id) ? 'file' : 'entrypoint';
    lines.push(`  ${nid}["${label}${subtitle}"]:::${cls}`);
  }

  // Intra-module D2→D2 edges
  for (const rel of Object.values(graph.relations)) {
    if (rel.type !== 'depends_on') continue;
    if (!d2Ids.has(rel.sourceId) || !d2Ids.has(rel.targetId)) continue;
    lines.push(`  ${mermaidId(rel.sourceId)} --> ${mermaidId(rel.targetId)}`);
  }

  return lines.join('\n');
}

/**
 * Generate all architecture diagrams for a graph:
 *   - one overview + one per D1 module that has files.
 */
export interface ArchitectureDiagramSet {
  overview: { name: string; code: string };
  services: { name: string; nodeId: string; code: string }[];
}

export function generateAllArchitectureDiagrams(graph: CodeGraph): ArchitectureDiagramSet {
  const overviewCode = generateOverviewDiagram(graph);

  const services: ArchitectureDiagramSet['services'] = [];
  const d1Nodes = Object.values(graph.nodes)
    .filter(n => n.depth === 1)
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const node of d1Nodes) {
    if (node.children.length === 0) continue;
    const code = generateServiceDiagram(graph, node.id);
    if (code) {
      services.push({ name: node.name, nodeId: node.id, code });
    }
  }

  return {
    overview: { name: `${graph.name} — Overview`, code: overviewCode },
    services,
  };
}
