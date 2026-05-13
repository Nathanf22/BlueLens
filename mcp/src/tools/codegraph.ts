import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CodeGraph, LLMProvider, LLMSettings } from '../../../types.js';
import { z } from 'zod';
import { existsSync } from 'node:fs';
import { storage } from '../storage.js';
import { NodeFileSystemProvider } from '../services/nodeFs.js';
import { codebaseAnalyzerService } from '../../../services/codebaseAnalyzerService.js';
import { codeGraphModelService } from '../../../services/codeGraphModelService.js';
import { parseCodebaseToGraph } from '../services/codeToGraph.js';
import { orchestrateCodebaseAnalysis, orchestrateFlowGeneration } from '../../../services/codeGraphOrchestrator.js';

function graphSummary(graph: CodeGraph) {
  const nodes = Object.values(graph.nodes);
  const relations = Object.values(graph.relations);
  const nodesByKind: Record<string, number> = {};
  for (const n of nodes) nodesByKind[n.kind] = (nodesByKind[n.kind] ?? 0) + 1;
  const relationsByType: Record<string, number> = {};
  for (const r of relations) relationsByType[r.type] = (relationsByType[r.type] ?? 0) + 1;
  return {
    id: graph.id, name: graph.name, repoId: graph.repoId, workspaceId: graph.workspaceId,
    nodeCount: nodes.length, relationCount: relations.length,
    nodesByKind, relationsByType,
    packages: nodes.filter(n => n.depth === 1).map(n => ({ id: n.id, name: n.name, childCount: n.children.length })),
    createdAt: graph.createdAt, updatedAt: graph.updatedAt,
  };
}

function buildLLMSettings(provider: LLMProvider, apiKey: string, model?: string): LLMSettings {
  return {
    activeProvider: provider,
    providers: {
      gemini: provider === 'gemini' ? { provider: 'gemini', apiKey, model: model ?? 'gemini-2.0-flash' } : null,
      openai: provider === 'openai' ? { provider: 'openai', apiKey, model: model ?? 'gpt-4o-mini' } : null,
      anthropic: provider === 'anthropic' ? { provider: 'anthropic', apiKey, model: model ?? 'claude-sonnet-4-6' } : null,
    },
  };
}

