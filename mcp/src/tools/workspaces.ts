import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { storage } from '../storage.js';

export function registerWorkspaceTools(server: McpServer): void {
  server.tool(
    'list_workspaces',
    'List all Bluelens workspaces',
    {},
    async () => {
      const workspaces = await storage.listWorkspaces();
      return {
        content: [{
          type: 'text',
          text: workspaces.length === 0
            ? 'No workspaces found. Use create_workspace to create one.'
            : JSON.stringify(workspaces, null, 2),
        }],
      };
    },
  );

  server.tool(
    'create_workspace',
    'Create a new Bluelens workspace',
    { name: z.string().min(1).describe('Workspace name') },
    async ({ name }) => {
      const workspace = await storage.createWorkspace(name);
      return {
        content: [{ type: 'text', text: JSON.stringify(workspace, null, 2) }],
      };
    },
  );

  server.tool(
    'delete_workspace',
    'Delete a workspace and all its folders and diagrams',
    { workspace_id: z.string().describe('Workspace ID to delete') },
    async ({ workspace_id }) => {
      const workspaces = await storage.listWorkspaces();
      if (!workspaces.find(w => w.id === workspace_id)) {
        return { content: [{ type: 'text', text: `Workspace "${workspace_id}" not found` }], isError: true };
      }
      await storage.deleteWorkspace(workspace_id);
      return { content: [{ type: 'text', text: `Workspace "${workspace_id}" deleted` }] };
    },
  );

  server.tool(
    'list_folders',
    'List all folders in a workspace',
    { workspace_id: z.string().describe('Workspace ID') },
    async ({ workspace_id }) => {
      const folders = await storage.listFolders(workspace_id);
      return {
        content: [{
          type: 'text',
          text: folders.length === 0
            ? 'No folders in this workspace.'
            : JSON.stringify(folders, null, 2),
        }],
      };
    },
  );

  server.tool(
    'create_folder',
    'Create a folder inside a workspace',
    {
      workspace_id: z.string().describe('Workspace ID'),
      name: z.string().min(1).describe('Folder name'),
      parent_id: z.string().optional().describe('Parent folder ID (omit for root-level folder)'),
    },
    async ({ workspace_id, name, parent_id }) => {
      const folder = await storage.createFolder(workspace_id, name, parent_id ?? null);
      return { content: [{ type: 'text', text: JSON.stringify(folder, null, 2) }] };
    },
  );

  server.tool(
    'delete_folder',
    'Delete a folder (diagrams inside are moved to workspace root)',
    { folder_id: z.string().describe('Folder ID to delete') },
    async ({ folder_id }) => {
      await storage.deleteFolder(folder_id);
      return { content: [{ type: 'text', text: `Folder "${folder_id}" deleted` }] };
    },
  );
}
