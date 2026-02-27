/**
 * Automatic flow generation for CodeGraph.
 *
 * Two layers:
 *   1. Graph summary extraction — extracts D1-D3 nodes, relations with labels,
 *      symbol inventories, and import semantics to give the LLM deep context.
 *   2. LLM flow generation — rich prompt with file contents/symbols
 *   3. Orchestrator — returns empty if LLM unavailable (preserves existing flows)
 */

import { CodeGraph, GraphFlow, GraphFlowStep, GraphNode, LLMSettings } from '../types';
import { llmService, LLMConfigError, LLMRateLimitError } from './llmService';
import type { LogEntryFn } from './codeGraphAgentService';

const generateId = () => Math.random().toString(36).substr(2, 9);

// ── Layer 1: Graph Summary ─────────────────────────────────────────

interface FileSymbol {
  name: string;
  kind: string;  // 'function' | 'class' | 'interface' | 'variable'
}

interface FileSummary {
  nodeId: string;
  name: string;
  symbols: FileSymbol[];
  exportedSymbols: string[];     // names of D3 children (approximation of exports)
}

interface FileEdge {
  sourceId: string;
  targetId: string;
  sourceModule: string;
  targetModule: string;
  label: string;  // import name or relation type
  relationType: string;
}

interface GraphSummary {
  rootNodeId: string;
  modules: Array<{
    nodeId: string;
    name: string;
    files: FileSummary[];
  }>;
  fileEdges: FileEdge[];
  entryPoints: Array<{ nodeId: string; name: string; moduleNodeId: string }>;
  // D3-level call edges for richer understanding
  callEdges: Array<{ callerFile: string; callerSymbol: string; calleeFile: string; calleeSymbol: string }>;
}