export function registerCodeGraphTools(server: McpServer): void {
  server.tool(
    'scan_codebase',
    'Scan a local directory, build a CodeGraph with LLM semantic clustering and flow generation. API keys are read from environment variables only (GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY) — never pass keys as parameters.',
    {
      directory: z.string().describe('Absolute path to the directory to scan'),
      workspace_id: z.string().describe('Workspace ID to store the CodeGraph in'),
      repo_name: z.string().optional().describe('Display name for this repo (defaults to directory basename)'),
      llm_provider: z.enum(['gemini', 'openai', 'anthropic']).optional().describe('LLM provider — auto-detected from env vars if omitted'),
      llm_model: z.string().optional().describe('Model override (e.g. gemini-2.5-flash, gpt-4o, claude-sonnet-4-6)'),
    },
    async ({ directory, workspace_id, repo_name, llm_provider: rawProvider, llm_model }) => {
      // Resolve provider + key from env vars only
      const llm_provider: LLMProvider | undefined = rawProvider
        ?? (process.env.GEMINI_API_KEY || process.env.API_KEY ? 'gemini'
          : process.env.OPENAI_API_KEY ? 'openai'
          : process.env.ANTHROPIC_API_KEY ? 'anthropic'
          : undefined);
      const llm_api_key: string | undefined =
        llm_provider === 'gemini' ? (process.env.GEMINI_API_KEY ?? process.env.API_KEY)
          : llm_provider === 'openai' ? process.env.OPENAI_API_KEY
          : llm_provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY
          : undefined;
      if (!existsSync(directory)) {
        return { content: [{ type: 'text', text: `Directory not found: ${directory}` }], isError: true };
      }

      const workspaces = await storage.listWorkspaces();
      if (!workspaces.find(w => w.id === workspace_id)) {
        return { content: [{ type: 'text', text: `Workspace "${workspace_id}" not found` }], isError: true };
      }

      const name = repo_name ?? directory.split('/').pop() ?? directory;
      const repoId = `repo-${Date.now()}`;
      const provider = new NodeFileSystemProvider(directory);

      let analysisResult = await codebaseAnalyzerService.analyzeCodebase(provider);
      const logs: string[] = [];
      const onLog = (_type: string, msg: string) => { logs.push(msg); };

      let clusters: Awaited<ReturnType<typeof orchestrateCodebaseAnalysis>>['clusters'] = [];
      const usedLLM = !!(llm_provider && llm_api_key);

      if (usedLLM) {
        const llmSettings = buildLLMSettings(llm_provider!, llm_api_key!, llm_model);
        try {
          const orchestrated = await orchestrateCodebaseAnalysis(
            analysisResult, provider, llmSettings,
            undefined, onLog,
          );
          analysisResult = orchestrated.analysis;
          clusters = orchestrated.clusters;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return { content: [{ type: 'text', text: `LLM clustering failed: ${msg}` }], isError: true };
        }
      }

      let graph = await parseCodebaseToGraph(analysisResult, repoId, name, workspace_id, provider);

      if (usedLLM && clusters.length > 0) {
        const llmSettings = buildLLMSettings(llm_provider!, llm_api_key!, llm_model);
        try {
          const flows = await orchestrateFlowGeneration(
            graph, clusters, provider, llmSettings,
            undefined, onLog,
          );
          if (Object.keys(flows).length > 0) {
            graph = { ...graph, flows, updatedAt: Date.now() };
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          logs.push(`Flow generation failed (${msg})`);
        }
      }

      await storage.saveCodeGraph(graph);

      const anomalies = codeGraphModelService.validateGraph(graph);
      const summary = graphSummary(graph);
      const flowCount = Object.keys(graph.flows ?? {}).length;

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: `CodeGraph "${name}" created successfully`,
            graphId: graph.id,
            pipeline: usedLLM ? 'agentic (LLM semantic clustering + flow generation)' : 'static analysis only',
            filesScanned: analysisResult.totalFiles,
            totalSymbols: analysisResult.totalSymbols,
            modules: analysisResult.modules.length,
            semanticClusters: clusters.length,
            flows: flowCount,
            externalDeps: analysisResult.externalDeps.length,
            entryPoints: analysisResult.entryPoints,
            summary,
            anomalies: anomalies.slice(0, 10),
            logs: logs.slice(-20),
          }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'list_codegraphs',
    'List all stored CodeGraphs, optionally filtered by workspace',
    { workspace_id: z.string().optional().describe('Filter by workspace ID') },
    async ({ workspace_id }) => {
      const graphs = await storage.listCodeGraphs(workspace_id);
      if (graphs.length === 0) {
        return { content: [{ type: 'text', text: 'No CodeGraphs found. Use scan_codebase to create one.' }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(graphs, null, 2) }] };
    },
  );

  server.tool(
    'get_codegraph_summary',
    'Get a high-level summary of a CodeGraph (modules, node counts, dependency stats)',
    { graph_id: z.string().describe('CodeGraph ID') },
    async ({ graph_id }) => {
      const graph = await storage.getCodeGraph(graph_id);
      if (!graph) {
        return { content: [{ type: 'text', text: `CodeGraph "${graph_id}" not found` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(graphSummary(graph), null, 2) }] };
    },
  );

  server.tool(
    'get_codegraph_nodes',
    'Get nodes from a CodeGraph, optionally filtered by depth or kind',
    {
      graph_id: z.string().describe('CodeGraph ID'),
      depth: z.number().int().min(0).max(4).optional().describe('Filter by depth: 0=system, 1=package, 2=module, 3=class/function, 4=method/field'),
      kind: z.enum(['system', 'package', 'module', 'class', 'function', 'interface', 'variable', 'method', 'field']).optional().describe('Filter by node kind'),
      parent_id: z.string().optional().describe('Filter by parent node ID (list direct children)'),
    },
    async ({ graph_id, depth, kind, parent_id }) => {
      const graph = await storage.getCodeGraph(graph_id);
      if (!graph) {
        return { content: [{ type: 'text', text: `CodeGraph "${graph_id}" not found` }], isError: true };
      }

      let nodes = Object.values(graph.nodes);
      if (depth !== undefined) nodes = nodes.filter(n => n.depth === depth);
      if (kind !== undefined) nodes = nodes.filter(n => n.kind === kind);
      if (parent_id !== undefined) nodes = nodes.filter(n => n.parentId === parent_id);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(nodes.map(n => ({
            id: n.id, name: n.name, kind: n.kind, depth: n.depth,
            parentId: n.parentId, childCount: n.children.length,
            sourceRef: n.sourceRef ? { filePath: n.sourceRef.filePath, lines: `${n.sourceRef.lineStart}-${n.sourceRef.lineEnd}` } : null,
            tags: n.tags,
          })), null, 2),
        }],
      };
    },
  );

  server.tool(
    'detect_codegraph_anomalies',
    'Detect anomalies in a CodeGraph: circular deps, god nodes (high fan-in), high coupling (high fan-out), orphan nodes, broken references',
    { graph_id: z.string().describe('CodeGraph ID') },
    async ({ graph_id }) => {
      const graph = await storage.getCodeGraph(graph_id);
      if (!graph) {
        return { content: [{ type: 'text', text: `CodeGraph "${graph_id}" not found` }], isError: true };
      }

      const anomalies = codeGraphModelService.validateGraph(graph);
      if (anomalies.length === 0) {
        return { content: [{ type: 'text', text: 'No anomalies detected.' }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(anomalies, null, 2) }] };
    },
  );

  server.tool(
    'generate_domain_diagrams',
    'Drill into a specific package/domain node and generate scoped sequence diagrams for it. Call recursively on child nodes to build a multi-level diagram map. API keys are read from environment variables only.',
    {
      graph_id: z.string().describe('CodeGraph ID'),
      node_id: z.string().describe('Package or module node ID to scope the generation to'),
      workspace_id: z.string().describe('Workspace ID where diagrams will be saved'),
      folder_id: z.string().optional().describe('Folder ID to save diagrams into'),
      llm_provider: z.enum(['gemini', 'openai', 'anthropic']).optional().describe('LLM provider — auto-detected from env vars if omitted'),
      llm_model: z.string().optional().describe('Model override'),
    },
    async ({ graph_id, node_id, workspace_id, folder_id, llm_provider: rawProvider, llm_model }) => {
      const graph = await storage.getCodeGraph(graph_id);
      if (!graph) {
        return { content: [{ type: 'text', text: `CodeGraph "${graph_id}" not found` }], isError: true };
      }

      const scopeNode = graph.nodes[node_id];
      if (!scopeNode) {
        return { content: [{ type: 'text', text: `Node "${node_id}" not found in graph` }], isError: true };
      }

      const llm_provider: LLMProvider | undefined = rawProvider
        ?? (process.env.GEMINI_API_KEY || process.env.API_KEY ? 'gemini'
          : process.env.OPENAI_API_KEY ? 'openai'
          : process.env.ANTHROPIC_API_KEY ? 'anthropic'
          : undefined);
      const llm_api_key =
        llm_provider === 'gemini' ? (process.env.GEMINI_API_KEY ?? process.env.API_KEY)
          : llm_provider === 'openai' ? process.env.OPENAI_API_KEY
          : llm_provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY
          : undefined;

      if (!llm_provider || !llm_api_key) {
        return { content: [{ type: 'text', text: 'No LLM API key found in environment variables' }], isError: true };
      }

      // Collect all file paths under this node (recursive descendants)
      const getDescendantFiles = (nodeId: string): string[] => {
        const node = graph.nodes[nodeId];
        if (!node) return [];
        if (node.sourceRef?.filePath && node.kind === 'module') return [node.sourceRef.filePath];
        return node.children.flatMap(childId => getDescendantFiles(childId));
      };

      const files = getDescendantFiles(node_id);
      if (files.length === 0) {
        return { content: [{ type: 'text', text: `No source files found under node "${scopeNode.name}"` }], isError: true };
      }

      const llmSettings = buildLLMSettings(llm_provider, llm_api_key, llm_model);
      const logs: string[] = [];
      const onLog = (_type: string, msg: string) => { logs.push(msg); };

      // Find the directory root from any file's path
      const anyFile = files[0];
      const repoRoot = Object.values(graph.nodes)
        .filter(n => n.kind === 'system')
        .map(n => n.sourceRef?.filePath)
        .find(Boolean) ?? '';

      // Try to get provider from graph's stored repoId (best effort)
      let fsProvider: InstanceType<typeof NodeFileSystemProvider> | undefined;
      try {
        // Walk up from a known file to find the repo root directory
        const sampleFilePath = files[0];
        // The graph was scanned from a directory — try common roots
        const possibleRoots = ['/home/nathan/Projects/bluelens', process.cwd()];
        for (const root of possibleRoots) {
          const { existsSync: exists } = await import('node:fs');
          if (exists(`${root}/${sampleFilePath}`)) {
            fsProvider = new NodeFileSystemProvider(root);
            break;
          }
        }
      } catch { /* provider optional */ }

      const scopeCluster = { nodeId: node_id, name: scopeNode.name, files };

      let flows: Record<string, import('../../../types.js').GraphFlow>;
      try {
        flows = await orchestrateFlowGeneration(
          graph, [], fsProvider, llmSettings,
          undefined, onLog, undefined,
          undefined, undefined, scopeCluster,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `Flow generation failed: ${msg}` }], isError: true };
      }

      if (Object.keys(flows).length === 0) {
        return { content: [{ type: 'text', text: `No flows generated for "${scopeNode.name}"` }] };
      }

      // Save diagrams
      const created: { id: string; name: string }[] = [];
      for (const flow of Object.values(flows)) {
        const seq = flow.sequenceDiagram;
        if (!seq) continue;
        const diagram = await storage.createDiagram(
          workspace_id, flow.name, seq, folder_id ?? null, flow.description,
        );
        created.push({ id: diagram.id, name: diagram.name });
      }

      // Persist updated graph with new flows
      const updatedGraph = { ...graph, flows: { ...graph.flows, ...flows }, updatedAt: Date.now() };
      await storage.saveCodeGraph(updatedGraph);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            scope: scopeNode.name,
            depth: scopeNode.depth,
            filesAnalyzed: files.length,
            diagramsCreated: created,
            logs: logs.slice(-15),
          }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'delete_codegraph',
    'Delete a stored CodeGraph',
    { graph_id: z.string().describe('CodeGraph ID to delete') },
    async ({ graph_id }) => {
      const graph = await storage.getCodeGraph(graph_id);
      if (!graph) {
        return { content: [{ type: 'text', text: `CodeGraph "${graph_id}" not found` }], isError: true };
      }
      await storage.deleteCodeGraph(graph_id);
      return { content: [{ type: 'text', text: `CodeGraph "${graph_id}" ("${graph.name}") deleted` }] };
    },
  );
}
