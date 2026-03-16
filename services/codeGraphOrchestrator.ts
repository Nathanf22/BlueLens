/**
 * Agentic pipeline for CodeGraph generation.
 *
 * Three specialized agents coordinated by a deterministic orchestrator:
 *   - Analyst:      code-aware semantic clustering (replaces Agent 1 + Agent 2)
 *   - Synthesizer:  code-aware flow generation     (replaces codeGraphFlowService one-shot)
 *   - Evaluator:    AST-ground-truth validation    (new — bounded correction rounds)
 *   - Architect:    code-aware architecture diagram generation
 *
 * Communication: blackboard pattern via GraphBuildContext.
 * Organization:  sequential pipeline, max 2 rounds per agent before fallback.
 *
 * Public API:
 *   orchestrateCodebaseAnalysis(analysis, provider, llmSettings, ...) → CodebaseAnalysis
 *   orchestrateFlowGeneration(graph, clusters, provider, llmSettings, ...) → Record<string, GraphFlow>
 *   orchestrateArchitectureGeneration(graph, clusters, provider, llmSettings, ...) → ArchitectureDiagramSet
 */

import {
  CodebaseAnalysis, CodebaseModule, AnalyzedFile,
  LLMSettings, GraphFlow, GraphFlowStep, CodeGraph, AgentToolStep, AgentEventFn, AgentBlackboardFn, AgentId,
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
  onAgentEvent?: AgentEventFn,
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
    const rawAnalysteExecutor = buildAnalysteExecutor(ctx);
    const analysteExecutor = onAgentEvent
      ? async (name: string, args: Record<string, unknown>) => {
          const t0 = Date.now();
          const step = await rawAnalysteExecutor(name, args);
          onAgentEvent({
            agent: 'analyste',
            toolName: name,
            argsSummary: (args.path as string) || (args.query as string) || Object.values(args).join(', ') || '',
            resultSummary: step.result.slice(0, 300),
            durationMs: Date.now() - t0,
          });
          return step;
        }
      : rawAnalysteExecutor;

    const result = await llmService.runAgentLoop(
      [{ role: 'user', content: prompt }],
      ANALYSTE_SYSTEM,
      buildAnalysteTools(),
      analysteExecutor,
      llmSettings,
      { signal, source: 'code-agent-analyste' },
    );

    if (result.interrupted) {
      onLog?.('ai-cluster', `Analyste: agent reached max iterations without producing output — falling back to heuristic`);
      return null;
    }
    onLog?.('ai-cluster', `Analyste: ${result.toolSteps.length} tool calls — parsing clusters`);

    const jsonStr = extractJSON(result.content);
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed.clusters)) {
      onLog?.('ai-cluster', 'Analyste: response missing "clusters" array — falling back to heuristic');
      return null;
    }

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

    // Warn if LLM returned mostly invalid file paths
    const rejectedFileRate = 1 - (assigned.size / Math.max(allFilePaths.size, 1));
    if (rejectedFileRate > 0.5) {
      onLog?.('ai-cluster', `Analyste warning: ${Math.round(rejectedFileRate * 100)}% of files had unresolvable paths — LLM may have hallucinated paths`);
    }

    // Unassigned files go to "Other"
    const unassigned = [...allFilePaths].filter(f => !assigned.has(f));
    if (unassigned.length > 0) {
      onLog?.('ai-cluster', `Analyste: ${unassigned.length} unassigned files → "Other" cluster`);
      clusters.push({ name: 'Other', description: 'Files not assigned to a specific domain', files: unassigned });
    }

    onLog?.('ai-cluster', `Analyste: ${clusters.length} domains identified (${assigned.size}/${allFilePaths.size} files assigned)`);
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
  onAgentEvent?: AgentEventFn,
  onBlackboard?: AgentBlackboardFn,
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
  const evalStartMs = Date.now();
  onAgentEvent?.({
    agent: 'evaluateur',
    toolName: '__eval_start__',
    argsSummary: 'clusters',
    resultSummary: 'Validation en cours...',
    durationMs: 0,
  });

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

    onAgentEvent?.({
      agent: 'evaluateur',
      toolName: '__eval_result__',
      argsSummary: `${errors} errors, ${warnings} warnings`,
      resultSummary: issues.map(i => `[${i.severity}] ${i.message}`).join('\n'),
      durationMs: Date.now() - evalStartMs,
    });

    onBlackboard?.({
      clusterIssues: issues.map(i => ({
        severity: i.severity,
        message: i.message,
        target: i.target,
      })),
    });

    return issues;

  } catch {
    onLog?.('ai-eval', 'Évaluateur cluster validation failed (non-fatal)');
    return [];
  }
}

// ── Synthétiseur Agent ─────────────────────────────────────────────────────────
// Generates runtime flows with actual code awareness via file reads and relation queries.

