/**
 * Agentic pipeline for CodeGraph generation.
 *
 * Three specialized agents coordinated by a deterministic orchestrator:
 *   - Analyste:     code-aware semantic clustering (replaces Agent 1 + Agent 2)
 *   - Synthétiseur: code-aware flow generation     (replaces codeGraphFlowService one-shot)
 *   - Évaluateur:   AST-ground-truth validation    (new — bounded correction rounds)
 *
 * Communication: blackboard pattern via GraphBuildContext.
 * Organization:  sequential pipeline, max 2 rounds per agent before fallback.
 *
 * Public API:
 *   orchestrateCodebaseAnalysis(analysis, provider, llmSettings, ...) → CodebaseAnalysis
 *   orchestrateFlowGeneration(graph, clusters, provider, llmSettings, ...) → Record<string, GraphFlow>
 */

import {
  CodebaseAnalysis, CodebaseModule, AnalyzedFile,
  LLMSettings, GraphFlow, GraphFlowStep, CodeGraph, AgentToolStep,
} from '../types';
import { llmService, LLMConfigError, LLMRateLimitError } from './llmService';
import { groupByFunctionalHeuristics } from './codeGraphHeuristicGrouper';
import type { LogEntryFn } from './codeGraphAgentService';
import type { AgentToolDefinition } from './agentToolService';
import type { IFileSystemProvider } from './IFileSystemProvider';

const generateId = () => Math.random().toString(36).substr(2, 9);

// ── Shared types ───────────────────────────────────────────────────────────────

export interface SemanticCluster {
  name: string;
  description: string;
  files: string[];
}

interface ValidationIssue {
  type: 'hallucinated_relation' | 'missing_coverage' | 'invalid_flow_step' | 'misplaced_file' | 'trivial_flow';
  severity: 'warning' | 'error';
  message: string;
  target?: string;
}

// ── Blackboard ─────────────────────────────────────────────────────────────────

interface GraphBuildContext {
  analysis: CodebaseAnalysis;
  astImportPairs: Set<string>;          // "sourceFile→targetFile" from real imports
  fileByPath: Map<string, AnalyzedFile>;
  provider?: IFileSystemProvider;
  fileCache: Map<string, string>;
  semanticClusters?: SemanticCluster[];
}

function buildContext(
  analysis: CodebaseAnalysis,
  provider?: IFileSystemProvider,
): GraphBuildContext {
  const fileByPath = new Map<string, AnalyzedFile>();
  const astImportPairs = new Set<string>();

  const allFiles = analysis.modules.flatMap(m => m.files);
  const allFilePaths = new Set(allFiles.map(f => f.filePath));

  for (const file of allFiles) {
    fileByPath.set(file.filePath, file);
    for (const imp of file.imports) {
      if (imp.isExternal) continue;
      // Resolve import path to an actual file path
      const base = imp.source.replace(/^@\//, '').replace(/^\.\//, '');
      for (const target of allFilePaths) {
        const norm = target.replace(/\.[^/.]+$/, '');
        if (norm.endsWith(base) || target === imp.source) {
          astImportPairs.add(`${file.filePath}→${target}`);
          break;
        }
      }
    }
  }

  return { analysis, astImportPairs, fileByPath, provider, fileCache: new Map() };
}

// ── Shared utilities ───────────────────────────────────────────────────────────

function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const obj = text.match(/\{[\s\S]*\}/);
  if (obj) return obj[0];
  const arr = text.match(/\[[\s\S]*\]/);
  if (arr) return arr[0];
  return text.trim();
}

async function readFileCached(ctx: GraphBuildContext, path: string, maxLines = 150): Promise<string> {
  const cacheKey = `${path}:${maxLines}`;
  if (ctx.fileCache.has(cacheKey)) return ctx.fileCache.get(cacheKey)!;
  if (!ctx.provider) return '(file content not available — no filesystem provider)';
  try {
    const content = await ctx.provider.readFile(path);
    const limited = content.split('\n').slice(0, maxLines).join('\n');
    ctx.fileCache.set(cacheKey, limited);
    return limited;
  } catch {
    return '(could not read file)';
  }
}

// ── Analyste Agent ─────────────────────────────────────────────────────────────
// Identifies semantic domains by exploring code structure with targeted file reads.

