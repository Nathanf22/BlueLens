/**
 * Diagram-level sync: detect which diagrams are affected by a CodeGraph diff,
 * propose updated Mermaid code via LLM (with the current diagram as context),
 * and compute visual diffs.
 *
 * Key design principle: the LLM sees both the current diagram (including any
 * manual user edits) and the code changes, and performs an intelligent merge —
 * preserving user additions that remain architecturally relevant while applying
 * the structural changes from the code.
 */

import { Diagram, CodeGraph, GraphDiff, DiagramDiff, SyncProposal, MermaidNode, MermaidEdge, LLMSettings, GraphNode, GraphRelation } from '../types';
import { llmService } from './llmService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeMermaidId(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9]/g, '_');
  return /^\d/.test(sanitized) ? `_${sanitized}` : sanitized;
}

function escapeLabel(label: string): string {
  return label.replace(/"/g, '#quot;');
}

function extractMermaidBlock(text: string): string | null {
  const match = text.match(/```(?:mermaid)?\s*\n([\s\S]*?)```/);
  return match ? match[1].trim() : null;
}

// ---------------------------------------------------------------------------
// Mermaid parsing
// ---------------------------------------------------------------------------

/**
 * Parse node declarations from a Mermaid flowchart.
 * Handles: NodeId["Label"], NodeId[Label], NodeId(Label), bare NodeId
 */
export function parseMermaidNodes(code: string): MermaidNode[] {
  const lines = code.split('\n');
  const nodes: MermaidNode[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%') || trimmed.startsWith('classDef') ||
        trimmed.startsWith('class ') || trimmed.startsWith('flowchart') ||
        trimmed.startsWith('graph ')) {
      continue;
    }

    // Edge lines: extract any inline node definitions
    if (/-->|==>|-.->|--\|/.test(trimmed)) {
      const edgeParts = trimmed.split(/\s*(?:-->|==>|-.->|--\|.*?\|-->?)\s*/);
      for (const part of edgeParts) {
        const nodeMatch = part.match(/^(\w+)(?:\["([^"]+)"\]|\[([^\]]+)\]|\(([^)]+)\))?/);
        if (nodeMatch && !seen.has(nodeMatch[1])) {
          seen.add(nodeMatch[1]);
          const label = nodeMatch[2] || nodeMatch[3] || nodeMatch[4] || nodeMatch[1];
          nodes.push({ id: nodeMatch[1], label });
        }
      }
      continue;
    }

    // Standalone node declarations
    const quotedMatch = trimmed.match(/^(\w+)\["([^"]+)"\]/);
    if (quotedMatch && !seen.has(quotedMatch[1])) {
      seen.add(quotedMatch[1]);
      nodes.push({ id: quotedMatch[1], label: quotedMatch[2] });
      continue;
    }
    const bracketMatch = trimmed.match(/^(\w+)\[([^\]]+)\]/);
    if (bracketMatch && !seen.has(bracketMatch[1])) {
      seen.add(bracketMatch[1]);
      nodes.push({ id: bracketMatch[1], label: bracketMatch[2] });
      continue;
    }
    const parenMatch = trimmed.match(/^(\w+)\(([^)]+)\)/);
    if (parenMatch && !seen.has(parenMatch[1])) {
      seen.add(parenMatch[1]);
      nodes.push({ id: parenMatch[1], label: parenMatch[2] });
      continue;
    }
    const bareMatch = trimmed.match(/^(\w+)$/);
    if (bareMatch && !['end', 'flowchart', 'graph'].includes(bareMatch[1]) && !seen.has(bareMatch[1])) {
      seen.add(bareMatch[1]);
      nodes.push({ id: bareMatch[1], label: bareMatch[1] });
    }
  }

  return nodes;
}

/**
 * Parse edge declarations from a Mermaid flowchart.
 */
export function parseMermaidEdges(code: string): MermaidEdge[] {
  const lines = code.split('\n');
  const edges: MermaidEdge[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%')) continue;

    const labeledMatch = trimmed.match(/^(\w+)(?:\[.*?\])?\s*-->\|"?([^|"]*)"?\|\s*(\w+)/);
    if (labeledMatch) {
      edges.push({ from: labeledMatch[1], to: labeledMatch[3], label: labeledMatch[2] || undefined });
      continue;
    }

    const simpleMatch = trimmed.match(/^(\w+)(?:\[.*?\]|\(.*?\))?\s*-->\s*(\w+)/);
    if (simpleMatch) {
      edges.push({ from: simpleMatch[1], to: simpleMatch[2] });
      continue;
    }
  }

  return edges;
}