function buildGraphSummary(graph: CodeGraph, scopeNodeId?: string): GraphSummary {
  const nodes = graph.nodes;
  const relations = Object.values(graph.relations);

  // D1 = modules (packages), D2 = files (modules), D3 = symbols
  let d1Nodes = Object.values(nodes).filter(n => n.depth === 1);
  let d2Nodes = Object.values(nodes).filter(n => n.depth === 2);
  let d3Nodes = Object.values(nodes).filter(n => n.depth === 3);

  // When scoped to a specific module, filter to only its children
  if (scopeNodeId && scopeNodeId !== graph.rootNodeId) {
    const scopeNode = nodes[scopeNodeId];
    if (scopeNode && scopeNode.depth === 1) {
      d1Nodes = [scopeNode];
      const childIds = new Set(scopeNode.children);
      d2Nodes = d2Nodes.filter(n => childIds.has(n.id));
      const d2Ids = new Set(d2Nodes.map(n => n.id));
      d3Nodes = d3Nodes.filter(n => n.parentId && d2Ids.has(n.parentId));
    }
  }

  // Build lookups
  const fileToModule = new Map<string, GraphNode>();
  for (const d2 of d2Nodes) {
    if (d2.parentId && nodes[d2.parentId]?.depth === 1) {
      fileToModule.set(d2.id, nodes[d2.parentId]);
    }
  }

  // D3 → parent D2 lookup
  const symbolToFile = new Map<string, string>(); // D3 nodeId → D2 nodeId
  for (const d3 of d3Nodes) {
    if (d3.parentId && nodes[d3.parentId]?.depth === 2) {
      symbolToFile.set(d3.id, d3.parentId);
    }
  }

  // Build file summaries with D3 symbol inventories
  const modules = d1Nodes.map(mod => ({
    nodeId: mod.id,
    name: mod.name,
    files: mod.children
      .map(cid => nodes[cid])
      .filter((n): n is GraphNode => !!n && n.depth === 2)
      .map(fileNode => {
        // Collect D3 children (symbols) for this file
        const symbols: FileSymbol[] = fileNode.children
          .map(sid => nodes[sid])
          .filter((s): s is GraphNode => !!s && s.depth === 3)
          .map(s => ({ name: s.name, kind: s.kind }));

        return {
          nodeId: fileNode.id,
          name: fileNode.name,
          symbols,
          exportedSymbols: symbols.map(s => s.name),
        };
      }),
  }));

  // File-level edges with labels (import names)
  const fileEdges: FileEdge[] = [];
  const d2Ids = new Set(d2Nodes.map(n => n.id));

  for (const rel of relations) {
    if (rel.type === 'contains') continue;
    if (!d2Ids.has(rel.sourceId) || !d2Ids.has(rel.targetId)) continue;

    const sourceMod = fileToModule.get(rel.sourceId);
    const targetMod = fileToModule.get(rel.targetId);
    fileEdges.push({
      sourceId: rel.sourceId,
      targetId: rel.targetId,
      sourceModule: sourceMod?.name || 'unknown',
      targetModule: targetMod?.name || 'unknown',
      label: rel.label || rel.type,
      relationType: rel.type,
    });
  }

  // D3-level call edges: gives the LLM function-to-function relationships
  const callEdges: GraphSummary['callEdges'] = [];
  for (const rel of relations) {
    if (rel.type !== 'calls') continue;
    const callerNode = nodes[rel.sourceId];
    const calleeNode = nodes[rel.targetId];
    if (!callerNode || !calleeNode) continue;
    if (callerNode.depth !== 3 || calleeNode.depth !== 3) continue;

    const callerFileId = symbolToFile.get(callerNode.id);
    const calleeFileId = symbolToFile.get(calleeNode.id);
    if (!callerFileId || !calleeFileId) continue;

    callEdges.push({
      callerFile: nodes[callerFileId]?.name || callerFileId,
      callerSymbol: callerNode.name,
      calleeFile: nodes[calleeFileId]?.name || calleeFileId,
      calleeSymbol: calleeNode.name,
    });
  }

  // Entry points: D2 nodes with 0 incoming depends_on, or matching entry patterns
  const incomingCount = new Map<string, number>();
  for (const d2 of d2Nodes) {
    incomingCount.set(d2.id, 0);
  }
  for (const edge of fileEdges) {
    incomingCount.set(edge.targetId, (incomingCount.get(edge.targetId) || 0) + 1);
  }

  const ENTRY_PATTERN = /^(index|main|app|content|background|server|cli)\./i;
  const entryPoints: GraphSummary['entryPoints'] = [];

  for (const d2 of d2Nodes) {
    const incoming = incomingCount.get(d2.id) || 0;
    const mod = fileToModule.get(d2.id);
    if (incoming === 0 || ENTRY_PATTERN.test(d2.name)) {
      entryPoints.push({
        nodeId: d2.id,
        name: d2.name,
        moduleNodeId: mod?.id || graph.rootNodeId,
      });
    }
  }

  // If no entry points found, use 3 nodes with fewest incoming edges
  if (entryPoints.length === 0) {
    const sorted = [...d2Nodes].sort(
      (a, b) => (incomingCount.get(a.id) || 0) - (incomingCount.get(b.id) || 0)
    );
    for (const node of sorted.slice(0, 3)) {
      const mod = fileToModule.get(node.id);
      entryPoints.push({
        nodeId: node.id,
        name: node.name,
        moduleNodeId: mod?.id || graph.rootNodeId,
      });
    }
  }

  return { rootNodeId: graph.rootNodeId, modules, fileEdges, entryPoints, callEdges };
}

// ── Layer 2: LLM Flow Generation ───────────────────────────────────

function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) return objMatch[0];

  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];

  return text.trim();
}

