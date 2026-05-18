# bluelens-mcp

Model Context Protocol server for [BlueLens](https://bluelens.dev) — gives AI agents structural awareness of your codebase via a semantic graph.

## What it does

BlueLens MCP connects Claude, Cursor, and any MCP-compatible AI agent to your local BlueLens data: diagrams, workspaces, and CodeGraphs. Instead of reading raw files, your agent can navigate your codebase as a typed graph — querying nodes, tracing dependencies, running blast-radius analysis, and enforcing architectural rules.

## Installation

```bash
npm install -g bluelens-mcp
```

Requires **Node.js >= 20**.

## Setup

### Claude Code / Claude Desktop

Add to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bluelens": {
      "command": "bluelens-mcp",
      "args": []
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "bluelens": {
      "command": "bluelens-mcp",
      "args": []
    }
  }
}
```

### Any MCP client (stdio)

```json
{
  "command": "bluelens-mcp",
  "args": []
}
```

Data is read from `~/.bluelens/` by default. Override with the `BLUELENS_DATA_DIR` environment variable.

## Available tools

### CodeGraph analysis

| Tool | Description |
|---|---|
| `list_codegraphs` | List all stored CodeGraphs |
| `get_codegraph_summary` | High-level summary: node counts, domains, dependency stats |
| `get_codegraph_nodes` | Browse nodes filtered by depth, kind, or parent |
| `detect_codegraph_anomalies` | Find circular deps, orphans, god nodes, broken references |
| `scan_codebase` | Scan a local directory and generate a CodeGraph |
| `delete_codegraph` | Delete a stored CodeGraph |

### Impact analysis

| Tool | Description |
|---|---|
| `find_nodes` | Search nodes by name, file path, kind, or depth |
| `analyze_node_impact` | Blast-radius analysis: direct dependents, transitive impact, risk score |
| `find_dependency_path` | Shortest dependency path between two nodes |
| `diff_codegraphs` | Structural diff between two CodeGraph snapshots |
| `check_architectural_rules` | Enforce forbidden imports and fan-in thresholds |
| `review_architectural_drift` | Summary of structural drift over time |

### Diagrams

| Tool | Description |
|---|---|
| `list_diagrams` | List diagrams, optionally filtered by workspace or folder |
| `get_diagram` | Get a diagram's full content |
| `create_diagram` | Create a new diagram |
| `update_diagram` | Update an existing diagram |
| `delete_diagram` | Delete a diagram |
| `search_diagrams` | Full-text search across diagram titles and content |
| `generate_domain_diagrams` | Auto-generate diagrams from a CodeGraph |
| `add_node_link` | Add a link between nodes in a diagram |
| `remove_node_link` | Remove a link between nodes |
| `export_for_bluelens` | Export diagram data for use in the BlueLens editor |

### Workspaces

| Tool | Description |
|---|---|
| `list_workspaces` | List all workspaces |
| `create_workspace` | Create a new workspace |
| `delete_workspace` | Delete a workspace and all its contents |
| `list_folders` | List folders within a workspace |
| `create_folder` | Create a folder |
| `delete_folder` | Delete a folder |

### Cloud sync

| Tool | Description |
|---|---|
| `push_to_cloud` | Upload a CodeGraph to the BlueLens Cloud MCP server |

## Cloud mode

For teams or multi-machine setups, push your CodeGraph to the cloud once and let any agent query it via HTTP — no local process needed on the agent side.

```
push_to_cloud(
  graph_id: "<your-graph-id>",
  cloud_url: "https://mcp.bluelens.dev",
  api_key: "<your-secret-key>"
)
```

Then configure your agent to use the cloud endpoint directly:

```json
{
  "mcpServers": {
    "bluelens-cloud": {
      "type": "http",
      "url": "https://mcp.bluelens.dev/api/mcp",
      "headers": {
        "Authorization": "Bearer <your-api-key>"
      }
    }
  }
}
```

See [mcp.bluelens.dev](https://mcp.bluelens.dev) for full cloud documentation.

## Example prompts

Once connected, ask your agent:

- *"What are the main domains in this codebase?"*
- *"What is the blast radius of changing `src/services/auth.ts`?"*
- *"Is there a dependency path between `UserController` and `DatabasePool`?"*
- *"What changed structurally between last week's graph and today's?"*
- *"Enforce: the UI domain must never import from the database domain."*

## Data storage

By default, BlueLens stores data at `~/.bluelens/`:

```
~/.bluelens/
  db.json          # workspaces, folders, diagrams
  codegraphs/
    index.json     # CodeGraph metadata
    <id>.json      # individual CodeGraph files
```

Override the location with `BLUELENS_DATA_DIR`:

```bash
BLUELENS_DATA_DIR=/path/to/data bluelens-mcp
```

## Links

- [BlueLens editor](https://app.bluelens.dev)
- [Cloud MCP docs](https://mcp.bluelens.dev)
- [GitHub](https://github.com/Nathanf22/BlueLens)

## License

MIT