// ---------------------------------------------------------------------------
// Graph structure serialization (for LLM context)
// ---------------------------------------------------------------------------

/**
 * Serialize the relevant parts of an updated graph into a concise text
 * representation for the LLM prompt. Focuses on D1 (packages) and D2 (files)
 * to avoid token explosion.
 */
function serializeGraphForPrompt(graph: CodeGraph, scopeNodeId?: string | null): string {
  const scopeId = scopeNodeId ?? graph.rootNodeId;
  const scopeNode = graph.nodes[scopeId];
  if (!scopeNode) return '(empty graph)';

  const lines: string[] = [];
  const childIds = scopeNode.children;
  const children = childIds.map(id => graph.nodes[id]).filter(Boolean);

  lines.push(`Scope: ${scopeNode.name} (${scopeNode.kind})`);
  lines.push(`Nodes (${children.length}):`);

  for (const child of children) {
    const grandChildCount = child.children.length;
    const suffix = grandChildCount > 0 ? ` — ${grandChildCount} children` : '';
    lines.push(`  - ${child.name} [${child.kind}]${suffix}`);
  }

  const childIdSet = new Set(childIds);
  const relevantRelations = Object.values(graph.relations).filter(
    r => r.type !== 'contains' && childIdSet.has(r.sourceId) && childIdSet.has(r.targetId)
  );

  if (relevantRelations.length > 0) {
    lines.push(`Relations (${relevantRelations.length}):`);
    for (const rel of relevantRelations) {
      const src = graph.nodes[rel.sourceId]?.name ?? rel.sourceId;
      const tgt = graph.nodes[rel.targetId]?.name ?? rel.targetId;
      const label = rel.label ? ` (${rel.label})` : '';
      lines.push(`  - ${src} → ${tgt} [${rel.type}]${label}`);
    }
  }

  return lines.join('\n');
}

/**
 * Summarize a GraphDiff in human-readable form for the LLM prompt.
 */
