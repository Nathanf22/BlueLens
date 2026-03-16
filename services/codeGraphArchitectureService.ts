/**
 * Architecture diagram generation from a CodeGraph.
 *
 * LLM-powered: produces comprehensible Mermaid diagrams with meaningful
 * descriptions and labeled edges.
 *   - Overview: all D1 modules + cross-module dependencies
 *   - Service:  D2 files within a D1 module + intra-module deps
 */

import { CodeGraph, GraphNode, LLMSettings } from '../types';
import { llmService } from './llmService';

// ── Context builders ─────────────────────────────────────────────────────────

function getD1Nodes(graph: CodeGraph): GraphNode[] {
  return Object.values(graph.nodes)
    .filter(n => n.depth === 1)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getD2Children(graph: CodeGraph, d1Node: GraphNode): GraphNode[] {
  return d1Node.children
    .map(id => graph.nodes[id])
    .filter((n): n is GraphNode => !!n && n.depth === 2);
}

function getD3Symbols(graph: CodeGraph, d2Node: GraphNode): string[] {
  return d2Node.children
    .map(id => graph.nodes[id])
    .filter((n): n is GraphNode => !!n && n.depth === 3)
    .map(n => n.name)
    .slice(0, 8); // cap to keep context small
}

/** Build the cross-module dependency map: D1 name → D1 names it depends on */
function buildD1Deps(graph: CodeGraph, d1Nodes: GraphNode[]): Map<string, string[]> {
  const d1Ids = new Set(d1Nodes.map(n => n.id));
  const d2ToD1 = new Map<string, string>();
  for (const d1 of d1Nodes) {
    for (const childId of d1.children) d2ToD1.set(childId, d1.id);
  }

  const deps = new Map<string, Set<string>>();
  for (const d1 of d1Nodes) deps.set(d1.id, new Set());

  for (const rel of Object.values(graph.relations)) {
    if (rel.type !== 'depends_on') continue;
    // Direct D1→D1
    if (d1Ids.has(rel.sourceId) && d1Ids.has(rel.targetId) && rel.sourceId !== rel.targetId) {
      deps.get(rel.sourceId)?.add(rel.targetId);
    }
    // Derived from D2→D2 across modules
    const srcD1 = d2ToD1.get(rel.sourceId);
    const tgtD1 = d2ToD1.get(rel.targetId);
    if (srcD1 && tgtD1 && srcD1 !== tgtD1) {
      deps.get(srcD1)?.add(tgtD1);
    }
  }

  const byName = new Map<string, string[]>();
  for (const d1 of d1Nodes) {
    const depNames = [...(deps.get(d1.id) ?? [])]
      .map(id => graph.nodes[id]?.name)
      .filter((n): n is string => !!n);
    byName.set(d1.name, depNames);
  }
  return byName;
}

/** Build intra-module D2→D2 dep map: file name → file names it imports */
function buildD2IntraDeps(graph: CodeGraph, d2Nodes: GraphNode[]): Map<string, string[]> {
  const d2Ids = new Set(d2Nodes.map(n => n.id));
  const idToName = new Map(d2Nodes.map(n => [n.id, n.name]));
  const deps = new Map<string, string[]>();
  for (const d2 of d2Nodes) deps.set(d2.name, []);

  for (const rel of Object.values(graph.relations)) {
    if (rel.type !== 'depends_on') continue;
    if (!d2Ids.has(rel.sourceId) || !d2Ids.has(rel.targetId)) continue;
    const srcName = idToName.get(rel.sourceId)!;
    const tgtName = idToName.get(rel.targetId)!;
    deps.get(srcName)?.push(tgtName);
  }
  return deps;
}

// ── Prompts ──────────────────────────────────────────────────────────────────

const OVERVIEW_SYSTEM = `You are an expert software architect. Generate a clear, comprehensible Mermaid architecture diagram.

Rules:
- Use "graph LR" layout
- Each D1 module becomes ONE node: ModuleName["ModuleName\\nBrief role description"]
- Add a classDef line: classDef mod fill:#1e3a5f,stroke:#3b82f6,color:#e2e8f0
- Apply :::mod to every node
- Each dependency arrow MUST have a short label: ModA -->|"what it uses"| ModB
- Use plain English, not file/function names in labels
- Max 1-2 sentence equivalent for node descriptions (keep short, use \\n for line break)
- Return ONLY valid Mermaid code. No markdown fences, no explanation.`;

function buildOverviewPrompt(graph: CodeGraph): string {
  const d1Nodes = getD1Nodes(graph);
  const deps = buildD1Deps(graph, d1Nodes);

  const moduleLines = d1Nodes.map(d1 => {
    const files = getD2Children(graph, d1).map(d2 => {
      const symbols = getD3Symbols(graph, d2);
      return `    - ${d2.name}${symbols.length ? ` (${symbols.join(', ')})` : ''}`;
    }).join('\n');
    return `Module: ${d1.name}\n${files}`;
  }).join('\n\n');

  const depLines = d1Nodes.map(d1 => {
    const d = deps.get(d1.name) ?? [];
    if (d.length === 0) return null;
    return `${d1.name} → ${d.join(', ')}`;
  }).filter(Boolean).join('\n');

  return `Project: ${graph.name}

Modules and their files/symbols:
${moduleLines}

Cross-module dependencies:
${depLines || '(none detected)'}

Generate the Mermaid overview architecture diagram.`;
}

const SERVICE_SYSTEM = `You are an expert software architect. Generate a clear Mermaid diagram for a single module.

Rules:
- Use "graph TD" layout
- Each file becomes ONE node: FileName["FileName\\nBrief role"]
- Entry-point files (not imported by peers): classDef entry fill:#1a3a2a,stroke:#22c55e,color:#e2e8f0
- Other files: classDef dep fill:#1a2744,stroke:#6366f1,color:#e2e8f0
- Apply :::entry or :::dep to every node
- Dependency arrows: FileA -->|"what it provides"| FileB
- Return ONLY valid Mermaid code. No markdown fences, no explanation.`;

function buildServicePrompt(graph: CodeGraph, d1Node: GraphNode): string {
  const d2Nodes = getD2Children(graph, d1Node);
  const intraDeps = buildD2IntraDeps(graph, d2Nodes);
  const importedByPeers = new Set(Object.values(intraDeps).flat());

  const fileLines = d2Nodes.map(d2 => {
    const symbols = getD3Symbols(graph, d2);
    const isEntry = !importedByPeers.has(d2.name) ? ' [entry point]' : '';
    return `- ${d2.name}${isEntry}${symbols.length ? `: ${symbols.join(', ')}` : ''}`;
  }).join('\n');

  const depLines = [...intraDeps.entries()]
    .filter(([, tgts]) => tgts.length > 0)
    .map(([src, tgts]) => `${src} → ${tgts.join(', ')}`)
    .join('\n');

  return `Module: ${d1Node.name} (part of ${graph.name})

Files:
${fileLines}

Internal dependencies:
${depLines || '(no internal dependencies)'}

Generate the Mermaid service diagram for this module.`;
}

// ── LLM calls ────────────────────────────────────────────────────────────────

async function callLLM(system: string, prompt: string, llmSettings: LLMSettings, signal?: AbortSignal): Promise<string> {
  const response = await llmService.sendMessage(
    [{ role: 'user', content: prompt }],
    system,
    llmSettings,
    signal,
  );
  // Strip markdown fences if LLM wraps the output
  return response.content
    .replace(/^```(?:mermaid)?\n?/m, '')
    .replace(/\n?```$/m, '')
    .trim();
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ArchitectureDiagramSet {
  overview: { name: string; code: string };
  services: { name: string; nodeId: string; code: string }[];
}

export interface ArchitectureProgressCallback {
  (message: string): void;
}

export async function generateAllArchitectureDiagrams(
  graph: CodeGraph,
  llmSettings: LLMSettings,
  onProgress?: ArchitectureProgressCallback,
  signal?: AbortSignal,
): Promise<ArchitectureDiagramSet> {
  const d1Nodes = getD1Nodes(graph);

  // Overview
  onProgress?.('Generating overview diagram…');
  const overviewCode = await callLLM(
    OVERVIEW_SYSTEM,
    buildOverviewPrompt(graph),
    llmSettings,
    signal,
  );

  // Per-service (only D1 nodes that have files)
  const services: ArchitectureDiagramSet['services'] = [];
  const d1WithFiles = d1Nodes.filter(n => n.children.length > 0);

  for (const d1 of d1WithFiles) {
    if (signal?.aborted) break;
    onProgress?.(`Generating diagram for ${d1.name}…`);
    const code = await callLLM(
      SERVICE_SYSTEM,
      buildServicePrompt(graph, d1),
      llmSettings,
      signal,
    );
    if (code) services.push({ name: d1.name, nodeId: d1.id, code });
  }

  return {
    overview: { name: `${graph.name} — Overview`, code: overviewCode },
    services,
  };
}