const ANALYSTE_SYSTEM = `You are a senior software architect specializing in domain-driven design.

Your task: analyze a codebase and group files into cohesive SEMANTIC DOMAINS — not technical layers.

You have tools:
- list_files_by_coupling(): list files sorted by import connections. Start here.
- get_file_info(path): AST-extracted symbols + imports for a file. Fast and cheap.
- read_file(path): actual source code (first 150 lines). Use selectively on pivotal/ambiguous files.

STRATEGY:
1. Call list_files_by_coupling() first to see the most connected files
2. Use get_file_info() broadly to understand roles without reading everything
3. Use read_file() only for files where you're unsure about their domain (max 8 reads)
4. Identify 3-10 semantic domains based on BUSINESS RESPONSIBILITY

DOMAIN RULES:
- Name by WHAT the code does: "Diagram Editor", "Code Intelligence", "Workspace Management"
- NEVER use: "Services", "Hooks", "Components", "Utils", "Core", "Lib"
- A hook + its service + its component → same domain if they serve the same feature
- Cross-directory grouping is expected
- Every file must appear in exactly one cluster

When ready, output ONLY this JSON (no other text):
{
  "clusters": [
    {
      "name": "Domain Name",
      "description": "What this domain handles (1-2 sentences)",
      "files": ["exact/path/to/file.ts", ...]
    }
  ]
}`;

function buildAnalysteTools(): AgentToolDefinition[] {
  return [
    {
      name: 'list_files_by_coupling',
      description: 'List all files sorted by import connections (most-connected first). Good starting point for analysis.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'get_file_info',
      description: 'Get AST-extracted symbols and imports for a file. Cheaper than read_file — use broadly.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Relative file path from repo root' } },
        required: ['path'],
      },
    },
    {
      name: 'read_file',
      description: 'Read actual source code (first 150 lines). Use selectively for pivotal or ambiguous files only.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Relative file path from repo root' } },
        required: ['path'],
      },
    },
  ];
}

function buildAnalysteExecutor(ctx: GraphBuildContext) {
  const importedCount = new Map<string, number>();
  for (const file of ctx.analysis.modules.flatMap(m => m.files)) {
    for (const imp of file.imports) {
      if (!imp.isExternal) {
        importedCount.set(imp.source, (importedCount.get(imp.source) || 0) + 1);
      }
    }
  }

  return async (name: string, args: Record<string, unknown>): Promise<AgentToolStep> => {
    switch (name) {
      case 'list_files_by_coupling': {
        const allFiles = ctx.analysis.modules.flatMap(m => m.files);
        const sorted = allFiles
          .map(f => ({
            path: f.filePath,
            language: f.language,
            importedByCount: importedCount.get(f.filePath) || 0,
            importsCount: f.imports.filter(i => !i.isExternal).length,
            symbolCount: f.symbols.length,
          }))
          .sort((a, b) => (b.importedByCount + b.importsCount) - (a.importedByCount + a.importsCount))
          .slice(0, 60);
        return {
          toolName: name, args,
          result: JSON.stringify(sorted, null, 2),
          label: 'list_files_by_coupling()',
        };
      }

      case 'get_file_info': {
        const path = String(args.path || '');
        const file = ctx.fileByPath.get(path);
        if (!file) {
          return { toolName: name, args, result: `File not found: ${path}`, label: `get_file_info("${path}")` };
        }
        const info = {
          path: file.filePath,
          language: file.language,
          symbols: file.symbols.map(s => `${s.name} (${s.kind})`),
          imports: file.imports.map(i => `${i.name} from "${i.source}"${i.isExternal ? ' [external]' : ''}`),
          exports: file.exportedSymbols,
        };
        return {
          toolName: name, args,
          result: JSON.stringify(info, null, 2),
          label: `get_file_info("${path}")`,
        };
      }

      case 'read_file': {
        const path = String(args.path || '');
        const content = await readFileCached(ctx, path, 150);
        return { toolName: name, args, result: content, label: `read_file("${path}")` };
      }

      default:
        return { toolName: name, args, result: 'Unknown tool', label: name };
    }
  };
}