function buildFlowSystemPrompt(summary: GraphSummary, customPrompt?: string): string {
  // Build rich module structure with symbols per file
  const moduleList = summary.modules.map(m => {
    const files = m.files.map(f => {
      const symList = f.symbols.length > 0
        ? f.symbols.map(s => `${s.name} (${s.kind})`).join(', ')
        : 'no symbols extracted';
      return `    - "${f.name}" (nodeId: "${f.nodeId}")\n      Contains: ${symList}`;
    }).join('\n');
    return `  Module "${m.name}" (nodeId: "${m.nodeId}"):\n${files}`;
  }).join('\n\n');

  const validNodeIds = [
    summary.rootNodeId,
    ...summary.modules.map(m => m.nodeId),
    ...summary.modules.flatMap(m => m.files.map(f => f.nodeId)),
  ];

  const taskDescription = customPrompt
    ? `YOUR TASK: Generate flows that address the user's request. Focus on flows that are relevant to:\n"${customPrompt}"\n\nGenerate 1-5 focused flows matching the user's intent.`
    : 'YOUR TASK: Identify 5-15 critical runtime flows that represent real use cases and data paths.';

  return `You are a senior software architect. You are analyzing a codebase graph to identify the critical RUNTIME FLOWS — the actual paths data and control follow when the application runs.

You have access to:
- Module structure (which files belong to which functional module)
- File contents summary (functions, classes, interfaces, variables in each file)
- Import/dependency edges between files (with the imported symbol names)
- Function-to-function call relationships

${taskDescription}

QUALITY REQUIREMENTS:
1. Each flow must tell a STORY: "User does X → system processes via Y → result Z"
2. Step labels must be DESCRIPTIVE ACTIONS, not just file names. Example:
   - BAD:  { "label": "auth.ts" }
   - GOOD: { "label": "Validate JWT token and extract user claims" }
3. Sequence diagrams must be RICH and DETAILED:
   - Use participant aliases (short descriptive names, NOT node IDs)
   - Include alt/opt blocks for conditional paths
   - Include loop blocks for iteration
   - Include Note constructs for important side effects
   - Use -->> for return arrows, ->> for calls
   - Add meaningful labels on every arrow (what data flows, what action happens)
4. Mix of root-level (cross-module, scopeNodeId = "${summary.rootNodeId}") and module-level flows
5. Each flow: 3-9 steps, each step references a file nodeId from the valid list

VALID NODE IDs (you MUST only use these):
${validNodeIds.map(id => `  "${id}"`).join('\n')}

MODULE STRUCTURE WITH FILE CONTENTS:
${moduleList}

OUTPUT FORMAT — respond with ONLY this JSON object:
{
  "flows": [
    {
      "name": "Human-readable flow name",
      "description": "1-2 sentence description of what happens end-to-end",
      "scopeNodeId": "rootNodeId for cross-module OR moduleNodeId for internal",
      "steps": [
        { "nodeId": "file-nodeId", "label": "Descriptive action this file performs in this flow", "order": 0 }
      ],
      "sequenceDiagram": "sequenceDiagram\\n  participant Alias as Short Name\\n  Alias->>Other: action\\n  Other-->>Alias: response"
    }
  ]
}`;
}

function buildFlowUserPrompt(summary: GraphSummary): string {
  // File dependencies with import labels
  const allFiles = summary.modules.flatMap(m => m.files);
  const fileNameMap = new Map(allFiles.map(f => [f.nodeId, f.name]));

  const edges = summary.fileEdges.length > 0
    ? summary.fileEdges.slice(0, 200).map(e => {
        const srcName = fileNameMap.get(e.sourceId) || e.sourceId;
        const tgtName = fileNameMap.get(e.targetId) || e.targetId;
        const label = e.label !== e.relationType ? ` [imports: ${e.label}]` : '';
        return `  ${srcName} (${e.sourceModule}) → ${tgtName} (${e.targetModule})${label}`;
      }).join('\n')
    : '  (no file dependencies detected)';

  // Function-to-function call edges
  const calls = summary.callEdges.length > 0
    ? summary.callEdges.slice(0, 100).map(c =>
        `  ${c.callerSymbol} (in ${c.callerFile}) calls ${c.calleeSymbol} (in ${c.calleeFile})`
      ).join('\n')
    : '  (no function-level call edges detected)';

  const entries = summary.entryPoints.map(
    e => `  ${e.name} (nodeId: "${e.nodeId}")`
  ).join('\n');

  return `FILE DEPENDENCIES (what each file imports from others):\n${edges}\n\nFUNCTION CALL GRAPH:\n${calls}\n\nENTRY POINTS (likely starting points for flows):\n${entries}`;
}

