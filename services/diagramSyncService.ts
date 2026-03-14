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
  const isSequence = code.trim().startsWith('sequenceDiagram');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%') || trimmed.startsWith('classDef') ||
        trimmed.startsWith('class ') || trimmed.startsWith('flowchart') ||
        trimmed.startsWith('graph ') || trimmed.startsWith('sequenceDiagram') ||
        trimmed.startsWith('Note ') || trimmed.startsWith('loop') ||
        trimmed.startsWith('alt') || trimmed.startsWith('else') || trimmed.startsWith('end')) {
      continue;
    }

    // Sequence diagram: participant declarations
    if (isSequence) {
      const participantMatch = trimmed.match(/^(?:participant|actor)\s+(\w+)(?:\s+as\s+(.+))?$/);
      if (participantMatch && !seen.has(participantMatch[1])) {
        seen.add(participantMatch[1]);
        nodes.push({ id: participantMatch[1], label: participantMatch[2]?.trim() || participantMatch[1] });
        continue;
      }
      // Sequence arrow: extract participants inline (e.g. App->>Server: call)
      const arrowMatch = trimmed.match(/^(\w+)[-]?[-]?>>?[-]?\+?(\w+)\s*:/);
      if (arrowMatch) {
        for (const part of [arrowMatch[1], arrowMatch[2]]) {
          if (!seen.has(part)) { seen.add(part); nodes.push({ id: part, label: part }); }
        }
      }
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
  const isSequence = code.trim().startsWith('sequenceDiagram');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%%')) continue;

    if (isSequence) {
      // Sequence arrow: Src->>Dst: label  or Src->Dst: label etc.
      const seqMatch = trimmed.match(/^(\w+)\s*[-]+[>]+[-]*\+?\s*(\w+)\s*:\s*(.+)$/);
      if (seqMatch) {
        edges.push({ from: seqMatch[1], to: seqMatch[2], label: seqMatch[3].trim() || undefined });
      }
      continue;
    }

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
function serializeGraphForPrompt(graph: CodeGraph, scopeNodeId?: string | null, extraDepth = 0): string {
  const scopeId = scopeNodeId ?? graph.rootNodeId;
  const scopeNode = graph.nodes[scopeId];
  if (!scopeNode) return '(empty graph)';

  const lines: string[] = [];
  const childIds = scopeNode.children;
  const children = childIds.map(id => graph.nodes[id]).filter(Boolean);

  lines.push(`Scope: ${scopeNode.name} (${scopeNode.kind}, depth ${scopeNode.depth})`);
  lines.push(`Nodes (${children.length}):`);

  function renderChildren(nodes: GraphNode[], indent: string, remainingDepth: number) {
    for (const node of nodes) {
      lines.push(`${indent}- ${node.name} [${node.kind}]`);
      if (remainingDepth > 0 && node.children.length > 0) {
        const grandchildren = node.children.map(id => graph.nodes[id]).filter(Boolean);
        renderChildren(grandchildren, indent + '  ', remainingDepth - 1);
      }
    }
  }

  renderChildren(children, '  ', 1 + extraDepth);

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
const DEPTH_LABEL: Record<number, string> = { 0: 'D0/system', 1: 'D1/module', 2: 'D2/file', 3: 'D3/symbol' };

function serializeGraphDiffForPrompt(diff: GraphDiff): string {
  const lines: string[] = ['Code changes detected:'];

  const formatNode = (n: GraphNode) => `${n.name} (${n.kind}, ${DEPTH_LABEL[n.depth] ?? `D${n.depth}`})`;
  const formatRel = (r: GraphRelation) => `${r.sourceId} → ${r.targetId} [${r.type}]${r.label ? ` "${r.label}"` : ''}`;

  if (diff.addedNodes.length > 0) {
    lines.push(`  Added: ${diff.addedNodes.map(formatNode).join(', ')}`);
  }
  if (diff.removedNodes.length > 0) {
    lines.push(`  Removed: ${diff.removedNodes.map(formatNode).join(', ')}`);
  }
  if (diff.modifiedNodes.length > 0) {
    lines.push(`  Modified: ${diff.modifiedNodes.map(m => formatNode(m.after)).join(', ')}`);
  }
  if (diff.addedRelations.length > 0) {
    lines.push(`  Added relations: ${diff.addedRelations.map(formatRel).join(', ')}`);
  }
  if (diff.removedRelations.length > 0) {
    lines.push(`  Removed relations: ${diff.removedRelations.map(formatRel).join(', ')}`);
  }

  const totalChanges = diff.addedNodes.length + diff.removedNodes.length +
    diff.modifiedNodes.length + diff.addedRelations.length + diff.removedRelations.length;
  if (totalChanges === 0) return 'No structural changes detected.';

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
// Affected diagram detection — bottom-up propagation
// ---------------------------------------------------------------------------

export interface AffectedDiagram {
  diagram: Diagram;
  /** Distance from the nearest changed node to this diagram's scope node.
   *  0 = scope is direct parent of a changed node (e.g. file scope + function changed)
   *  1 = scope is grandparent (e.g. module scope + file changed)
   *  2 = scope is great-grandparent (e.g. global scope + module changed)
   *  Lower = more likely the diagram needs updating. */
  minDistance: number;
}

function getAncestorChain(graph: CodeGraph, nodeId: string): string[] {
  const chain: string[] = [];
  let current = graph.nodes[nodeId];
  while (current?.parentId) {
    chain.push(current.parentId);
    current = graph.nodes[current.parentId];
  }
  return chain; // [directParent, grandparent, ..., root]
}

export function findAffectedDiagrams(
  diagrams: Diagram[],
  graph: CodeGraph,
  graphId: string,
  diff: GraphDiff
): AffectedDiagram[] {
  const linked = diagrams.filter(d => d.sourceGraphId === graphId);
  if (linked.length === 0) return [];

  // Collect all changed node IDs and their ancestor chains
  const changedNodes = [
    ...diff.addedNodes,
    ...diff.removedNodes,
    ...diff.modifiedNodes.map(m => m.after),
  ];

  // Build a map: scopeNodeId → minimum distance to any changed node
  const scopeDistances = new Map<string, number>();

  for (const changed of changedNodes) {
    const ancestors = getAncestorChain(graph, changed.id);
    ancestors.forEach((ancestorId, distance) => {
      const prev = scopeDistances.get(ancestorId) ?? Infinity;
      if (distance < prev) scopeDistances.set(ancestorId, distance);
    });
  }

  // Root scope (null/undefined sourceScopeNodeId) = always the furthest ancestor
  const rootDistance = changedNodes.reduce((min, n) => {
    const chain = getAncestorChain(graph, n.id);
    return Math.min(min, chain.length);
  }, Infinity);

  return linked.map(diagram => {
    const scopeId = diagram.sourceScopeNodeId ?? graph.rootNodeId;
    const distance = scopeDistances.get(scopeId) ?? rootDistance;
    return { diagram, minDistance: distance };
  }).sort((a, b) => a.minDistance - b.minDistance);
}

// ---------------------------------------------------------------------------
// LLM-powered diagram update proposal
// ---------------------------------------------------------------------------

const SYNC_SYSTEM_PROMPT = `You are an expert software architect helping to keep architecture diagrams in sync with evolving codebases.

You will be given:
1. A current Mermaid diagram with its abstraction scope (D0=global, D1=module, D2=file, D3=symbol)
2. A summary of what changed in the code, with the depth of each change (D1/D2/D3)
3. The updated structure of the code at the diagram's scope level

DECISION RULE — first decide if an update is needed:
- Changes at the SAME depth as the diagram scope: very likely need an update
- Changes one level BELOW the diagram scope: possibly need an update
- Changes TWO or more levels below: rarely need an update — return NO_CHANGE

EXCEPTION for sequenceDiagrams: sequence diagrams model function call flows (D3 symbols), so D3 changes
(modified/added/removed functions) ARE directly relevant even when the diagram scope is higher.
For sequenceDiagrams, treat D3 changes with the same urgency as same-depth changes.

If you decide NO update is needed, respond with exactly: NO_CHANGE

If an update IS needed, apply MINIMAL SURGICAL changes to the existing diagram:
- DO NOT restructure or rewrite the diagram — start from the existing code and make targeted edits only
- DO NOT rename existing nodes — preserve all existing node IDs and labels exactly as they are
- DO NOT remove existing connections (edges) unless they reference a deleted entity from the diff
- DO NOT remove nodes unless they are explicitly listed as removed in the diff
- ONLY add new nodes/edges for entities listed as added in the diff
- PRESERVE all existing node descriptions, styles, and diagram conventions

When you update the diagram, respond in this exact format:
REASON: <one or two sentences explaining what changed in the code and what was updated in the diagram>
\`\`\`mermaid
<updated diagram code>
\`\`\`

Be conservative: when in doubt, return NO_CHANGE rather than making unnecessary changes.`;

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
  llmSettings: LLMSettings,
  minDistance: number = 0
): Promise<{ code: string; explanation: string } | null> {
  const scopeNode = diagram.sourceScopeNodeId
    ? updatedGraph.nodes[diagram.sourceScopeNodeId]
    : updatedGraph.nodes[updatedGraph.rootNodeId];
  const scopeDepth = scopeNode?.depth ?? 0;
  const scopeLabel = DEPTH_LABEL[scopeDepth] ?? `D${scopeDepth}`;
  const isSequence = diagram.code.trim().startsWith('sequenceDiagram');

  const proximityHint = isSequence
    ? 'This is a sequenceDiagram tracking function call flows. D3 symbol changes (modified/added/removed functions) are directly relevant.'
    : minDistance === 0 ? 'The changes are direct children of this diagram\'s scope — high probability of needing an update.'
    : minDistance === 1 ? 'The changes are one level below this diagram\'s scope — moderate probability of needing an update.'
    : `The changes are ${minDistance} levels below this diagram\'s scope — low probability of needing an update, be conservative.`;

  // For sequence diagrams show D3 symbols (extra depth) so the LLM can see functions
  const graphStructure = serializeGraphForPrompt(updatedGraph, diagram.sourceScopeNodeId, isSequence ? 1 : 0);
  const diffSummary = serializeGraphDiffForPrompt(graphDiff);

  const userMessage = `Diagram: "${diagram.name}" (scope: ${scopeLabel})
Proximity: ${proximityHint}
\`\`\`mermaid
${diagram.code}
\`\`\`

${diffSummary}

Updated code structure at this scope:
${graphStructure}

Decide: does this diagram need updating given the changes above? If not, respond NO_CHANGE. If yes, return the updated Mermaid diagram.`;

  try {
    const response = await llmService.sendMessage(
      [{ role: 'user', content: userMessage }],
      SYNC_SYSTEM_PROMPT,
      llmSettings
    );

    const content = response.content.trim();

    // LLM decided no update needed
    if (content === 'NO_CHANGE' || content.startsWith('NO_CHANGE')) return null;

    // Parse REASON + mermaid block
    let explanation = '';
    let codeContent = content;
    const reasonMatch = content.match(/^REASON:\s*(.+?)(?=\n|```)/s);
    if (reasonMatch) {
      explanation = reasonMatch[1].trim();
    }

    const extracted = extractMermaidBlock(content);
    if (extracted && extracted.length > 0) return { code: extracted, explanation };

    if (content.startsWith('flowchart') || content.startsWith('graph ') || content.startsWith('sequenceDiagram')) {
      return { code: codeContent, explanation };
    }
  } catch (err) {
    console.warn('[diagramSyncService] LLM proposeDiagramUpdate failed, falling back to deterministic:', err);
  }

  // Fallback: deterministic regeneration
  const fallbackCode = generateMermaidFromGraph(updatedGraph, diagram.sourceScopeNodeId);
  return { code: fallbackCode, explanation: '' };
}

// ---------------------------------------------------------------------------
// Diff annotation
// ---------------------------------------------------------------------------

function supportsClassDef(code: string): boolean {
  const first = code.trim().split('\n')[0].trim().toLowerCase();
  return first.startsWith('flowchart') || first.startsWith('graph ');
}

export function renderDiffAnnotated(
  _currentCode: string,
  proposedCode: string,
  addedLabels: Set<string>,
  removedLabels: Set<string>
): string {
  // classDef / ::: annotations only work for flowchart/graph diagrams
  if (!supportsClassDef(proposedCode)) return proposedCode;

  const lines: string[] = [];
  const addedClassDef = 'classDef added fill:#16a34a,color:#fff,stroke:#15803d';
  const removedClassDef = 'classDef removed fill:#dc2626,color:#fff,stroke:#b91c1c';

  const proposedLines = proposedCode.split('\n');
  lines.push(proposedLines[0]);
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

  // Detect nodeLinks whose Mermaid node ID no longer exists in the proposed code
  const proposedNodeIds = new Set(proposedNodes.map(n => n.id));
  const brokenNodeLinkIds = (diagram.nodeLinks ?? [])
    .filter(nl => !proposedNodeIds.has(nl.nodeId))
    .map(nl => nl.nodeId);

  return {
    diagramId: diagram.id,
    diagramName: diagram.name,
    addedNodes,
    removedNodes,
    addedEdges,
    removedEdges,
    currentCode: diagram.code,
    proposedCode,
    annotatedCode,
    brokenNodeLinkIds: brokenNodeLinkIds.length > 0 ? brokenNodeLinkIds : undefined,
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
  // Use updatedGraph for ancestor chains — added nodes only exist there
  const affected = findAffectedDiagrams(diagrams, updatedGraph, graph.id, graphDiff);
  console.log(`[diagramSync] ${affected.length} affected diagrams, diff: +${graphDiff.addedNodes.length} -${graphDiff.removedNodes.length} ~${graphDiff.modifiedNodes.length}`);

  const diagramDiffs: DiagramDiff[] = [];
  for (const { diagram, minDistance } of affected) {
    console.log(`[diagramSync] Checking "${diagram.name}" (minDistance=${minDistance})`);
    const proposed = await proposeDiagramUpdate(diagram, updatedGraph, graphDiff, llmSettings, minDistance);
    // null = LLM decided no update needed at this scope level
    if (proposed === null) {
      console.log(`[diagramSync] "${diagram.name}" → NO_CHANGE`);
      continue;
    }
    const diff = computeDiagramDiff(diagram, proposed.code);
    console.log(`[diagramSync] "${diagram.name}" → proposed: +${diff.addedNodes.length}nodes -${diff.removedNodes.length}nodes +${diff.addedEdges.length}edges -${diff.removedEdges.length}edges`);
    if (diff.addedNodes.length > 0 || diff.removedNodes.length > 0 ||
        diff.addedEdges.length > 0 || diff.removedEdges.length > 0) {
      diagramDiffs.push({ ...diff, explanation: proposed.explanation || undefined });
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
