/**
 * Agent tool definitions and executor for the global AI chat agentic loop.
 * Tools run entirely client-side against in-memory workspace state.
 */

import { Diagram, Folder, CodeGraph, RepoConfig, AgentToolStep } from '../types';

// ─── Tool definition format (universal, maps to all 3 providers) ─────────────

export interface AgentToolParam {
  type: 'string' | 'number' | 'boolean';
  description: string;
  enum?: string[];
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, AgentToolParam>;
    required?: string[];
  };
}

// ─── Execution context passed from App.tsx ────────────────────────────────────

export interface AgentToolContext {
  diagrams: Diagram[];
  folders: Folder[];
  codeGraphs: CodeGraph[];
  repos: RepoConfig[];
  workspaceId: string;
  onCreateDiagram: (name: string, code: string) => string; // returns new diagram id
  onUpdateDiagram: (id: string, code: string) => void;
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const AGENT_TOOLS: AgentToolDefinition[] = [
  {
    name: 'list_diagrams',
    description: 'Returns all diagrams in the current workspace (id, name, description, folder path). Use this first to discover what diagrams exist before fetching their content.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_diagram',
    description: 'Returns the full Mermaid code and metadata for a specific diagram by id.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The diagram id from list_diagrams' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_node_links',
    description: 'Returns the nodeLinks of a diagram — which Mermaid node IDs link to which sub-diagram ids.',
    parameters: {
      type: 'object',
      properties: {
        diagram_id: { type: 'string', description: 'The diagram id' },
      },
      required: ['diagram_id'],
    },
  },
  {
    name: 'list_code_graphs',
    description: 'Returns all CodeGraphs available in the workspace (id, name, node count, repo name).',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_graph_nodes',
    description: 'Returns nodes of a CodeGraph filtered by depth and/or kind. depth 1 = modules/packages, depth 2 = files, depth 3 = symbols (functions, classes).',
    parameters: {
      type: 'object',
      properties: {
        graph_id: { type: 'string', description: 'CodeGraph id from list_code_graphs' },
        depth: { type: 'number', description: 'Node depth: 1=module, 2=file, 3=symbol. Omit for all depths.' },
        parent_id: { type: 'string', description: 'Filter to children of this node id. Omit for root-level nodes.' },
        kind: {
          type: 'string',
          description: 'Filter by node kind',
          enum: ['system', 'package', 'module', 'file', 'class', 'function', 'variable', 'interface', 'type', 'enum', 'namespace'],
        },
      },
      required: ['graph_id'],
    },
  },
  {
    name: 'get_node_source',
    description: 'Fetches the source code for a specific graph node. Works for GitHub-backed repos. Returns file path, line range, and code excerpt.',
    parameters: {
      type: 'object',
      properties: {
        graph_id: { type: 'string', description: 'CodeGraph id' },
        node_id: { type: 'string', description: 'Node id from get_graph_nodes' },
      },
      required: ['graph_id', 'node_id'],
    },
  },
  {
    name: 'create_diagram',
    description: 'Creates a new diagram in the workspace with the given name and Mermaid code.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name for the new diagram' },
        code: { type: 'string', description: 'Complete valid Mermaid code' },
      },
      required: ['name', 'code'],
    },
  },
  {
    name: 'update_diagram',
    description: 'Updates the Mermaid code of an existing diagram. Use get_diagram first to retrieve the current code.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Diagram id to update' },
        code: { type: 'string', description: 'Complete updated Mermaid code' },
      },
      required: ['id', 'code'],
    },
  },
];

// ─── Folder path helper ───────────────────────────────────────────────────────

function getFolderPath(folderId: string | null, folders: Folder[]): string {
  const parts: string[] = [];
  let current = folderId;
  while (current) {
    const f = folders.find(f => f.id === current);
    if (!f) break;
    parts.unshift(f.name);
    current = f.parentId;
  }
  return parts.join('/');
}

// ─── Human-readable label for tool steps ─────────────────────────────────────

function makeLabel(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'list_diagrams': return 'list_diagrams()';
    case 'list_code_graphs': return 'list_code_graphs()';
    case 'get_diagram': return `get_diagram(id: "${args.id}")`;
    case 'list_node_links': return `list_node_links(diagram: "${args.diagram_id}")`;
    case 'get_graph_nodes': {
      const parts = [`graph: "${args.graph_id}"`];
      if (args.depth !== undefined) parts.push(`depth: ${args.depth}`);
      if (args.kind) parts.push(`kind: ${args.kind}`);
      if (args.parent_id) parts.push(`parent: "${args.parent_id}"`);
      return `get_graph_nodes(${parts.join(', ')})`;
    }
    case 'get_node_source': return `get_node_source(node: "${args.node_id}")`;
    case 'create_diagram': return `create_diagram(name: "${args.name}")`;
    case 'update_diagram': return `update_diagram(id: "${args.id}")`;
    default: return `${name}(${JSON.stringify(args)})`;
  }
}

// ─── Tool executor ────────────────────────────────────────────────────────────

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  context: AgentToolContext,
): Promise<AgentToolStep> {
  const label = makeLabel(name, args);
  let result: string;

  try {
    result = await executeToolInner(name, args, context);
  } catch (err: any) {
    result = JSON.stringify({ error: err?.message ?? 'Unknown error' });
  }

  return { toolName: name, args, result, label };
}

