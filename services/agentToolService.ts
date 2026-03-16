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
  onCreateFolder: (name: string, parentId: string | null) => string; // returns new folder id
  onCreateDiagram: (name: string, code: string, folderId?: string | null, description?: string) => string; // returns new diagram id
  onUpdateDiagram: (id: string, code: string) => void;
  onAddNodeLink: (diagramId: string, nodeId: string, targetDiagramId: string, label?: string) => void;
  onRemoveNodeLink: (diagramId: string, nodeId: string) => void;
  onAddCodeLink: (diagramId: string, nodeId: string, repoId: string, filePath: string, lineStart?: number, lineEnd?: number, label?: string) => void;
  onRemoveCodeLink: (diagramId: string, nodeId: string) => void;
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

export const AGENT_TOOLS: AgentToolDefinition[] = [
  {
    name: 'list_folders',
    description: 'Returns all folders in the current workspace (id, name, parentId, full path). Use before create_folder or create_diagram with a folder_id. PARALLEL: can be called together with list_diagrams and list_code_graphs.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_diagrams',
    description: 'Returns all diagrams in the current workspace (id, name, description, folderId, folder path). PARALLEL: call this together with list_code_graphs in the same turn when you need both. Must precede get_diagram / list_node_links / add_node_link calls that need diagram IDs.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_diagram',
    description: 'Returns the full Mermaid code and metadata for a specific diagram by id. PARALLEL: multiple get_diagram calls for different ids can be batched in the same turn. Requires diagram IDs from list_diagrams.',
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
    description: 'Returns the nodeLinks of a diagram — which Mermaid node IDs link to which sub-diagram ids. PARALLEL: multiple list_node_links calls for different diagrams can be batched together.',
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
    description: 'Returns all CodeGraphs available in the workspace (id, name, node count, repo name). PARALLEL: call this together with list_diagrams in the same turn when you need both. Must precede get_graph_nodes calls.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_graph_nodes',
    description: 'Returns nodes of a CodeGraph filtered by depth and/or kind. depth 1 = modules/packages, depth 2 = files, depth 3 = symbols (functions, classes). PARALLEL: multiple get_graph_nodes calls for different graph_ids or parent_ids can be batched together. Requires graph_id from list_code_graphs.',
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
    name: 'get_node_relations',
    description: 'Returns all structural relations (calls, depends_on, implements, etc.) and domain memberships for a node. Use this to follow cross-file/cross-package dependencies and understand which domains a node belongs to. PARALLEL: multiple get_node_relations calls for different node_ids can be batched together.',
    parameters: {
      type: 'object',
      properties: {
        graph_id: { type: 'string', description: 'CodeGraph id from list_code_graphs' },
        node_id: { type: 'string', description: 'Node id from get_graph_nodes' },
      },
      required: ['graph_id', 'node_id'],
    },
  },
  {
    name: 'get_node_source',
    description: 'Fetches the source code for a specific graph node. Works for GitHub-backed repos. Returns file path, line range, and code excerpt. PARALLEL: multiple get_node_source calls for different node_ids can be batched in the same turn. Requires node_id from get_graph_nodes.',
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
    name: 'add_node_link',
    description: 'Links a Mermaid node in a diagram to another diagram for drill-down navigation. The node will show a badge and become clickable. Requires: list_diagrams (for both diagram IDs) then get_diagram (to find node IDs) — these two reads can be done in parallel before calling this. PARALLEL: multiple add_node_link calls targeting different nodes can be batched together.',
    parameters: {
      type: 'object',
      properties: {
        diagram_id: { type: 'string', description: 'ID of the diagram containing the node' },
        node_id: { type: 'string', description: 'Mermaid node ID to link (e.g. "Auth", "UserService")' },
        target_diagram_id: { type: 'string', description: 'ID of the diagram to navigate to when the node is clicked' },
        label: { type: 'string', description: 'Optional label for the link' },
      },
      required: ['diagram_id', 'node_id', 'target_diagram_id'],
    },
  },
  {
    name: 'remove_node_link',
    description: 'Removes the drill-down link from a Mermaid node. PARALLEL: multiple remove_node_link calls targeting different nodes can be batched together.',
    parameters: {
      type: 'object',
      properties: {
        diagram_id: { type: 'string', description: 'ID of the diagram containing the node' },
        node_id: { type: 'string', description: 'Mermaid node ID whose link should be removed' },
      },
      required: ['diagram_id', 'node_id'],
    },
  },
  {
    name: 'add_code_link',
    description: 'Links a Mermaid node to a source file in a repo. Requires: list_code_graphs (for repo IDs) and get_graph_nodes with depth:2 (for file paths) — these reads can be done in parallel with list_diagrams before calling this. PARALLEL: multiple add_code_link calls targeting different nodes can be batched together.',
    parameters: {
      type: 'object',
      properties: {
        diagram_id: { type: 'string', description: 'ID of the diagram containing the node' },
        node_id: { type: 'string', description: 'Mermaid node ID to link' },
        repo_id: { type: 'string', description: 'Repo ID (from list_code_graphs repoId field)' },
        file_path: { type: 'string', description: 'File path relative to repo root' },
        line_start: { type: 'number', description: 'Optional start line' },
        line_end: { type: 'number', description: 'Optional end line' },
        label: { type: 'string', description: 'Optional display label' },
      },
      required: ['diagram_id', 'node_id', 'repo_id', 'file_path'],
    },
  },
  {
    name: 'remove_code_link',
    description: 'Removes the code link from a Mermaid node. PARALLEL: multiple remove_code_link calls targeting different nodes can be batched together.',
    parameters: {
      type: 'object',
      properties: {
        diagram_id: { type: 'string', description: 'ID of the diagram containing the node' },
        node_id: { type: 'string', description: 'Mermaid node ID whose code link should be removed' },
      },
      required: ['diagram_id', 'node_id'],
    },
  },
  {
    name: 'create_folder',
    description: 'Creates a new folder in the workspace. Use list_folders first to find existing folder IDs for nesting. PARALLEL: multiple create_folder calls for independent folders can be batched.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Folder name' },
        parent_id: { type: 'string', description: 'Parent folder id (from list_folders) for nesting. Omit to create at root.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'create_diagram',
    description: 'Creates a new diagram in the workspace with the given name, Mermaid code, optional description, and optional folder. Use list_folders to find folder IDs. PARALLEL: multiple create_diagram calls can be batched together.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name for the new diagram' },
        code: { type: 'string', description: 'Complete valid Mermaid code' },
        description: { type: 'string', description: 'Short description of what this diagram represents' },
        folder_id: { type: 'string', description: 'Folder id (from list_folders or create_folder) to place the diagram in. Omit for root.' },
      },
      required: ['name', 'code'],
    },
  },
  {
    name: 'update_diagram',
    description: 'Updates the Mermaid code of an existing diagram. Requires get_diagram first to retrieve the current code. SEQUENTIAL with respect to its own diagram — do not update the same diagram twice in one turn.',
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
    case 'get_node_relations': return `get_node_relations(node: "${args.node_id}")`;
    case 'get_node_source': return `get_node_source(node: "${args.node_id}")`;
    case 'add_node_link': return `add_node_link(node: "${args.node_id}" → diagram: "${args.target_diagram_id}")`;
    case 'remove_node_link': return `remove_node_link(node: "${args.node_id}")`;
    case 'add_code_link': return `add_code_link(node: "${args.node_id}" → ${args.file_path})`;
    case 'remove_code_link': return `remove_code_link(node: "${args.node_id}")`;
    case 'list_folders': return 'list_folders()';
    case 'create_folder': return `create_folder(name: "${args.name}"${args.parent_id ? `, parent: "${args.parent_id}"` : ''})`;
    case 'create_diagram': return `create_diagram(name: "${args.name}"${args.folder_id ? `, folder: "${args.folder_id}"` : ''})`;
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

  const workspaceFolders = ctx.folders.filter(f => f.workspaceId === ctx.workspaceId);

  switch (name) {
    case 'list_folders': {
      const result = workspaceFolders.map(f => ({
        id: f.id,
        name: f.name,
        parentId: f.parentId,
        path: getFolderPath(f.id, ctx.folders),
      }));
      return JSON.stringify(result);
    }

    case 'list_diagrams': {
      const result = workspaceDiagrams.map(d => ({
        id: d.id,
        name: d.name,
        description: d.description || null,
        folderId: d.folderId,
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
        nodeLinks: diagram.nodeLinks.map(nl => ({
          nodeId: nl.nodeId,
          targetDiagramId: nl.targetDiagramId,
          label: nl.label || null,
        })),
        codeLinks: (diagram.codeLinks || []).map(cl => ({
          nodeId: cl.nodeId,
          repoId: cl.repoId,
          filePath: cl.filePath,
          lineStart: cl.lineStart || null,
          lineEnd: cl.lineEnd || null,
          label: cl.label || null,
        })),
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

    case 'get_node_relations': {
      const graphId = args.graph_id as string;
      const nodeId = args.node_id as string;
      const graph = workspaceGraphs.find(g => g.id === graphId);
      if (!graph) return JSON.stringify({ error: `CodeGraph not found: ${graphId}` });

      const node = graph.nodes[nodeId];
      if (!node) return JSON.stringify({ error: `Node not found: ${nodeId}` });

      const allRels = Object.values(graph.relations).filter(r => r.type !== 'contains');
      const outgoing = allRels
        .filter(r => r.sourceId === nodeId)
        .map(r => ({
          type: r.type,
          label: r.label || null,
          targetId: r.targetId,
          targetName: graph.nodes[r.targetId]?.name || r.targetId,
          targetKind: graph.nodes[r.targetId]?.kind || null,
          targetFile: graph.nodes[r.targetId]?.sourceRef?.filePath || null,
        }));
      const incoming = allRels
        .filter(r => r.targetId === nodeId)
        .map(r => ({
          type: r.type,
          label: r.label || null,
          sourceId: r.sourceId,
          sourceName: graph.nodes[r.sourceId]?.name || r.sourceId,
          sourceKind: graph.nodes[r.sourceId]?.kind || null,
          sourceFile: graph.nodes[r.sourceId]?.sourceRef?.filePath || null,
        }));
      const domains = (node.domainProjections || []).map(domainId => ({
        id: domainId,
        name: graph.domainNodes?.[domainId]?.name || domainId,
        description: graph.domainNodes?.[domainId]?.description || null,
      }));

      return JSON.stringify({
        nodeId,
        nodeName: node.name,
        nodeKind: node.kind,
        outgoing,
        incoming,
        domains,
      });
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

    case 'add_node_link': {
      const diagramId = args.diagram_id as string;
      const nodeId = args.node_id as string;
      const targetDiagramId = args.target_diagram_id as string;
      const label = args.label as string | undefined;
      const diagram = workspaceDiagrams.find(d => d.id === diagramId);
      if (!diagram) return JSON.stringify({ error: `Diagram not found: ${diagramId}` });
      const target = workspaceDiagrams.find(d => d.id === targetDiagramId);
      if (!target) return JSON.stringify({ error: `Target diagram not found: ${targetDiagramId}` });
      ctx.onAddNodeLink(diagramId, nodeId, targetDiagramId, label);
      return JSON.stringify({ success: true, diagramId, nodeId, targetDiagramId, targetName: target.name });
    }

    case 'remove_node_link': {
      const diagramId = args.diagram_id as string;
      const nodeId = args.node_id as string;
      const diagram = workspaceDiagrams.find(d => d.id === diagramId);
      if (!diagram) return JSON.stringify({ error: `Diagram not found: ${diagramId}` });
      ctx.onRemoveNodeLink(diagramId, nodeId);
      return JSON.stringify({ success: true, diagramId, nodeId });
    }

    case 'add_code_link': {
      const diagramId = args.diagram_id as string;
      const nodeId = args.node_id as string;
      const repoId = args.repo_id as string;
      const filePath = args.file_path as string;
      const lineStart = args.line_start as number | undefined;
      const lineEnd = args.line_end as number | undefined;
      const label = args.label as string | undefined;
      const diagram = workspaceDiagrams.find(d => d.id === diagramId);
      if (!diagram) return JSON.stringify({ error: `Diagram not found: ${diagramId}` });
      const repo = ctx.repos.find(r => r.id === repoId);
      if (!repo) return JSON.stringify({ error: `Repo not found: ${repoId}` });
      ctx.onAddCodeLink(diagramId, nodeId, repoId, filePath, lineStart, lineEnd, label);
      return JSON.stringify({ success: true, diagramId, nodeId, repoId, filePath });
    }

    case 'remove_code_link': {
      const diagramId = args.diagram_id as string;
      const nodeId = args.node_id as string;
      const diagram = workspaceDiagrams.find(d => d.id === diagramId);
      if (!diagram) return JSON.stringify({ error: `Diagram not found: ${diagramId}` });
      ctx.onRemoveCodeLink(diagramId, nodeId);
      return JSON.stringify({ success: true, diagramId, nodeId });
    }

    case 'create_folder': {
      const n = args.name as string;
      const parentId = (args.parent_id as string | undefined) ?? null;
      if (!n?.trim()) return JSON.stringify({ error: 'name is required' });
      if (parentId) {
        const parent = workspaceFolders.find(f => f.id === parentId);
        if (!parent) return JSON.stringify({ error: `Parent folder not found: ${parentId}` });
      }
      const newId = ctx.onCreateFolder(n.trim(), parentId);
      return JSON.stringify({ success: true, id: newId, name: n.trim(), parentId });
    }

    case 'create_diagram': {
      const n = args.name as string;
      const code = args.code as string;
      const description = args.description as string | undefined;
      const folderId = (args.folder_id as string | undefined) ?? null;
      if (!n?.trim()) return JSON.stringify({ error: 'name is required' });
      if (!code?.trim()) return JSON.stringify({ error: 'code is required' });
      if (folderId) {
        const folder = workspaceFolders.find(f => f.id === folderId);
        if (!folder) return JSON.stringify({ error: `Folder not found: ${folderId}` });
      }
      const newId = ctx.onCreateDiagram(n.trim(), code.trim(), folderId, description?.trim());
      return JSON.stringify({ success: true, id: newId, name: n.trim(), folderId, description: description?.trim() || null });
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