const SYNTHESEUR_SYSTEM = `You are a senior software architect identifying RUNTIME FLOWS in a codebase.

A flow = a named sequence tracing how a user action or system event propagates at RUNTIME across multiple files.

TOOLS:
- find_entry_points(): all entry point files (no or few incoming imports). Call this first.
- read_file(path): actual source code. Use this to understand what a file DOES at runtime.
- get_node_relations(node_id): static import edges for a file. Use to discover dependencies.
- get_cluster_files(cluster_name): files in a semantic cluster.

APPROACH — reason step by step BEFORE generating flows:
STEP 1 — SURVEY: Call find_entry_points(). Call read_file() on the 2-3 most important entry points (server, app, router).
STEP 2 — ENUMERATE (do this in your reasoning before outputting anything): Mentally list ALL distinct user-facing operations this system handles. Think:
  - What HTTP endpoints exist? (scan server/router/handler files)
  - What UI interactions can a user perform?
  - What background jobs or system events exist?
  Aim for at least 5-10 candidates before selecting.
STEP 3 — SELECT: From your enumeration, pick 3-8 flows that are distinct, important, and span meaningful boundaries (client→server, handler→storage, etc).
STEP 4 — TRACE: For each selected flow, call read_file() on the files it crosses to confirm the runtime chain.
STEP 5 — OUTPUT: Generate the JSON.

The enumeration in STEP 2 is the key to completeness — if you skip it, important flows will be missed.

WHAT MAKES A GOOD FLOW:
- Spans multiple files across meaningful boundaries (client→server, handler→service→database)
- Reflects what actually happens at runtime, not just what's imported
- Has a clear trigger (user action, HTTP request, system event) and outcome
- Steps say WHAT each file does in this specific flow

RULES:
- Use exact nodeIds from the FILE LIST in the user message.
- Sequence diagrams: descriptive participant aliases (not nodeIds), include return arrows.
- For HTTP boundaries: use "->>" with label "HTTP GET /route" or similar.
- scopeNodeId MUST be either "rootNodeId" (for cross-cluster end-to-end flows) or the nodeId of a D1 PACKAGE node. NEVER use a D2 file nodeId as scopeNodeId — file-level flows don't exist at this stage. All flows generated here are either cross-system (rootNodeId) or within one domain cluster (D1 package nodeId).

Output ONLY this JSON (no other text):
{
  "flows": [
    {
      "name": "Human-readable flow name",
      "description": "What happens end-to-end (1-2 sentences)",
      "scopeNodeId": "rootNodeId  ← use this for flows spanning multiple clusters; OR the D1 package nodeId for flows within one cluster",
      "steps": [
        { "nodeId": "exact-nodeId-from-FILE-LIST", "label": "What this file does in this flow", "order": 0 }
      ],
      "sequenceDiagram": "sequenceDiagram\\n  participant A as Name\\n  A->>B: action\\n  B-->>A: response"
    }
  ]
}`;

function buildSyntheseurTools(): AgentToolDefinition[] {
  return [
    {
      name: 'find_entry_points',
      description: 'Returns all codebase entry points: files with no or few incoming dependencies (index, main, App, handlers). Start here to identify where flows begin.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'get_node_relations',
      description: 'Get all outgoing/incoming call/import relations for a graph node. Use to follow where calls go next and trace cross-file chains.',
      parameters: {
        type: 'object',
        properties: { node_id: { type: 'string', description: 'Graph node ID' } },
        required: ['node_id'],
      },
    },
    {
      name: 'get_cluster_files',
      description: 'List all files (with graph nodeIds) in a semantic cluster. Use to explore a specific domain.',
      parameters: {
        type: 'object',
        properties: { cluster_name: { type: 'string', description: 'Cluster/domain name' } },
        required: ['cluster_name'],
      },
    },
    {
      name: 'read_file',
      description: 'Read source code of a file (first 200 lines). Use for orchestrator files to confirm call sequences.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Relative file path from repo root' } },
        required: ['path'],
      },
    },
  ];
}

