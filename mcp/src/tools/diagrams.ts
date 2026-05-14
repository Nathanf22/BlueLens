import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { NodeLink } from '../../../types.js';
import { z } from 'zod';
import { writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { storage } from '../storage.js';

const DEFAULT_DIAGRAM = `flowchart TD
    Start([Start]) --> Decision{Decision}
    Decision -->|Yes| Action[Action]
    Decision -->|No| End([End])
    Action --> End`;

export function registerDiagramTools(server: McpServer): void {
  server.tool(
    'list_diagrams',
    'List diagrams in a workspace, optionally filtered by folder',
    {
      workspace_id: z.string().describe('Workspace ID'),
      folder_id: z.string().optional().describe('Filter by folder ID. Omit to list all diagrams in the workspace'),
    },
    async ({ workspace_id, folder_id }) => {
      const diagrams = await storage.listDiagrams(workspace_id, folder_id);
      if (diagrams.length === 0) {
        return { content: [{ type: 'text', text: 'No diagrams found.' }] };
      }
      const summary = diagrams.map(d => ({
        id: d.id,
        name: d.name,
        description: d.description,
        folderId: d.folderId,
        lastModified: new Date(d.lastModified).toISOString(),
        linesOfCode: d.code.split('\n').length,
        nodeLinks: d.nodeLinks.length,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
    },
  );

  server.tool(
    'get_diagram',
    'Get a diagram with its full Mermaid code',
    { diagram_id: z.string().describe('Diagram ID') },
    async ({ diagram_id }) => {
      const diagram = await storage.getDiagram(diagram_id);
      if (!diagram) {
        return { content: [{ type: 'text', text: `Diagram "${diagram_id}" not found` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(diagram, null, 2) }] };
    },
  );

  server.tool(
    'create_diagram',
    'Create a new Mermaid diagram in a workspace',
    {
      workspace_id: z.string().describe('Workspace ID'),
      name: z.string().min(1).describe('Diagram name'),
      code: z.string().optional().describe('Mermaid diagram code. Defaults to a flowchart template if omitted'),
      folder_id: z.string().optional().describe('Folder ID to place the diagram in'),
      description: z.string().optional().describe('Optional description'),
    },
    async ({ workspace_id, name, code, folder_id, description }) => {
      const diagram = await storage.createDiagram(
        workspace_id,
        name,
        code ?? DEFAULT_DIAGRAM,
        folder_id ?? null,
        description,
      );
      return { content: [{ type: 'text', text: JSON.stringify(diagram, null, 2) }] };
    },
  );

  server.tool(
    'update_diagram',
    'Update a diagram\'s name, code, or description',
    {
      diagram_id: z.string().describe('Diagram ID'),
      name: z.string().optional().describe('New name'),
      code: z.string().optional().describe('New Mermaid code'),
      description: z.string().optional().describe('New description'),
      folder_id: z.string().nullable().optional().describe('Move to folder (null to move to workspace root)'),
    },
    async ({ diagram_id, name, code, description, folder_id }) => {
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (code !== undefined) updates.code = code;
      if (description !== undefined) updates.description = description;
      if (folder_id !== undefined) updates.folderId = folder_id;

      const diagram = await storage.updateDiagram(diagram_id, updates as Parameters<typeof storage.updateDiagram>[1]);
      if (!diagram) {
        return { content: [{ type: 'text', text: `Diagram "${diagram_id}" not found` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(diagram, null, 2) }] };
    },
  );

  server.tool(
    'delete_diagram',
    'Delete a diagram permanently',
    { diagram_id: z.string().describe('Diagram ID to delete') },
    async ({ diagram_id }) => {
      const existing = await storage.getDiagram(diagram_id);
      if (!existing) {
        return { content: [{ type: 'text', text: `Diagram "${diagram_id}" not found` }], isError: true };
      }
      await storage.deleteDiagram(diagram_id);
      return { content: [{ type: 'text', text: `Diagram "${diagram_id}" ("${existing.name}") deleted` }] };
    },
  );

  server.tool(
    'search_diagrams',
    'Search diagrams by name or content across all workspaces',
    {
      query: z.string().min(1).describe('Search query (matches diagram name, description, or Mermaid code)'),
      workspace_id: z.string().optional().describe('Limit search to this workspace'),
    },
    async ({ query, workspace_id }) => {
      const workspaces = workspace_id
        ? [{ id: workspace_id }]
        : await storage.listWorkspaces();

      const results: Array<{ id: string; name: string; workspaceId: string; matchIn: string }> = [];
      const q = query.toLowerCase();

      for (const ws of workspaces) {
        const diagrams = await storage.listDiagrams(ws.id);
        for (const d of diagrams) {
          const matchIn: string[] = [];
          if (d.name.toLowerCase().includes(q)) matchIn.push('name');
          if (d.description?.toLowerCase().includes(q)) matchIn.push('description');
          if (d.code.toLowerCase().includes(q)) matchIn.push('code');
          if (matchIn.length > 0) {
            results.push({ id: d.id, name: d.name, workspaceId: d.workspaceId, matchIn: matchIn.join(', ') });
          }
        }
      }

      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No diagrams found matching "${query}"` }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    'add_node_link',
    'Link a Mermaid node in a diagram to another diagram (enables drill-down navigation in the Bluelens UI). node_id must match the exact node identifier used in the Mermaid code (e.g. "UserService", "A", "DB").',
    {
      diagram_id: z.string().describe('Diagram containing the node'),
      node_id: z.string().describe('Mermaid node identifier as written in the diagram code (case-sensitive)'),
      target_diagram_id: z.string().describe('Diagram to navigate to when the node is clicked'),
      label: z.string().optional().describe('Optional label for the link'),
    },
    async ({ diagram_id, node_id, target_diagram_id, label }) => {
      const diagram = await storage.getDiagram(diagram_id);
      if (!diagram) return { content: [{ type: 'text', text: `Diagram "${diagram_id}" not found` }], isError: true };

      const target = await storage.getDiagram(target_diagram_id);
      if (!target) return { content: [{ type: 'text', text: `Target diagram "${target_diagram_id}" not found` }], isError: true };

      const existing = diagram.nodeLinks.findIndex(l => l.nodeId === node_id);
      const updatedLinks: NodeLink[] = existing !== -1
        ? diagram.nodeLinks.map((l, i) => i === existing ? { nodeId: node_id, targetDiagramId: target_diagram_id, label } : l)
        : [...diagram.nodeLinks, { nodeId: node_id, targetDiagramId: target_diagram_id, label }];

      const updated = await storage.updateDiagram(diagram_id, { nodeLinks: updatedLinks });
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: existing !== -1 ? `Node link updated` : `Node link added`,
            nodeId: node_id,
            targetDiagram: { id: target.id, name: target.name },
            totalLinks: updated!.nodeLinks.length,
          }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'remove_node_link',
    'Remove the drill-down link from a Mermaid node in a diagram.',
    {
      diagram_id: z.string().describe('Diagram containing the node'),
      node_id: z.string().describe('Mermaid node identifier whose link should be removed'),
    },
    async ({ diagram_id, node_id }) => {
      const diagram = await storage.getDiagram(diagram_id);
      if (!diagram) return { content: [{ type: 'text', text: `Diagram "${diagram_id}" not found` }], isError: true };

      const before = diagram.nodeLinks.length;
      const updatedLinks = diagram.nodeLinks.filter(l => l.nodeId !== node_id);
      if (updatedLinks.length === before) {
        return { content: [{ type: 'text', text: `No link found for node "${node_id}" in diagram "${diagram_id}"` }], isError: true };
      }

      await storage.updateDiagram(diagram_id, { nodeLinks: updatedLinks });
      return { content: [{ type: 'text', text: `Link removed from node "${node_id}"` }] };
    },
  );

  server.tool(
    'export_for_bluelens',
    'Export MCP data as a BlueprintExport JSON file importable directly into the Bluelens web app via the Sidebar import button. Saves the file to disk and returns the path.',
    {
      workspace_id: z.string().optional().describe('Export only this workspace (omit to export everything)'),
      output_path: z.string().optional().describe('Where to save the file (default: ~/bluelens-export.bluelens)'),
    },
    async ({ workspace_id, output_path }) => {
      const allWorkspaces = await storage.listWorkspaces();
      const targetWorkspaces = workspace_id
        ? allWorkspaces.filter(w => w.id === workspace_id)
        : allWorkspaces;

      if (workspace_id && targetWorkspaces.length === 0) {
        return { content: [{ type: 'text', text: `Workspace "${workspace_id}" not found` }], isError: true };
      }

      const folders = (await Promise.all(targetWorkspaces.map(w => storage.listFolders(w.id)))).flat();
      const diagrams = (await Promise.all(targetWorkspaces.map(w => storage.listDiagrams(w.id)))).flat();

      const graphIndex = (await Promise.all(targetWorkspaces.map(w => storage.listCodeGraphs(w.id)))).flat();
      const codeGraphs = (await Promise.all(graphIndex.map(e => storage.getCodeGraph(e.id)))).filter(g => g !== null);

      const blueprint = {
        version: 1,
        exportType: workspace_id ? 'workspace' : 'all',
        exportDate: new Date().toISOString(),
        workspaces: targetWorkspaces,
        folders,
        diagrams,
        codeGraphs,
      };

      const dest = output_path ?? join(homedir(), 'bluelens-export.bluelens');
      await writeFile(dest, JSON.stringify(blueprint, null, 2), 'utf-8');

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            message: 'Export ready. Open Bluelens → Sidebar → Import and select this file.',
            file: dest,
            workspaces: targetWorkspaces.length,
            folders: folders.length,
            diagrams: diagrams.length,
            codeGraphs: codeGraphs.length,
          }, null, 2),
        }],
      };
    },
  );
}
