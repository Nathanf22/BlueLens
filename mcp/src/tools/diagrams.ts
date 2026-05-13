import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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