function validateLLMFlows(
  raw: unknown,
  validNodeIds: Set<string>,
  rootNodeId: string,
  moduleNodeIds: Set<string>,
): Record<string, GraphFlow> | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  const flowsArr = Array.isArray(obj.flows) ? obj.flows : (Array.isArray(raw) ? raw : null);
  if (!flowsArr) return null;

  const flows: Record<string, GraphFlow> = {};
  let validCount = 0;

  for (const item of flowsArr) {
    if (typeof item !== 'object' || item === null) continue;
    const { name, description, scopeNodeId, steps, sequenceDiagram } = item as Record<string, unknown>;

    if (typeof name !== 'string' || !name) continue;
    if (typeof scopeNodeId !== 'string') continue;
    if (!Array.isArray(steps) || steps.length < 2) continue;

    // Validate scopeNodeId
    const validScope = scopeNodeId === rootNodeId || moduleNodeIds.has(scopeNodeId);
    if (!validScope) continue;

    // Validate steps
    const validSteps: GraphFlowStep[] = [];
    for (const step of steps) {
      if (typeof step !== 'object' || step === null) continue;
      const s = step as Record<string, unknown>;
      if (typeof s.nodeId !== 'string' || !validNodeIds.has(s.nodeId)) continue;
      validSteps.push({
        nodeId: s.nodeId,
        label: typeof s.label === 'string' ? s.label : s.nodeId,
        order: typeof s.order === 'number' ? s.order : validSteps.length,
      });
    }

    if (validSteps.length < 2) continue;

    // Validate sequence diagram
    let seqDiagram = typeof sequenceDiagram === 'string' ? sequenceDiagram : '';
    if (!seqDiagram.startsWith('sequenceDiagram')) {
      // Build a basic one from steps
      const participants = validSteps.map(
        s => `  participant ${s.nodeId} as ${s.label.replace(/\.[^.]+$/, '')}`
      ).join('\n');
      const arrows = validSteps.slice(0, -1).map(
        (s, i) => `  ${s.nodeId}->>${validSteps[i + 1].nodeId}: calls`
      ).join('\n');
      seqDiagram = `sequenceDiagram\n${participants}\n${arrows}`;
    }

    const id = generateId();
    flows[id] = {
      id,
      name,
      description: typeof description === 'string' ? description : '',
      scopeNodeId,
      steps: validSteps,
      sequenceDiagram: seqDiagram,
    };
    validCount++;
  }

  // Accept if at least 50% of entries passed validation
  if (validCount === 0) return null;
  if (flowsArr.length > 0 && validCount / flowsArr.length < 0.5) return null;

  return flows;
}

const MAX_RETRIES = 2;