function buildSyntheseurExecutor(ctx: GraphBuildContext, graph: CodeGraph) {
  // Build filePath → nodeId lookup — D2 (file) nodes only.
  // D3 (symbol) nodes share the same sourceRef.filePath as their D2 parent,
  // so iterating all nodes would overwrite D2 entries with D3 IDs, causing
  // flow step validation to fail (allValidIds only contains D1/D2).
  const filePathToNodeId = new Map<string, string>();
  for (const node of Object.values(graph.nodes)) {
    if (node.sourceRef && node.depth === 2) filePathToNodeId.set(node.sourceRef.filePath, node.id);
  }

  return async (name: string, args: Record<string, unknown>): Promise<AgentToolStep> => {
    switch (name) {
      case 'find_entry_points': {
        // D2 nodes with no incoming depends_on edges, or matching entry-point filename patterns
        const d2Nodes = Object.values(graph.nodes).filter(n => n.depth === 2);
        const incomingCount = new Map<string, number>();
        for (const n of d2Nodes) incomingCount.set(n.id, 0);
        for (const rel of Object.values(graph.relations)) {
          if (rel.type === 'depends_on' && incomingCount.has(rel.targetId)) {
            incomingCount.set(rel.targetId, (incomingCount.get(rel.targetId) || 0) + 1);
          }
        }
        const ENTRY_PATTERN = /^(index|main|app|server|cli|background|content|handler)\./i;
        const entries = d2Nodes
          .filter(n => (incomingCount.get(n.id) || 0) === 0 || ENTRY_PATTERN.test(n.name))
          .map(n => {
            const cluster = ctx.semanticClusters?.find(c => c.files.includes(n.sourceRef?.filePath || ''));
            return {
              nodeId: n.id,
              name: n.name,
              filePath: n.sourceRef?.filePath || null,
              cluster: cluster?.name || null,
              outgoingRelations: Object.values(graph.relations)
                .filter(r => r.sourceId === n.id && r.type !== 'contains').length,
            };
          })
          .sort((a, b) => b.outgoingRelations - a.outgoingRelations)
          .slice(0, 20);
        return {
          toolName: name, args,
          result: JSON.stringify(entries, null, 2),
          label: 'find_entry_points()',
        };
      }

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
  onAgentEvent?: AgentEventFn,
  scopeCluster?: { nodeId: string; name: string; files: string[] },
  frozenFlowNames?: string[],
  missingFlows?: string[],
): Promise<Record<string, GraphFlow> | null> {
  // Build a graph summary: files with cluster labels + all depends_on edges
  const d2Nodes = Object.values(graph.nodes).filter(n => n.depth === 2);
  const d2ById = new Map(d2Nodes.map(n => [n.id, n]));
  const fileToClusterName = new Map<string, string>();
  for (const cluster of (ctx.semanticClusters ?? [])) {
    for (const fp of cluster.files) fileToClusterName.set(fp, cluster.name);
  }

  const fileLines = d2Nodes.map(n => {
    const cluster = n.sourceRef ? (fileToClusterName.get(n.sourceRef.filePath) ?? '?') : '?';
    return `  ${n.id}  ${n.sourceRef?.filePath ?? n.name}  [${cluster}]`;
  }).join('\n');

  const edgeLines = Object.values(graph.relations)
    .filter(r => r.type === 'depends_on')
    .map(r => {
      const src = d2ById.get(r.sourceId);
      const tgt = d2ById.get(r.targetId);
      if (!src || !tgt) return null;
      return `  ${src.sourceRef?.filePath ?? src.id}  →  ${tgt.sourceRef?.filePath ?? tgt.id}`;
    })
    .filter(Boolean)
    .join('\n');

  const clusterSummary = (ctx.semanticClusters ?? []).map(c =>
    `  "${c.name}": ${c.files.join(', ')}`
  ).join('\n');

  let prompt = scopeCluster
    ? `Generate runtime flows FOCUSED ON the "${scopeCluster.name}" domain cluster.\n\n`
    : `Generate runtime flows for this codebase.\n\n`;
  prompt += `FILES (nodeId  path  [cluster]):\n${fileLines || '(none)'}\n\n`;
  prompt += `DEPENDENCY EDGES (A → B means A imports B):\n${edgeLines || '(none)'}\n\n`;
  prompt += `SEMANTIC CLUSTERS:\n${clusterSummary || '(none)'}\n\n`;
  prompt += `rootNodeId="${graph.rootNodeId}"\n\n`;
  if (scopeCluster) {
    prompt += `FOCUS: Generate 2-5 flows specifically about the "${scopeCluster.name}" domain.\n`;
    prompt += `- Flows should involve at least one of these files: ${scopeCluster.files.join(', ')}\n`;
    prompt += `- Flows may cross into other clusters (that's fine — show how this domain interacts with the rest)\n`;
    prompt += `- Set scopeNodeId="${scopeCluster.nodeId}" on ALL generated flows\n\n`;
  }
  prompt += 'Use find_entry_points() to confirm entry points, read_file() to understand orchestration logic, then output the flows JSON.';

  if (previousIssues || frozenFlowNames || missingFlows) {
    // Group flow-specific errors by target flow name
    const flowErrors = new Map<string, string[]>();
    const untargetedErrors: string[] = [];
    for (const issue of (previousIssues ?? []).filter(i => i.severity === 'error')) {
      if (issue.target) {
        if (!flowErrors.has(issue.target)) flowErrors.set(issue.target, []);
        flowErrors.get(issue.target)!.push(issue.message);
      } else {
        untargetedErrors.push(issue.message);
      }
    }

    if (frozenFlowNames && frozenFlowNames.length > 0) {
      prompt += `\n\nFROZEN FLOWS (already verified correct — do NOT regenerate, do not include in output):\n${frozenFlowNames.map(n => `  ✓ "${n}"`).join('\n')}`;
    }

    const toFix = [...flowErrors.keys()];
    const toAdd = missingFlows ?? [];
    const totalExpected = toFix.length + toAdd.length;

    if (toFix.length > 0) {
      prompt += `\n\nFLOWS TO REGENERATE WITH FIXES (include ALL of these in your output):`;
      for (const [name, errs] of flowErrors) {
        prompt += `\n  - "${name}"\n    Fix: ${errs.join('; ')}`;
      }
    }
    if (toAdd.length > 0) {
      prompt += `\n\nNEW FLOWS TO ADD (include ALL of these in your output):\n${toAdd.map(n => `  + "${n}"`).join('\n')}`;
    }
    if (untargetedErrors.length > 0) {
      prompt += `\n\nGENERAL ISSUES TO AVOID:\n${untargetedErrors.map(e => `- ${e}`).join('\n')}`;
    }
    if (totalExpected > 0) {
      prompt += `\n\nOUTPUT REQUIREMENT: your JSON must contain exactly ${totalExpected} flow(s) — one for each item listed above (flows to fix + new flows). Do not add or drop any.`;
    }
  }

  onLog?.('ai-synth', 'Synthétiseur: tracing runtime flows...');

  try {
    const rawSyntheseurExecutor = buildSyntheseurExecutor(ctx, graph);
    const syntheseurExecutor = onAgentEvent
      ? async (name: string, args: Record<string, unknown>) => {
          const t0 = Date.now();
          const step = await rawSyntheseurExecutor(name, args);
          onAgentEvent({
            agent: 'syntheseur',
            toolName: name,
            argsSummary: (args.path as string) || (args.query as string) || Object.values(args).join(', ') || '',
            resultSummary: step.result.slice(0, 300),
            durationMs: Date.now() - t0,
          });
          return step;
        }
      : rawSyntheseurExecutor;

    const result = await llmService.runAgentLoop(
      [{ role: 'user', content: prompt }],
      SYNTHESEUR_SYSTEM,
      buildSyntheseurTools(),
      syntheseurExecutor,
      llmSettings,
      { signal, source: 'code-agent-syntheseur' },
    );

    if (result.interrupted) {
      onLog?.('ai-synth', 'Synthétiseur: agent reached max iterations without producing output — no flows generated');
      return null;
    }
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

    // Resolve scope — only root (D0) or package (D1) are valid scopes for agent-generated flows.
    // D2/D3 file-level scopes are rejected and fall back to root (end-to-end).
    let resolvedScope = typeof scopeNodeId === 'string' ? resolveId(scopeNodeId) : null;
    if (resolvedScope) {
      const scopeNode = graph.nodes[resolvedScope];
      if (scopeNode && scopeNode.depth > 1) resolvedScope = null; // reject D2+
    }
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

const EVALUATEUR_FLOW_SYSTEM = `You are an adversarial code reviewer verifying that runtime flows accurately represent the source code.

You have one tool: read_file(path) — read source code to verify claims.

PROCESS:
1. Read the entry point file (step 0) of each flow.
2. Verify: does the code actually connect to the next step at runtime?
   - Static import → look for require() / import statements
   - HTTP call → look for fetch(), axios, XMLHttpRequest, http.request()
   - Event → look for emit(), addEventListener(), on()
3. Read subsequent files as needed to verify the chain.
4. Be STRICT — if a connection is not verifiable in the code, flag it as an error.
5. Be ACCURATE — if you read the code and the connection IS there, do NOT flag it.
6. IMPORTANT: read_file only returns the first 200 lines. If a step is NOT visible in the snippet but the entry point file is large and the function could plausibly exist further down, do NOT reject it — instead, mark it as a warning (cannot verify) rather than an error.

Flag as ERROR:
- A claimed connection (import, HTTP call, event) that does not exist in the source
- A step whose label is completely wrong about what the file does
- A file included in a flow that plays no role whatsoever

Flag as WARNING:
- A step label that is vague or partially inaccurate
- A flow that skips important intermediate files

Do NOT flag:
- HTTP calls between client and server (verify with read_file that fetch/axios/routes exist)
- Fan-out from a common parent (A imports B, A imports C, A imports D — all valid)
- Transitive import chains (A imports B imports C)

COMPLETENESS CHECK:
After verifying existing flows, ask yourself: based on the source files you read, are there important user journeys or system events that are clearly NOT represented? Be conservative — only flag things that are obviously important AND obviously absent (not minor variations, not error edge cases).

Output ONLY this JSON after your investigation:
{
  "issues": [
    {
      "type": "invalid_flow_step" | "trivial_flow" | "hallucinated_relation",
      "severity": "warning" | "error",
      "message": "specific description referencing what you found in the code",
      "target": "flow name"
    }
  ],
  "missing": ["Suggested missing flow name 1", "Suggested missing flow name 2"]
}
(If nothing important is missing, output "missing": [])`;

const ALREADY_READ = '(already provided above)';

function buildEvaluateurFlowExecutor(ctx: GraphBuildContext) {
  const readOnce = new Set<string>();
  return async (name: string, args: Record<string, unknown>): Promise<AgentToolStep> => {
    if (name === 'read_file') {
      const filePath = String(args.path ?? '');
      if (readOnce.has(filePath)) {
        return { toolName: name, args, result: ALREADY_READ, label: `read_file(${filePath}) [dup]` };
      }
      const content = await readFileCached(ctx, filePath, 200);
      readOnce.add(filePath);
      return { toolName: name, args, result: content, label: `read_file(${filePath})` };
    }
    return { toolName: name, args, result: '(unknown tool)', label: name };
  };
}

async function evaluateFlows(
  ctx: GraphBuildContext,
  graph: CodeGraph,
  flows: Record<string, GraphFlow>,
  llmSettings: LLMSettings,
  onLog?: LogEntryFn,
  onAgentEvent?: AgentEventFn,
  onBlackboard?: AgentBlackboardFn,
): Promise<{ issues: ValidationIssue[]; missing: string[] }> {
  const flowSummary = Object.values(flows).map(f => ({
    name: f.name,
    description: f.description,
    steps: f.steps.map(s => ({
      file: graph.nodes[s.nodeId]?.sourceRef?.filePath ?? s.nodeId,
      label: s.label,
    })),
  }));

  const prompt = `Verify these runtime flows against the actual source code. Use read_file() to check each connection before judging.

FLOWS TO VERIFY:
${JSON.stringify(flowSummary, null, 2)}

For each flow, read the source files of the steps and verify the claimed connections exist in the code.`;

  onLog?.('ai-eval', 'Évaluateur: validating flows against source code...');
  const evalFlowStartMs = Date.now();

  const rawExecutor = buildEvaluateurFlowExecutor(ctx);
  const executor = onAgentEvent
    ? async (name: string, args: Record<string, unknown>) => {
        const t0 = Date.now();
        const step = await rawExecutor(name, args);
        if (step.result !== ALREADY_READ) {
          onAgentEvent({
            agent: 'evaluateur',
            toolName: name,
            argsSummary: String(args.path ?? args.file ?? ''),
            resultSummary: step.result.slice(0, 300),
            durationMs: Date.now() - t0,
          });
        }
        return step;
      }
    : rawExecutor;

  const evalTools: AgentToolDefinition[] = [{
    name: 'read_file',
    description: 'Read source code of a file to verify a flow step connection',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'File path relative to project root' } },
      required: ['path'],
    },
  }];

  try {
    const result = await llmService.runAgentLoop(
      [{ role: 'user', content: prompt }],
      EVALUATEUR_FLOW_SYSTEM,
      evalTools,
      executor,
      llmSettings,
      { source: 'code-agent-evaluateur' },
    );

    const parsed = JSON.parse(extractJSON(result.content));
    if (!Array.isArray(parsed.issues)) return { issues: [], missing: [] };

    const issues: ValidationIssue[] = (parsed.issues as unknown[])
      .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
      .map(i => ({
        type: (i.type as ValidationIssue['type']) || 'invalid_flow_step',
        severity: (i.severity as ValidationIssue['severity']) || 'warning',
        message: String(i.message || ''),
        target: i.target ? String(i.target) : undefined,
      }));

    const missing: string[] = Array.isArray(parsed.missing)
      ? (parsed.missing as unknown[]).filter((s): s is string => typeof s === 'string')
      : [];

    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    onLog?.('ai-eval', `Évaluateur flows: ${errors} errors, ${warnings} warnings, ${missing.length} missing (${result.toolSteps.length} files read)`);

    onAgentEvent?.({
      agent: 'evaluateur',
      toolName: '__eval_result__',
      argsSummary: `${errors} errors, ${warnings} warnings`,
      resultSummary: issues.length === 0 && missing.length === 0
        ? '✓ All flows verified'
        : [
            ...issues.map(i => `[${i.severity}] ${i.message}`),
            ...missing.map(m => `[missing] ${m}`),
          ].join('\n'),
      durationMs: Date.now() - evalFlowStartMs,
    });

    onBlackboard?.({
      flowIssues: issues.map(i => ({
        severity: i.severity,
        message: i.message,
        target: i.target,
      })),
    });

    return { issues, missing };

  } catch {
    onLog?.('ai-eval', 'Évaluateur flow validation failed (non-fatal)');
    return { issues: [], missing: [] };
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
  onAgentEvent?: AgentEventFn,
  onBlackboard?: AgentBlackboardFn,
): Promise<{ analysis: CodebaseAnalysis; clusters: SemanticCluster[] }> {
  const ctx = buildContext(analysis, provider);

  let clusters: SemanticCluster[] | null = null;
  let issues: ValidationIssue[] = [];

  // Round 1
  onProgress?.('Semantic clustering', 1, 3);
  clusters = await runAnalysteAgent(ctx, llmSettings, onLog, signal, undefined, onAgentEvent);

  if (clusters && clusters.length > 0) {
    ctx.semanticClusters = clusters;
    onBlackboard?.({ clusters: clusters.map(c => ({ name: c.name, fileCount: c.files.length, files: c.files })) });

    // Évaluateur validation
    onProgress?.('Validating clusters', 2, 3);
    issues = await evaluateClusters(ctx, clusters, llmSettings, onLog, onAgentEvent, onBlackboard);

    // Round 2 if too many errors
    const errorCount = issues.filter(i => i.severity === 'error').length;
    if (errorCount >= 3) {
      onLog?.('ai-cluster', `Analyste round 2 (${errorCount} errors to fix)...`);
      onProgress?.('Re-clustering (round 2)', 3, 3);
      const round2 = await runAnalysteAgent(ctx, llmSettings, onLog, signal, issues, onAgentEvent);
      if (round2 && round2.length > 0) {
        clusters = round2;
        ctx.semanticClusters = clusters;
        onBlackboard?.({ clusters: clusters.map(c => ({ name: c.name, fileCount: c.files.length, files: c.files })) });
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

  // Build file→cluster map for cross-cluster dependency resolution
  const fileToCluster = new Map<string, string>();
  for (const cluster of clusters) {
    for (const fp of cluster.files) fileToCluster.set(fp, cluster.name);
  }
  const allFilePaths = Array.from(fileByPath.keys());

  /** Resolve a relative/alias import source to a known file path. */
  function resolveImport(source: string, fromFile: string): string | null {
    if (!source.startsWith('.') && !source.startsWith('@/')) return null;
    let base: string;
    if (source.startsWith('@/')) {
      base = source.slice(2);
    } else {
      const dir = fromFile.substring(0, fromFile.lastIndexOf('/'));
      const parts = source.split('/');
      let cur = dir;
      for (const p of parts) {
        if (p === '.') continue;
        else if (p === '..') { const i = cur.lastIndexOf('/'); cur = i >= 0 ? cur.substring(0, i) : ''; }
        else { cur = cur ? `${cur}/${p}` : p; }
      }
      base = cur;
    }
    const exts = ['.ts', '.tsx', '.js', '.jsx', '.py', ''];
    const idxs = ['/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
    for (const ext of exts) {
      const candidate = base + ext;
      if (allFilePaths.includes(candidate)) return candidate;
    }
    for (const idx of idxs) {
      const candidate = base + idx;
      if (allFilePaths.includes(candidate)) return candidate;
    }
    return null;
  }

  const modules: CodebaseModule[] = clusters.map(cluster => {
    const files = cluster.files
      .map(fp => fileByPath.get(fp))
      .filter((f): f is AnalyzedFile => f !== undefined);

    // Compute inter-cluster dependencies from file imports
    const depSet = new Set<string>();
    for (const file of files) {
      for (const imp of file.imports) {
        if (imp.isExternal) continue;
        const resolved = resolveImport(imp.source, file.filePath);
        if (resolved) {
          const targetCluster = fileToCluster.get(resolved);
          if (targetCluster && targetCluster !== cluster.name) depSet.add(targetCluster);
        }
      }
    }

    return {
      name: cluster.name,
      description: cluster.description,
      path: cluster.name,
      files,
      dependencies: Array.from(depSet),
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
  onAgentEvent?: AgentEventFn,
  onBlackboard?: AgentBlackboardFn,
  scopeCluster?: { nodeId: string; name: string; files: string[] },
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
  flows = await runSyntheseurAgent(ctx, graph, llmSettings, onLog, signal, undefined, onAgentEvent, scopeCluster);

  if (flows && Object.keys(flows).length > 0) {
    onBlackboard?.({ flows: Object.values(flows).map(f => ({ name: f.name, stepCount: f.steps.length })) });

    // Évaluateur validation
    onProgress?.('Validating flows', 2, 3);
    const { issues: evalIssues, missing } = await evaluateFlows(ctx, graph, flows, llmSettings, onLog, onAgentEvent, onBlackboard);
    issues = evalIssues;

    // Round 2: surgical — only fix broken flows + add missing
    const errorCount = issues.filter(i => i.severity === 'error').length;
    if (errorCount >= 1 || missing.length > 0) {
      onLog?.('ai-synth', `Synthétiseur round 2 (${errorCount} errors to fix, ${missing.length} to add)...`);
      onProgress?.('Re-generating flows (round 2)', 3, 3);

      // Identify which flows have errors (by target name)
      const errorTargets = new Set(
        issues.filter(i => i.severity === 'error' && i.target).map(i => i.target as string)
      );
      // Flows with no target error are considered verified; if there are untargeted errors fall back to full regen
      const hasUntargetedErrors = issues.some(i => i.severity === 'error' && !i.target);
      const frozenFlowNames = hasUntargetedErrors
        ? []
        : Object.values(flows).filter(f => !errorTargets.has(f.name)).map(f => f.name);

      const round2 = await runSyntheseurAgent(
        ctx, graph, llmSettings, onLog, signal, issues, onAgentEvent, scopeCluster,
        frozenFlowNames.length > 0 ? frozenFlowNames : undefined,
        missing.length > 0 ? missing : undefined,
      );
      if (round2 && Object.keys(round2).length > 0) {
        if (frozenFlowNames.length > 0) {
          // Surgical merge: keep verified flows, replace/add from round2
          const frozenMap: Record<string, GraphFlow> = {};
          for (const f of Object.values(flows)) {
            if (frozenFlowNames.includes(f.name)) frozenMap[f.id] = f;
          }
          flows = { ...frozenMap, ...round2 };
        } else {
          flows = round2;
        }
        onBlackboard?.({ flows: Object.values(flows).map(f => ({ name: f.name, stepCount: f.steps.length })) });
      }
    }
  }

  // If a D1 scope was requested, force all flows to that scopeNodeId so they appear at the right level
  if (scopeCluster && flows) {
    const rescoped: Record<string, GraphFlow> = {};
    for (const [id, flow] of Object.entries(flows)) {
      rescoped[id] = { ...flow, scopeNodeId: scopeCluster.nodeId };
    }
    flows = rescoped;
  }

  if (!flows || Object.keys(flows).length === 0) {
    onLog?.('ai-synth', 'Synthétiseur produced no valid flows');
    return {};
  }

  onLog?.('ai-synth', `Flow generation complete: ${Object.keys(flows).length} flows`);
  return flows;
}

// ── Architect Agent ──────────────────────────────────────────────────────────
// Generates architecture diagrams with actual code awareness.
// Reuses the same tools as the Synthesizer (file reads, relations, clusters).

export interface ArchitectureDiagramSet {
  overview: { name: string; code: string };
  services: { name: string; nodeId: string; code: string }[];
}

const ARCHITECT_SYSTEM = `You are a senior software architect generating Mermaid architecture diagrams from actual source code.

TOOLS available (same as flow analysis):
- find_entry_points(): entry-point files — use to identify top-level modules
- get_cluster_files(cluster_name): all files in a semantic domain cluster
- get_node_relations(node_id): import/dependency edges for a file
- read_file(path): actual source code (first 200 lines) — READ KEY FILES to understand real responsibilities

APPROACH:
1. Call get_cluster_files() for each cluster to understand what's in each domain
2. Call read_file() on the key file(s) of each cluster (the one that exports the main logic)
3. Use what you read to write meaningful node descriptions and edge labels
4. Descriptions must reflect what the code ACTUALLY does, not just the filename

OUTPUT — return ONLY this JSON (no markdown, no explanation):
{
  "overview": {
    "name": "<ProjectName> — Overview",
    "code": "graph LR\\n  classDef mod fill:#1e3a5f,stroke:#3b82f6,color:#e2e8f0\\n  ClusterA[\\"ClusterA\\\\nBrief role\\"]:::mod\\n  ClusterA -->|\\"what it uses\\"| ClusterB"
  },
  "services": [
    {
      "name": "ClusterName",
      "nodeId": "exact-D1-nodeId-from-the-node-list",
      "code": "graph TD\\n  classDef entry fill:#1a3a2a,stroke:#22c55e,color:#e2e8f0\\n  classDef dep fill:#1a2744,stroke:#6366f1,color:#e2e8f0\\n  fileA[\\"fileName\\\\nWhat it does\\"]:::entry\\n  fileA -->|\\"provides X\\"| fileB"
    }
  ]
}

MERMAID RULES:
- Use \\\\n (escaped newline) inside node labels for line breaks
- Escape all double quotes inside labels with \\'
- overview: graph LR, one node per D1 cluster, edges labeled with what is used/provided
- services: graph TD, one node per D2 file, entry points (:::entry) vs dependencies (:::dep)
- Edge labels: short verb phrases ("handles auth", "stores messages", "sends notifications")
- Node descriptions: 1 short sentence reflecting actual code behavior`;

async function runArchitectAgent(
  ctx: GraphBuildContext,
  graph: CodeGraph,
  clusters: SemanticCluster[],
  llmSettings: LLMSettings,
  onLog?: LogEntryFn,
  signal?: AbortSignal,
  onAgentEvent?: AgentEventFn,
): Promise<ArchitectureDiagramSet | null> {
  // Build context: D1 nodes with their D2 children
  const d1Nodes = Object.values(graph.nodes).filter(n => n.depth === 1).sort((a, b) => a.name.localeCompare(b.name));

  const d1Summary = d1Nodes.map(d1 => {
    const files = d1.children
      .map(id => graph.nodes[id])
      .filter(n => n?.depth === 2)
      .map(n => `    ${n.id}  ${n.sourceRef?.filePath ?? n.name}`)
      .join('\n');
    return `D1 node: ${d1.name}  (nodeId: ${d1.id})\nFiles:\n${files}`;
  }).join('\n\n');

  const clusterSummary = clusters.map(c =>
    `  "${c.name}": ${c.files.join(', ')}`
  ).join('\n');

  const prompt = `Generate architecture diagrams for: ${graph.name}

D1 MODULES (use these nodeIds in services[].nodeId):
${d1Summary || '(none)'}

SEMANTIC CLUSTERS:
${clusterSummary || '(none)'}

rootNodeId="${graph.rootNodeId}"

Steps:
1. Call get_cluster_files() for each cluster to see what's inside
2. Call read_file() on the main file of each cluster to understand real behavior
3. Output the JSON with overview + one service diagram per D1 module`;

  onLog?.('ai-architect', 'Architect: reading codebase to build architecture diagrams...');

  try {
    const rawExecutor = buildSyntheseurExecutor(ctx, graph);
    const executor = onAgentEvent
      ? async (name: string, args: Record<string, unknown>) => {
          const t0 = Date.now();
          const step = await rawExecutor(name, args);
          onAgentEvent({
            agent: 'architecte' as AgentId,
            toolName: name,
            argsSummary: (args.path as string) || (args.cluster_name as string) || Object.values(args).join(', ') || '',
            resultSummary: step.result.slice(0, 300),
            durationMs: Date.now() - t0,
          });
          return step;
        }
      : rawExecutor;

    const result = await llmService.runAgentLoop(
      [{ role: 'user', content: prompt }],
      ARCHITECT_SYSTEM,
      buildSyntheseurTools(),
      executor,
      llmSettings,
      { signal, source: 'code-agent-architecte' },
    );

    if (result.interrupted) {
      onLog?.('ai-architect', 'Architect: reached max iterations without producing output');
      return null;
    }

    onLog?.('ai-architect', `Architect: ${result.toolSteps.length} tool calls — parsing diagrams`);

    let parsed: ArchitectureDiagramSet;
    try {
      const jsonStr = extractJSON(result.content);
      parsed = JSON.parse(jsonStr);
    } catch {
      onLog?.('ai-architect', 'Architect: failed to parse JSON output');
      return null;
    }

    if (!parsed.overview?.code || !Array.isArray(parsed.services)) {
      onLog?.('ai-architect', 'Architect: output missing overview or services');
      return null;
    }

    onLog?.('ai-architect', `Architect: overview + ${parsed.services.length} service diagrams generated`);
    return parsed;
  } catch (err) {
    if (err instanceof LLMRateLimitError || err instanceof LLMConfigError) throw err;
    onLog?.('ai-architect', `Architect failed: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

// ── Évaluateur — Phase 3: architecture validation ────────────────────────────

const EVALUATEUR_ARCH_SYSTEM = `You are an adversarial architecture reviewer verifying that generated Mermaid diagrams accurately represent the source code.

You have one tool: read_file(path) — read source code to verify claims.

PROCESS:
1. For the overview diagram, read the main file of each cluster to verify its described role and dependencies.
2. Check that edges between clusters (dependencies) are grounded in actual imports, HTTP calls, or event listeners.
3. For service diagrams, verify that listed files exist and play the stated roles.

Flag as ERROR:
- A cluster or file described as doing something it clearly does not (read the file to confirm)
- An edge (dependency) between two clusters that does not exist in the code
- A file placed in the wrong service diagram

Flag as WARNING:
- A node description that is vague or partially inaccurate
- A missing important dependency between clusters

Do NOT flag:
- Minor label wording differences as long as the meaning is correct
- Transitive dependencies not shown (overview cannot show every edge)

Output ONLY this JSON after your investigation:
{
  "issues": [
    { "severity": "error" | "warning", "message": "...", "target": "cluster or file name" }
  ]
}`;

async function evaluateArchitecture(
  ctx: GraphBuildContext,
  diagrams: ArchitectureDiagramSet,
  clusters: SemanticCluster[],
  llmSettings: LLMSettings,
  onLog?: LogEntryFn,
  onAgentEvent?: AgentEventFn,
  onBlackboard?: AgentBlackboardFn,
): Promise<void> {
  const clusterSummary = clusters.map(c => ({
    name: c.name,
    files: c.files,
  }));

  const diagramSummary = {
    overview: diagrams.overview.name,
    services: diagrams.services.map(s => s.name),
  };

  const prompt = `Verify these architecture diagrams against the actual source code.

DIAGRAMS GENERATED:
${JSON.stringify(diagramSummary, null, 2)}

CLUSTER → FILE MAPPING:
${JSON.stringify(clusterSummary, null, 2)}

Steps:
1. For each cluster, read its main file (first in the files list) to verify its described role.
2. Check if cross-cluster dependencies in the overview diagram are grounded in imports or HTTP calls.
3. Report issues.`;

  onLog?.('ai-eval', 'Évaluateur: validating architecture diagrams...');
  const evalStartMs = Date.now();

  const rawExecutor = buildEvaluateurFlowExecutor(ctx);
  const executor = onAgentEvent
    ? async (name: string, args: Record<string, unknown>) => {
        const t0 = Date.now();
        const step = await rawExecutor(name, args);
        if (step.result !== ALREADY_READ) {
          onAgentEvent({
            agent: 'evaluateur',
            toolName: name,
            argsSummary: String(args.path ?? ''),
            resultSummary: step.result.slice(0, 300),
            durationMs: Date.now() - t0,
          });
        }
        return step;
      }
    : rawExecutor;

  const evalTools: AgentToolDefinition[] = [{
    name: 'read_file',
    description: 'Read source code of a file to verify an architecture claim',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string', description: 'File path relative to project root' } },
      required: ['path'],
    },
  }];

  try {
    const result = await llmService.runAgentLoop(
      [{ role: 'user', content: prompt }],
      EVALUATEUR_ARCH_SYSTEM,
      evalTools,
      executor,
      llmSettings,
      { source: 'code-agent-evaluateur' },
    );

    const parsed = JSON.parse(extractJSON(result.content));
    if (!Array.isArray(parsed.issues)) return;

    const issues: ValidationIssue[] = (parsed.issues as unknown[])
      .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
      .map(i => ({
        type: 'invalid_flow_step' as ValidationIssue['type'],
        severity: (i.severity as ValidationIssue['severity']) || 'warning',
        message: String(i.message || ''),
        target: i.target ? String(i.target) : undefined,
      }));

    const errors = issues.filter(i => i.severity === 'error').length;
    const warnings = issues.filter(i => i.severity === 'warning').length;
    onLog?.('ai-eval', `Évaluateur arch: ${errors} errors, ${warnings} warnings (${result.toolSteps.length} files read)`);

    onAgentEvent?.({
      agent: 'evaluateur',
      toolName: '__eval_result__',
      argsSummary: `${errors} errors, ${warnings} warnings`,
      resultSummary: issues.length === 0 ? '✓ Architecture verified' : issues.map(i => `[${i.severity}] ${i.message}`).join('\n'),
      durationMs: Date.now() - evalStartMs,
    });

    onBlackboard?.({
      archIssues: issues.map(i => ({
        severity: i.severity,
        message: i.message,
        target: i.target,
      })),
    });
  } catch {
    onLog?.('ai-eval', 'Évaluateur arch validation failed (non-fatal)');
  }
}

/**
 * Phase 3: architecture diagram generation.
 * Runs the Architect agent with file-reading tools and semantic cluster context.
 */
export async function orchestrateArchitectureGeneration(
  graph: CodeGraph,
  clusters: SemanticCluster[],
  provider: IFileSystemProvider | undefined,
  llmSettings: LLMSettings,
  onLog?: LogEntryFn,
  signal?: AbortSignal,
  onAgentEvent?: AgentEventFn,
  onBlackboard?: AgentBlackboardFn,
): Promise<ArchitectureDiagramSet> {
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

  const result = await runArchitectAgent(ctx, graph, clusters, llmSettings, onLog, signal, onAgentEvent);
  if (!result) {
    return { overview: { name: `${graph.name} — Overview`, code: '' }, services: [] };
  }

  await evaluateArchitecture(ctx, result, clusters, llmSettings, onLog, onAgentEvent, onBlackboard);

  return result;
}