async function runAnalysteAgent(
  ctx: GraphBuildContext,
  llmSettings: LLMSettings,
  onLog?: LogEntryFn,
  signal?: AbortSignal,
  previousIssues?: ValidationIssue[],
): Promise<SemanticCluster[] | null> {
  const allFiles = ctx.analysis.modules.flatMap(m => m.files);
  const allFilePaths = new Set(allFiles.map(f => f.filePath));

  let prompt = `Analyze this codebase and identify semantic domains.\n\nFILE LIST (${allFiles.length} files):\n`;
  prompt += allFiles.map(f => `- ${f.filePath} (${f.language})`).join('\n');
  prompt += '\n\nUse your tools to explore key files, then output the JSON cluster mapping.';

  if (previousIssues && previousIssues.length > 0) {
    const errorText = previousIssues
      .filter(i => i.severity === 'error')
      .map(i => `- ${i.message}${i.target ? ` [${i.target}]` : ''}`)
      .join('\n');
    if (errorText) prompt += `\n\nISSUES FROM PREVIOUS ATTEMPT (fix these):\n${errorText}`;
  }

  onLog?.('ai-cluster', 'Analyste: exploring codebase structure...');

  try {
    const result = await llmService.runAgentLoop(
      [{ role: 'user', content: prompt }],
      ANALYSTE_SYSTEM,
      buildAnalysteTools(),
      buildAnalysteExecutor(ctx),
      llmSettings,
      { signal, source: 'code-agent-analyste' },
    );

    onLog?.('ai-cluster', `Analyste: ${result.toolSteps.length} tool calls — parsing clusters`);

    const jsonStr = extractJSON(result.content);
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed.clusters)) return null;

    const assigned = new Set<string>();
    const clusters: SemanticCluster[] = [];

    for (const c of parsed.clusters) {
      if (typeof c.name !== 'string' || !Array.isArray(c.files)) continue;
      const validFiles = (c.files as unknown[])
        .filter((f): f is string => typeof f === 'string' && allFilePaths.has(f) && !assigned.has(f));
      validFiles.forEach(f => assigned.add(f));
      if (validFiles.length > 0) {
        clusters.push({ name: c.name, description: String(c.description || ''), files: validFiles });
      }
    }

    // Unassigned files go to "Other"
    const unassigned = [...allFilePaths].filter(f => !assigned.has(f));
    if (unassigned.length > 0) {
      clusters.push({ name: 'Other', description: 'Files not assigned to a specific domain', files: unassigned });
    }

    onLog?.('ai-cluster', `Analyste: ${clusters.length} domains identified`);
    return clusters;

  } catch (err) {
    if (err instanceof LLMRateLimitError || err instanceof LLMConfigError) throw err;
    onLog?.('ai-cluster', `Analyste failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Évaluateur — Phase 1: cluster validation ──────────────────────────────────

async function evaluateClusters(
  ctx: GraphBuildContext,
  clusters: SemanticCluster[],
  llmSettings: LLMSettings,
  onLog?: LogEntryFn,
): Promise<ValidationIssue[]> {
  const allFiles = ctx.analysis.modules.flatMap(m => m.files);
  const allFilePaths = new Set(allFiles.map(f => f.filePath));
  const coveredFiles = new Set(clusters.flatMap(c => c.files));
  const uncoveredRate = (allFilePaths.size - coveredFiles.size) / Math.max(allFilePaths.size, 1);

  // Build file→cluster map for import crossing check
  const fileToCluster = new Map<string, string>();
  for (const c of clusters) {
    for (const f of c.files) fileToCluster.set(f, c.name);
  }

  // Sample import pairs that cross cluster boundaries (could be legitimate or misplacement)
  const crossBoundarySample = [...ctx.astImportPairs]
    .filter(pair => {
      const [src, tgt] = pair.split('→');
      const srcCluster = fileToCluster.get(src);
      const tgtCluster = fileToCluster.get(tgt);
      return srcCluster && tgtCluster && srcCluster !== tgtCluster;
    })
    .slice(0, 30);

  const clusterSummary = clusters.map(c => ({
    name: c.name,
    description: c.description,
    fileCount: c.files.length,
    sampleFiles: c.files.slice(0, 6),
  }));

  const prompt = `You are an adversarial architecture reviewer. Find real flaws in these semantic domain clusters.

CLUSTERS:
${JSON.stringify(clusterSummary, null, 2)}

UNCOVERED FILE RATE: ${(uncoveredRate * 100).toFixed(1)}%

CROSS-BOUNDARY IMPORT PAIRS (files in different clusters that import each other):
${crossBoundarySample.length > 0 ? crossBoundarySample.join('\n') : '(none detected)'}

REVIEW:
1. Flag files likely misplaced based on their imports crossing boundaries heavily
2. Flag clusters that appear to group by code type rather than business domain (e.g., a cluster named like "Services" or "Hooks")
3. Flag if uncovered file rate > 10%
4. Do NOT flag legitimate cross-boundary imports (e.g., a shared utility used by multiple domains)

Output ONLY this JSON:
{
  "issues": [
    {
      "type": "misplaced_file" | "missing_coverage" | "hallucinated_relation",
      "severity": "warning" | "error",
      "message": "specific actionable description",
      "target": "cluster or file name"
    }
  ]
}`;

  onLog?.('ai-eval', 'Évaluateur: validating semantic clusters...');

  try {
    const response = await llmService.sendMessage(
      [{ role: 'user', content: prompt }],
      'You are an adversarial architecture reviewer. Be rigorous and specific.',
      llmSettings,
      { source: 'code-agent-evaluateur' },
    );

    const parsed = JSON.parse(extractJSON(response.content));
    if (!Array.isArray(parsed.issues)) return [];

    const issues: ValidationIssue[] = (parsed.issues as unknown[])
      .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
      .map(i => ({
        type: (i.type as ValidationIssue['type']) || 'misplaced_file',
        severity: (i.severity as ValidationIssue['severity']) || 'warning',
        message: String(i.message || ''),
        target: i.target ? String(i.target) : undefined,
      }));

    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    onLog?.('ai-eval', `Évaluateur clusters: ${errors} errors, ${warnings} warnings`);
    return issues;

  } catch {
    onLog?.('ai-eval', 'Évaluateur cluster validation failed (non-fatal)');
    return [];
  }
}

// ── Synthétiseur Agent ─────────────────────────────────────────────────────────
// Generates runtime flows with actual code awareness via file reads and relation queries.

const SYNTHESEUR_SYSTEM = `You are a senior software architect identifying RUNTIME FLOWS in a codebase.

A flow = a named sequence of operations that actually happens at runtime, not just a static dependency.

You have tools:
- get_cluster_files(cluster_name): list files (with nodeIds) in a semantic cluster
- get_node_relations(node_id): call/import relations for a graph node (from AST ground truth)
- read_file(path): actual source code (first 200 lines). Use for entry points and key orchestrators.

STRATEGY:
1. Call get_cluster_files() on 2-3 clusters to find candidate entry points
2. Use get_node_relations() to trace the call graph from entry points
3. Use read_file() on key orchestrators to confirm how they chain calls (max 6 reads)
4. Generate 5-15 flows that each tell a RUNTIME STORY

FLOW QUALITY:
- Each flow: 3-9 steps. Each step references a real file nodeId from the graph.
- Steps must follow real import/call paths (confirmed via get_node_relations)
- Sequence diagrams: rich, with alt/loop/opt blocks and labeled arrows
- Use descriptive participant aliases, NOT node IDs

When ready, output ONLY this JSON:
{
  "flows": [
    {
      "name": "Human-readable flow name",
      "description": "What happens end-to-end (1-2 sentences)",
      "scopeNodeId": "rootNodeId OR a D1 module nodeId",
      "steps": [
        { "nodeId": "file-nodeId", "label": "What this file does in this flow", "order": 0 }
      ],
      "sequenceDiagram": "sequenceDiagram\\n  participant A as Name\\n  A->>B: action\\n  B-->>A: response"
    }
  ]
}`;

function buildSyntheseurTools(): AgentToolDefinition[] {
  return [
    {
      name: 'get_cluster_files',
      description: 'List all files (with graph nodeIds) in a semantic cluster. Use to find entry points.',
      parameters: {
        type: 'object',
        properties: { cluster_name: { type: 'string', description: 'Cluster/domain name' } },
        required: ['cluster_name'],
      },
    },
    {
      name: 'get_node_relations',
      description: 'Get all call/import relations for a graph node (from AST ground truth). Use to trace call chains.',
      parameters: {
        type: 'object',
        properties: { node_id: { type: 'string', description: 'Graph node ID' } },
        required: ['node_id'],
      },
    },
    {
      name: 'read_file',
      description: 'Read source code of a file (first 200 lines). Use for key orchestrators/entry points only.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Relative file path from repo root' } },
        required: ['path'],
      },
    },
  ];
}

function buildSyntheseurExecutor(ctx: GraphBuildContext, graph: CodeGraph) {
  // Build filePath → nodeId lookup
  const filePathToNodeId = new Map<string, string>();
  for (const node of Object.values(graph.nodes)) {
    if (node.sourceRef) filePathToNodeId.set(node.sourceRef.filePath, node.id);
  }

  return async (name: string, args: Record<string, unknown>): Promise<AgentToolStep> => {
    switch (name) {
      case 'get_cluster_files': {
        const clusterName = String(args.cluster_name || '');
        const cluster = ctx.semanticClusters?.find(c => c.name === clusterName);
        if (!cluster) {
          const names = ctx.semanticClusters?.map(c => c.name).join(', ') || 'none';
          return {
            toolName: name, args,
            result: `Cluster not found. Available: ${names}`,
            label: `get_cluster_files("${clusterName}")`,
          };
        }
        const files = cluster.files.map(f => {
          const nodeId = filePathToNodeId.get(f);
          const node = nodeId ? graph.nodes[nodeId] : null;
          return { path: f, nodeId: nodeId || null, nodeName: node?.name || null, depth: node?.depth ?? null };
        });
        return {
          toolName: name, args,
          result: JSON.stringify(files, null, 2),
          label: `get_cluster_files("${clusterName}")`,
        };
      }

      case 'get_node_relations': {
        const nodeId = String(args.node_id || '');
        const node = graph.nodes[nodeId];
        if (!node) {
          return { toolName: name, args, result: `Node not found: ${nodeId}`, label: `get_node_relations("${nodeId}")` };
        }
        const outgoing = Object.values(graph.relations)
          .filter(r => r.sourceId === nodeId && r.type !== 'contains')
          .map(r => ({
            direction: 'outgoing',
            type: r.type,
            targetId: r.targetId,
            targetName: graph.nodes[r.targetId]?.name || r.targetId,
            targetFile: graph.nodes[r.targetId]?.sourceRef?.filePath || null,
          }));
        const incoming = Object.values(graph.relations)
          .filter(r => r.targetId === nodeId && r.type !== 'contains')
          .map(r => ({
            direction: 'incoming',
            type: r.type,
            sourceId: r.sourceId,
            sourceName: graph.nodes[r.sourceId]?.name || r.sourceId,
            sourceFile: graph.nodes[r.sourceId]?.sourceRef?.filePath || null,
          }));
        return {
          toolName: name, args,
          result: JSON.stringify({ nodeId, name: node.name, file: node.sourceRef?.filePath, outgoing, incoming }, null, 2),
          label: `get_node_relations("${node.name}")`,
        };
      }

      case 'read_file': {
        const path = String(args.path || '');
        const content = await readFileCached(ctx, path, 200);
        return { toolName: name, args, result: content, label: `read_file("${path}")` };
      }

      default:
        return { toolName: name, args, result: 'Unknown tool', label: name };
    }
  };
}

async function runSyntheseurAgent(
  ctx: GraphBuildContext,
  graph: CodeGraph,
  llmSettings: LLMSettings,
  onLog?: LogEntryFn,
  signal?: AbortSignal,
  previousIssues?: ValidationIssue[],
): Promise<Record<string, GraphFlow> | null> {
  const clusterList = ctx.semanticClusters?.map(c =>
    `  "${c.name}" (${c.files.length} files) — ${c.description}`
  ).join('\n') || '(no clusters)';

  let prompt = `Generate runtime flows for this codebase.\n\nSEMANTIC CLUSTERS:\n${clusterList}\n\n`;
  prompt += `GRAPH: ${Object.keys(graph.nodes).length} nodes, rootNodeId="${graph.rootNodeId}"\n\n`;
  prompt += 'Explore entry points via get_cluster_files, trace call chains via get_node_relations, then output flows JSON.';

  if (previousIssues && previousIssues.length > 0) {
    const errorText = previousIssues
      .filter(i => i.severity === 'error')
      .map(i => `- ${i.message}${i.target ? ` [${i.target}]` : ''}`)
      .join('\n');
    if (errorText) prompt += `\n\nISSUES FROM PREVIOUS ATTEMPT (fix these):\n${errorText}`;
  }

  onLog?.('ai-synth', 'Synthétiseur: tracing runtime flows...');

  try {
    const result = await llmService.runAgentLoop(
      [{ role: 'user', content: prompt }],
      SYNTHESEUR_SYSTEM,
      buildSyntheseurTools(),
      buildSyntheseurExecutor(ctx, graph),
      llmSettings,
      { signal, source: 'code-agent-syntheseur' },
    );

    onLog?.('ai-synth', `Synthétiseur: ${result.toolSteps.length} tool calls — parsing flows`);

    const jsonStr = extractJSON(result.content);
    const parsed = JSON.parse(jsonStr);
    const flows = validateAndBuildFlows(parsed, graph);

    if (!flows) {
      onLog?.('ai-synth', 'Synthétiseur: flow validation failed');
      return null;
    }

    onLog?.('ai-synth', `Synthétiseur: ${Object.keys(flows).length} valid flows generated`);
    return flows;

  } catch (err) {
    if (err instanceof LLMRateLimitError || err instanceof LLMConfigError) throw err;
    onLog?.('ai-synth', `Synthétiseur failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Flow validation (resolves nodeIds by name, validates steps) ────────────────

function validateAndBuildFlows(raw: unknown, graph: CodeGraph): Record<string, GraphFlow> | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;
  const flowsArr = Array.isArray(obj.flows) ? obj.flows : null;
  if (!flowsArr) return null;

  // Build valid node sets
  const d1Ids = new Set(Object.values(graph.nodes).filter(n => n.depth === 1).map(n => n.id));
  const d2Ids = new Set(Object.values(graph.nodes).filter(n => n.depth === 2).map(n => n.id));
  const allValidIds = new Set([graph.rootNodeId, ...d1Ids, ...d2Ids]);

  // Name→nodeId lookup (flexible: with/without extension, case-insensitive)
  const nameToId = new Map<string, string>();
  for (const node of Object.values(graph.nodes)) {
    const lower = node.name.toLowerCase();
    if (!nameToId.has(lower)) nameToId.set(lower, node.id);
    const noExt = node.name.replace(/\.[^.]+$/, '').toLowerCase();
    if (!nameToId.has(noExt)) nameToId.set(noExt, node.id);
  }

  const resolveId = (id: string): string | null => {
    if (allValidIds.has(id)) return id;
    const byName = nameToId.get(id.toLowerCase());
    if (byName && allValidIds.has(byName)) return byName;
    return null;
  };

  const flows: Record<string, GraphFlow> = {};

  for (const item of flowsArr) {
    if (typeof item !== 'object' || item === null) continue;
    const { name, description, scopeNodeId, steps, sequenceDiagram } = item as Record<string, unknown>;
    if (typeof name !== 'string' || !name) continue;
    if (!Array.isArray(steps) || steps.length < 2) continue;

    // Resolve scope — default to root if unresolvable
    let resolvedScope = typeof scopeNodeId === 'string' ? resolveId(scopeNodeId) : null;
    if (!resolvedScope) resolvedScope = graph.rootNodeId;

    // Validate steps
    const validSteps: GraphFlowStep[] = [];
    for (const step of steps) {
      if (typeof step !== 'object' || step === null) continue;
      const s = step as Record<string, unknown>;
      if (typeof s.nodeId !== 'string') continue;
      const resolved = resolveId(s.nodeId);
      if (!resolved) continue;
      validSteps.push({
        nodeId: resolved,
        label: typeof s.label === 'string' ? s.label : s.nodeId,
        order: typeof s.order === 'number' ? s.order : validSteps.length,
      });
    }

    if (validSteps.length < 2) continue;

    // Build sequence diagram fallback
    let seqDiagram = typeof sequenceDiagram === 'string' ? sequenceDiagram : '';
    if (!seqDiagram.startsWith('sequenceDiagram')) {
      const parts = validSteps.map(
        s => `  participant ${s.nodeId} as ${s.label.replace(/\.[^.]+$/, '')}`
      ).join('\n');
      const arrows = validSteps.slice(0, -1).map(
        (s, i) => `  ${s.nodeId}->>${validSteps[i + 1].nodeId}: calls`
      ).join('\n');
      seqDiagram = `sequenceDiagram\n${parts}\n${arrows}`;
    }

    const id = generateId();
    flows[id] = {
      id, name,
      description: typeof description === 'string' ? description : '',
      scopeNodeId: resolvedScope,
      steps: validSteps,
      sequenceDiagram: seqDiagram,
    };
  }

  return Object.keys(flows).length > 0 ? flows : null;
}

// ── Évaluateur — Phase 2: flow validation ────────────────────────────────────

async function evaluateFlows(
  ctx: GraphBuildContext,
  graph: CodeGraph,
  flows: Record<string, GraphFlow>,
  llmSettings: LLMSettings,
  onLog?: LogEntryFn,
): Promise<ValidationIssue[]> {
  // Find files/nodes not covered by any flow step
  const coveredNodeIds = new Set(Object.values(flows).flatMap(f => f.steps.map(s => s.nodeId)));
  const allD2Ids = Object.values(graph.nodes).filter(n => n.depth === 2).map(n => n.id);
  const uncoveredRate = (allD2Ids.length - coveredNodeIds.size) / Math.max(allD2Ids.length, 1);

  const flowSummary = Object.values(flows).map(f => ({
    name: f.name,
    description: f.description,
    stepCount: f.steps.length,
    stepFiles: f.steps.map(s => graph.nodes[s.nodeId]?.sourceRef?.filePath || s.nodeId),
  }));

  // Sample AST relations to check if flow steps actually have connections
  const astRelSample = [...ctx.astImportPairs].slice(0, 50).join('\n');

  const prompt = `You are an adversarial flow reviewer. Find flows that misrepresent actual runtime behavior.

FLOWS (${Object.keys(flows).length} total):
${JSON.stringify(flowSummary, null, 2)}

UNCOVERED FILE RATE: ${(uncoveredRate * 100).toFixed(1)}%

ACTUAL IMPORT PAIRS (AST ground truth — sample):
${astRelSample}

REVIEW:
1. Flag flows where consecutive steps have NO import/call relationship in the AST
2. Flag trivial flows (< 3 meaningful steps, or just listing unrelated files)
3. Flag flows with duplicate or redundant coverage
4. Do NOT flag flows that skip intermediate files (abstraction is OK)

Output ONLY this JSON:
{
  "issues": [
    {
      "type": "invalid_flow_step" | "trivial_flow" | "hallucinated_relation",
      "severity": "warning" | "error",
      "message": "specific description",
      "target": "flow name"
    }
  ]
}`;

  onLog?.('ai-eval', 'Évaluateur: validating flows against AST...');

  try {
    const response = await llmService.sendMessage(
      [{ role: 'user', content: prompt }],
      'You are an adversarial flow reviewer. Be rigorous and specific.',
      llmSettings,
      { source: 'code-agent-evaluateur' },
    );

    const parsed = JSON.parse(extractJSON(response.content));
    if (!Array.isArray(parsed.issues)) return [];

    const issues: ValidationIssue[] = (parsed.issues as unknown[])
      .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
      .map(i => ({
        type: (i.type as ValidationIssue['type']) || 'invalid_flow_step',
        severity: (i.severity as ValidationIssue['severity']) || 'warning',
        message: String(i.message || ''),
        target: i.target ? String(i.target) : undefined,
      }));

    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    onLog?.('ai-eval', `Évaluateur flows: ${errors} errors, ${warnings} warnings`);
    return issues;

  } catch {
    onLog?.('ai-eval', 'Évaluateur flow validation failed (non-fatal)');
    return [];
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Phase 1: semantic clustering.
 * Replaces analyzeCodebaseWithAI() — returns CodebaseAnalysis with smart modules.
 * Runs Analyste (max 2 rounds) with Évaluateur feedback between rounds.
 */
export async function orchestrateCodebaseAnalysis(
  analysis: CodebaseAnalysis,
  provider: IFileSystemProvider | undefined,
  llmSettings: LLMSettings,
  onProgress?: (step: string, current: number, total: number) => void,
  onLog?: LogEntryFn,
  signal?: AbortSignal,
): Promise<{ analysis: CodebaseAnalysis; clusters: SemanticCluster[] }> {
  const ctx = buildContext(analysis, provider);

  let clusters: SemanticCluster[] | null = null;
  let issues: ValidationIssue[] = [];

  // Round 1
  onProgress?.('Semantic clustering', 1, 3);
  clusters = await runAnalysteAgent(ctx, llmSettings, onLog, signal);

  if (clusters && clusters.length > 0) {
    ctx.semanticClusters = clusters;

    // Évaluateur validation
    onProgress?.('Validating clusters', 2, 3);
    issues = await evaluateClusters(ctx, clusters, llmSettings, onLog);

    // Round 2 if too many errors
    const errorCount = issues.filter(i => i.severity === 'error').length;
    if (errorCount >= 3) {
      onLog?.('ai-cluster', `Analyste round 2 (${errorCount} errors to fix)...`);
      onProgress?.('Re-clustering (round 2)', 3, 3);
      const round2 = await runAnalysteAgent(ctx, llmSettings, onLog, signal, issues);
      if (round2 && round2.length > 0) {
        clusters = round2;
        ctx.semanticClusters = clusters;
      }
    }
  }

  onProgress?.('Building modules', 3, 3);

  if (!clusters || clusters.length === 0) {
    onLog?.('ai-cluster', 'Analyste failed — falling back to heuristic grouping');
    const fallback = groupByFunctionalHeuristics(analysis);
    return { analysis: fallback, clusters: [] };
  }

  // Convert clusters to CodebaseAnalysis modules
  const fileByPath = ctx.fileByPath;
  const modules: CodebaseModule[] = clusters.map(cluster => {
    const files = cluster.files
      .map(fp => fileByPath.get(fp))
      .filter((f): f is AnalyzedFile => f !== undefined);

    return {
      name: cluster.name,
      description: cluster.description,
      path: cluster.name,
      files,
      dependencies: [],
    };
  });

  const enrichedAnalysis: CodebaseAnalysis = {
    ...analysis,
    modules,
  };

  return { analysis: enrichedAnalysis, clusters };
}

/**
 * Phase 2: flow generation.
 * Replaces generateFlows() — returns flows built with actual code knowledge.
 * Runs Synthétiseur (max 2 rounds) with Évaluateur feedback between rounds.
 */
export async function orchestrateFlowGeneration(
  graph: CodeGraph,
  clusters: SemanticCluster[],
  provider: IFileSystemProvider | undefined,
  llmSettings: LLMSettings,
  onProgress?: (step: string, current: number, total: number) => void,
  onLog?: LogEntryFn,
  signal?: AbortSignal,
): Promise<Record<string, GraphFlow>> {
  // Rebuild a lightweight context for the Synthétiseur
  const ctx: GraphBuildContext = {
    analysis: { modules: [], externalDeps: [], entryPoints: [], totalFiles: 0, totalSymbols: 0 },
    astImportPairs: new Set(
      Object.values(graph.relations)
        .filter(r => r.type === 'depends_on')
        .map(r => {
          const src = graph.nodes[r.sourceId]?.sourceRef?.filePath;
          const tgt = graph.nodes[r.targetId]?.sourceRef?.filePath;
          return src && tgt ? `${src}→${tgt}` : null;
        })
        .filter((p): p is string => p !== null)
    ),
    fileByPath: new Map(),
    provider,
    fileCache: new Map(),
    semanticClusters: clusters,
  };

  let flows: Record<string, GraphFlow> | null = null;
  let issues: ValidationIssue[] = [];

  // Round 1
  onProgress?.('Generating flows', 1, 3);
  flows = await runSyntheseurAgent(ctx, graph, llmSettings, onLog, signal);

  if (flows && Object.keys(flows).length > 0) {
    // Évaluateur validation
    onProgress?.('Validating flows', 2, 3);
    issues = await evaluateFlows(ctx, graph, flows, llmSettings, onLog);

    // Round 2 if too many errors
    const errorCount = issues.filter(i => i.severity === 'error').length;
    if (errorCount >= 3) {
      onLog?.('ai-synth', `Synthétiseur round 2 (${errorCount} errors to fix)...`);
      onProgress?.('Re-generating flows (round 2)', 3, 3);
      const round2 = await runSyntheseurAgent(ctx, graph, llmSettings, onLog, signal, issues);
      if (round2 && Object.keys(round2).length > 0) {
        flows = round2;
      }
    }
  }

  if (!flows || Object.keys(flows).length === 0) {
    onLog?.('ai-synth', 'Synthétiseur produced no valid flows');
    return {};
  }

  onLog?.('ai-synth', `Flow generation complete: ${Object.keys(flows).length} flows`);
  return flows;
}