function serializeGraphDiffForPrompt(diff: GraphDiff): string {
  const lines: string[] = ['Code changes detected:'];

  const formatNode = (n: GraphNode) => `${n.name} (${n.kind})`;
  const formatRel = (r: GraphRelation) => {
    return `${r.sourceId} → ${r.targetId} [${r.type}]${r.label ? ` "${r.label}"` : ''}`;
  };

  if (diff.addedNodes.length > 0) {
    lines.push(`  Added nodes: ${diff.addedNodes.map(formatNode).join(', ')}`);
  }
  if (diff.removedNodes.length > 0) {
    lines.push(`  Removed nodes: ${diff.removedNodes.map(formatNode).join(', ')}`);
  }
  if (diff.modifiedNodes.length > 0) {
    lines.push(`  Modified nodes: ${diff.modifiedNodes.map(m => formatNode(m.after)).join(', ')}`);
  }
  if (diff.addedRelations.length > 0) {
    lines.push(`  Added relations: ${diff.addedRelations.map(formatRel).join(', ')}`);
  }
  if (diff.removedRelations.length > 0) {
    lines.push(`  Removed relations: ${diff.removedRelations.map(formatRel).join(', ')}`);
  }

  const totalChanges = diff.addedNodes.length + diff.removedNodes.length +
    diff.modifiedNodes.length + diff.addedRelations.length + diff.removedRelations.length;
  if (totalChanges === 0) {
    return 'No structural changes detected.';
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Deterministic fallback
// ---------------------------------------------------------------------------

/**
 * Deterministically generate Mermaid flowchart code from a CodeGraph.
 * Used as a fallback when the LLM is unavailable.
 */
export function generateMermaidFromGraph(graph: CodeGraph, scopeNodeId?: string | null): string {
  const scopeId = scopeNodeId ?? graph.rootNodeId;
  const scopeNode = graph.nodes[scopeId];
  if (!scopeNode) return 'flowchart TD\n  %% Empty graph';

  const childIds = scopeNode.children;
  const childNodes = childIds.map(id => graph.nodes[id]).filter(Boolean);
  const lines: string[] = ['flowchart TD'];

  for (const node of childNodes) {
    const safeId = sanitizeMermaidId(node.name);
    const label = escapeLabel(node.name);
    lines.push(`  ${safeId}["${label}"]`);
  }

  const childIdSet = new Set(childIds);
  for (const rel of Object.values(graph.relations)) {
    if (rel.type === 'contains') continue;
    if (!childIdSet.has(rel.sourceId) || !childIdSet.has(rel.targetId)) continue;
    const srcNode = graph.nodes[rel.sourceId];
    const tgtNode = graph.nodes[rel.targetId];
    if (!srcNode || !tgtNode) continue;
    const srcId = sanitizeMermaidId(srcNode.name);
    const tgtId = sanitizeMermaidId(tgtNode.name);
    if (rel.label) {
      lines.push(`  ${srcId} -->|"${escapeLabel(rel.label)}"| ${tgtId}`);
    } else {
      lines.push(`  ${srcId} --> ${tgtId}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Affected diagram detection
// ---------------------------------------------------------------------------

export function findAffectedDiagrams(diagrams: Diagram[], graphId: string, _diff: GraphDiff): Diagram[] {
  return diagrams.filter(d => d.sourceGraphId === graphId);
}

// ---------------------------------------------------------------------------
// LLM-powered diagram update proposal
// ---------------------------------------------------------------------------

const SYNC_SYSTEM_PROMPT = `You are an expert software architect helping to keep architecture diagrams in sync with evolving codebases.

You will be given:
1. A current Mermaid diagram (which may include manual edits by the user)
2. A summary of what changed in the code
3. The updated structure of the code (graph nodes and relations)

Your task is to generate an updated Mermaid diagram that:
- PRESERVES user-added nodes and edges that remain architecturally relevant, even if they are not in the code graph (they represent intentional architectural decisions)
- ADDS nodes/edges that represent newly detected code entities
- REMOVES nodes/edges for code entities that no longer exist — but be critical: if the user clearly added something manually, keep it unless it explicitly contradicts the new code structure
- MAINTAINS the user's naming style, layout direction, and diagram conventions
- Returns ONLY a valid Mermaid diagram code block, nothing else

Be conservative: when in doubt about whether a user addition is still relevant, keep it.`;

/**
 * Propose an updated diagram using the LLM with enriched context.
 * The LLM receives the current diagram (including user edits) and performs
 * an intelligent merge with the updated graph structure.
 *
 * Falls back to deterministic generation if LLM is unavailable or fails.
 */
export async function proposeDiagramUpdate(
  diagram: Diagram,
  updatedGraph: CodeGraph,
  graphDiff: GraphDiff,
  llmSettings: LLMSettings
): Promise<string> {
  const graphStructure = serializeGraphForPrompt(updatedGraph, diagram.sourceScopeNodeId);
  const diffSummary = serializeGraphDiffForPrompt(graphDiff);

  const userMessage = `Current diagram ("${diagram.name}"):
\`\`\`mermaid
${diagram.code}
\`\`\`

${diffSummary}

Updated code structure:
${graphStructure}

Generate the updated Mermaid diagram.`;

  try {
    const response = await llmService.sendMessage(
      [{ role: 'user', content: userMessage }],
      SYNC_SYSTEM_PROMPT,
      llmSettings
    );

    const extracted = extractMermaidBlock(response.content);
    if (extracted && extracted.length > 0) {
      return extracted;
    }
    // If the LLM returned plain Mermaid without a code fence
    if (response.content.trim().startsWith('flowchart') || response.content.trim().startsWith('graph ')) {
      return response.content.trim();
    }
  } catch (err) {
    console.warn('[diagramSyncService] LLM proposeDiagramUpdate failed, falling back to deterministic:', err);
  }

  // Fallback: deterministic regeneration (loses user edits but keeps the graph coherent)
  return generateMermaidFromGraph(updatedGraph, diagram.sourceScopeNodeId);
}

// ---------------------------------------------------------------------------
// Diff annotation
// ---------------------------------------------------------------------------

export function renderDiffAnnotated(
  _currentCode: string,
  proposedCode: string,
  addedLabels: Set<string>,
  removedLabels: Set<string>
): string {
  const lines: string[] = [];
  const addedClassDef = 'classDef added fill:#16a34a,color:#fff,stroke:#15803d';
  const removedClassDef = 'classDef removed fill:#dc2626,color:#fff,stroke:#b91c1c';

  const proposedLines = proposedCode.split('\n');
  lines.push(proposedLines[0]); // "flowchart TD" directive
  lines.push(`  ${addedClassDef}`);
  lines.push(`  ${removedClassDef}`);

  const parsedNodes = parseMermaidNodes(proposedCode);

  for (let i = 1; i < proposedLines.length; i++) {
    const line = proposedLines[i];
    const trimmed = line.trim();

    let annotated = false;
    for (const node of parsedNodes) {
      if (addedLabels.has(node.label) && trimmed.startsWith(node.id)) {
        lines.push(line.trimEnd() + ':::added');
        annotated = true;
        break;
      }
    }
    if (!annotated) lines.push(line);
  }

  // Append removed nodes at the end with :::removed styling
  for (const label of removedLabels) {
    const safeId = sanitizeMermaidId(label);
    lines.push(`  ${safeId}["${escapeLabel(label)}"]:::removed`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// DiagramDiff computation
// ---------------------------------------------------------------------------

export function computeDiagramDiff(diagram: Diagram, proposedCode: string): DiagramDiff {
  const currentNodes = parseMermaidNodes(diagram.code);
  const proposedNodes = parseMermaidNodes(proposedCode);
  const currentEdges = parseMermaidEdges(diagram.code);
  const proposedEdges = parseMermaidEdges(proposedCode);

  const currentLabels = new Set(currentNodes.map(n => n.label));
  const proposedLabels = new Set(proposedNodes.map(n => n.label));

  const addedNodes = proposedNodes.filter(n => !currentLabels.has(n.label)).map(n => n.label);
  const removedNodes = currentNodes.filter(n => !proposedLabels.has(n.label)).map(n => n.label);

  const edgeKey = (e: MermaidEdge) => `${e.from}::${e.to}::${e.label ?? ''}`;
  const currentEdgeKeys = new Set(currentEdges.map(edgeKey));
  const proposedEdgeKeys = new Set(proposedEdges.map(edgeKey));

  const addedEdges = proposedEdges.filter(e => !currentEdgeKeys.has(edgeKey(e)));
  const removedEdges = currentEdges.filter(e => !proposedEdgeKeys.has(edgeKey(e)));

  const annotatedCode = renderDiffAnnotated(
    diagram.code,
    proposedCode,
    new Set(addedNodes),
    new Set(removedNodes)
  );

  return {
    diagramId: diagram.id,
    diagramName: diagram.name,
    addedNodes,
    removedNodes,
    addedEdges,
    removedEdges,
    proposedCode,
    annotatedCode,
  };
}

// ---------------------------------------------------------------------------
// Sync proposal builder
// ---------------------------------------------------------------------------

export async function buildSyncProposal(
  graph: CodeGraph,
  graphDiff: GraphDiff,
  diagrams: Diagram[],
  updatedGraph: CodeGraph,
  llmSettings: LLMSettings
): Promise<SyncProposal> {
  const affected = findAffectedDiagrams(diagrams, graph.id, graphDiff);

  const diagramDiffs: DiagramDiff[] = [];
  for (const diagram of affected) {
    const proposed = await proposeDiagramUpdate(diagram, updatedGraph, graphDiff, llmSettings);
    const diff = computeDiagramDiff(diagram, proposed);
    // Only include diagrams where something actually changed
    if (diff.addedNodes.length > 0 || diff.removedNodes.length > 0 ||
        diff.addedEdges.length > 0 || diff.removedEdges.length > 0) {
      diagramDiffs.push(diff);
    }
  }

  return {
    id: Math.random().toString(36).substr(2, 9),
    graphId: graph.id,
    graphDiff,
    diagramDiffs,
    createdAt: Date.now(),
  };
}

export const diagramSyncService = {
  findAffectedDiagrams,
  generateMermaidFromGraph,
  proposeDiagramUpdate,
  parseMermaidNodes,
  parseMermaidEdges,
  computeDiagramDiff,
  renderDiffAnnotated,
  buildSyncProposal,
};