async function generateFlowsWithLLM(
  graph: CodeGraph,
  summary: GraphSummary,
  llmSettings: LLMSettings,
  customPrompt?: string,
  signal?: AbortSignal,
): Promise<Record<string, GraphFlow> | null> {
  const validNodeIds = new Set<string>([
    summary.rootNodeId,
    ...summary.modules.map(m => m.nodeId),
    ...summary.modules.flatMap(m => m.files.map(f => f.nodeId)),
  ]);
  const moduleNodeIds = new Set(summary.modules.map(m => m.nodeId));

  // Cap file count in prompt for very large graphs
  let promptSummary = summary;
  const totalFiles = summary.modules.reduce((sum, m) => sum + m.files.length, 0);
  if (totalFiles > 150) {
    // Keep proportional representation but cap total
    promptSummary = {
      ...summary,
      modules: summary.modules.map(m => ({
        ...m,
        files: m.files.slice(0, Math.max(5, Math.floor(150 * m.files.length / totalFiles))),
      })),
      // Also cap edges and calls
      fileEdges: summary.fileEdges.slice(0, 200),
      callEdges: summary.callEdges.slice(0, 100),
    };
  }

  const systemPrompt = buildFlowSystemPrompt(promptSummary, customPrompt);
  const userPrompt = buildFlowUserPrompt(promptSummary);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const basePrompt = customPrompt
        ? `${userPrompt}\n\nADDITIONAL CONTEXT FROM USER:\n${customPrompt}`
        : userPrompt;
      const userContent = attempt === 0
        ? basePrompt
        : `${basePrompt}\n\nPrevious response was invalid. Return ONLY valid JSON matching the schema. All nodeIds must come from the valid list. Make sure sequenceDiagram starts with "sequenceDiagram".`;

      const response = await llmService.sendMessage(
        [{ role: 'user', content: userContent }],
        systemPrompt,
        llmSettings,
        signal,
      );

      const jsonStr = extractJSON(response.content);
      const parsed = JSON.parse(jsonStr);
      const validated = validateLLMFlows(parsed, validNodeIds, summary.rootNodeId, moduleNodeIds);

      if (validated && Object.keys(validated).length > 0) {
        console.log(`[CodeGraph Flows] LLM generated ${Object.keys(validated).length} flows`);
        return validated;
      }

      console.warn(`[CodeGraph Flows] LLM attempt ${attempt + 1}: validation failed`);
    } catch (err) {
      if (err instanceof LLMRateLimitError || err instanceof LLMConfigError) throw err;
      console.warn(`[CodeGraph Flows] LLM attempt ${attempt + 1} error:`, err);
    }
  }

  console.warn('[CodeGraph Flows] LLM generation failed after retries');
  return null;
}

// ── Layer 3: Orchestrator ──────────────────────────────────────────

export interface FlowGenerationResult {
  flows: Record<string, GraphFlow>;
  warnings: string[];
}

export interface FlowGenerationOptions {
  scopeNodeId?: string;    // only generate for this scope level
  customPrompt?: string;   // user's additional context/question
}

export async function generateFlows(
  graph: CodeGraph,
  llmSettings?: LLMSettings,
  onProgress?: (step: string, current: number, total: number) => void,
  options?: FlowGenerationOptions,
  onLogEntry?: LogEntryFn,
  signal?: AbortSignal,
): Promise<FlowGenerationResult> {
  const warnings: string[] = [];
  const { scopeNodeId, customPrompt } = options || {};

  // Check for empty graph
  const d2Nodes = Object.values(graph.nodes).filter(n => n.depth === 2);
  if (d2Nodes.length === 0) {
    warnings.push('Graph has no file-level nodes — cannot generate flows');
    return { flows: {}, warnings };
  }

  // Flows require AI — bail early if not configured
  if (!llmSettings) {
    warnings.push('Flow generation requires AI — configure AI settings to generate flows');
    onLogEntry?.('flow', 'Skipped: no AI configured');
    return { flows: {}, warnings };
  }

  const config = llmSettings.providers[llmSettings.activeProvider];
  if (!config?.apiKey) {
    warnings.push('Flow generation requires an API key — configure AI settings');
    onLogEntry?.('flow', 'Skipped: no API key configured');
    return { flows: {}, warnings };
  }

  onProgress?.('Analyzing graph structure', 0, 2);
  onLogEntry?.('flow', 'Analyzing graph structure');
  const summary = buildGraphSummary(graph, scopeNodeId);

  onProgress?.('Generating flows with AI', 1, 2);
  onLogEntry?.('flow', 'Generating flows with AI');
  const llmFlows = await generateFlowsWithLLM(graph, summary, llmSettings, customPrompt, signal);

  if (llmFlows && Object.keys(llmFlows).length > 0) {
    if (scopeNodeId) {
      for (const flow of Object.values(llmFlows)) {
        flow.scopeNodeId = scopeNodeId;
      }
    }
    onProgress?.('Done', 2, 2);
    onLogEntry?.('flow', `Generated ${Object.keys(llmFlows).length} flows`);
    return { flows: llmFlows, warnings };
  }

  warnings.push('AI flow generation failed after retries');
  onLogEntry?.('flow', 'AI flow generation failed after retries');
  onProgress?.('Done', 2, 2);
  return { flows: {}, warnings };
}

export const codeGraphFlowService = {
  generateFlows,
  buildGraphSummary,
};
