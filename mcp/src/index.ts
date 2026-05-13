#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerWorkspaceTools } from './tools/workspaces.js';
import { registerDiagramTools } from './tools/diagrams.js';
import { registerCodeGraphTools } from './tools/codegraph.js';

// Load .env from the bluelens project root (two levels up from mcp/dist/)
const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const envFile of [join(projectRoot, '.env'), join(projectRoot, 'mcp', '.env')]) {
  try {
    const lines = readFileSync(envFile, 'utf-8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '').trim();
      }
    }
  } catch { /* file not found — skip */ }
}

const server = new McpServer({
  name: 'bluelens',
  version: '0.1.0',
});

registerWorkspaceTools(server);
registerDiagramTools(server);
registerCodeGraphTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