async function executeToolInner(
  name: string,
  args: Record<string, unknown>,
  ctx: AgentToolContext,
): Promise<string> {
  const workspaceDiagrams = ctx.diagrams.filter(d => d.workspaceId === ctx.workspaceId);
  const workspaceGraphs = ctx.codeGraphs.filter(g => g.workspaceId === ctx.workspaceId);

  switch (name) {
    case 'list_diagrams': {
      const result = workspaceDiagrams.map(d => ({
        id: d.id,
        name: d.name,
        description: d.description || null,
        folderPath: getFolderPath(d.folderId, ctx.folders) || '(root)',
      }));
      return JSON.stringify(result);
    }

    case 'get_diagram': {
      const id = args.id as string;
      const diagram = workspaceDiagrams.find(d => d.id === id);
      if (!diagram) return JSON.stringify({ error: `Diagram not found: ${id}` });
      return JSON.stringify({
        id: diagram.id,
        name: diagram.name,
        description: diagram.description || null,
        folderPath: getFolderPath(diagram.folderId, ctx.folders) || '(root)',
        code: diagram.code,
        nodeLinksCount: diagram.nodeLinks.length,
      });
    }

    case 'list_node_links': {
      const id = args.diagram_id as string;
      const diagram = workspaceDiagrams.find(d => d.id === id);
      if (!diagram) return JSON.stringify({ error: `Diagram not found: ${id}` });
      const links = diagram.nodeLinks.map(nl => {
        const target = workspaceDiagrams.find(d => d.id === nl.targetDiagramId);
        return {
          nodeId: nl.nodeId,
          label: nl.label || null,
          targetDiagramId: nl.targetDiagramId,
          targetDiagramName: target?.name || '(unknown)',
        };
      });
      return JSON.stringify(links);
    }

    case 'list_code_graphs': {
      const result = workspaceGraphs.map(g => ({
        id: g.id,
        name: g.name,
        nodeCount: Object.keys(g.nodes).length,
        flowCount: Object.keys(g.flows).length,
        repoId: g.repoId,
      }));
      return JSON.stringify(result);
    }

    case 'get_graph_nodes': {
      const graphId = args.graph_id as string;
      const graph = workspaceGraphs.find(g => g.id === graphId);
      if (!graph) return JSON.stringify({ error: `CodeGraph not found: ${graphId}` });

      let nodes = Object.values(graph.nodes);
      if (args.depth !== undefined) {
        nodes = nodes.filter(n => n.depth === (args.depth as number));
      }
      if (args.parent_id) {
        nodes = nodes.filter(n => n.parentId === (args.parent_id as string));
      }
      if (args.kind) {
        nodes = nodes.filter(n => n.kind === (args.kind as string));
      }
      // Limit output to avoid token explosion
      const limited = nodes.slice(0, 60);
      const result = limited.map(n => ({
        id: n.id,
        name: n.name,
        kind: n.kind,
        depth: n.depth,
        parentId: n.parentId,
        description: n.description || null,
        hasSource: !!n.sourceRef,
        filePath: n.sourceRef?.filePath || null,
      }));
      return JSON.stringify({ total: nodes.length, returned: result.length, nodes: result });
    }

    case 'get_node_source': {
      const graphId = args.graph_id as string;
      const nodeId = args.node_id as string;
      const graph = workspaceGraphs.find(g => g.id === graphId);
      if (!graph) return JSON.stringify({ error: `CodeGraph not found: ${graphId}` });

      const node = graph.nodes[nodeId];
      if (!node) return JSON.stringify({ error: `Node not found: ${nodeId}` });
      if (!node.sourceRef) return JSON.stringify({ error: 'No source reference for this node', nodeName: node.name, kind: node.kind });

      const { filePath, lineStart, lineEnd } = node.sourceRef;
      const repo = ctx.repos.find(r => r.id === graph.repoId);

      if (repo?.githubOwner && repo?.githubRepo) {
        const branch = repo.githubBranch || 'main';
        const rawBase = `/proxy/github-raw/${repo.githubOwner}/${repo.githubRepo}/${branch}`;
        const res = await fetch(`${rawBase}/${filePath}`);
        if (!res.ok) return JSON.stringify({ error: `HTTP ${res.status} fetching ${filePath}` });
        const content = await res.text();
        const lines = content.split('\n');
        const excerpt = lines.slice(lineStart - 1, lineEnd).join('\n');
        return JSON.stringify({ filePath, lineStart, lineEnd, source: excerpt });
      }

      return JSON.stringify({
        filePath,
        lineRange: `${lineStart}-${lineEnd}`,
        note: 'Full source only available for GitHub-backed repos in this context',
      });
    }

    case 'create_diagram': {
      const n = args.name as string;
      const code = args.code as string;
      if (!n?.trim()) return JSON.stringify({ error: 'name is required' });
      if (!code?.trim()) return JSON.stringify({ error: 'code is required' });
      const newId = ctx.onCreateDiagram(n.trim(), code.trim());
      return JSON.stringify({ success: true, id: newId, name: n.trim() });
    }

    case 'update_diagram': {
      const id = args.id as string;
      const code = args.code as string;
      const diagram = workspaceDiagrams.find(d => d.id === id);
      if (!diagram) return JSON.stringify({ error: `Diagram not found: ${id}` });
      ctx.onUpdateDiagram(id, code);
      return JSON.stringify({ success: true, id, name: diagram.name });
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
