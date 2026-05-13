import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CodeGraph, GraphNode, RelationType, LLMProvider, LLMSettings, LLMMessage } from '../../../types.js';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { storage } from '../storage.js';
import { llmService } from '../../../services/llmService.js';
import { codeGraphModelService } from '../../../services/codeGraphModelService.js';

function getDependentIds(graph: CodeGraph, nodeId: string): Array<{ sourceId: string; type: RelationType }> {
  return Object.values(graph.relations)
    .filter(r => r.targetId === nodeId && r.type === 'depends_on')
    .map(r => ({ sourceId: r.sourceId, type: r.type }));
}

function getDependencyIds(graph: CodeGraph, nodeId: string): Array<{ targetId: string; type: RelationType }> {
  return Object.values(graph.relations)
    .filter(r => r.sourceId === nodeId && r.type === 'depends_on')
    .map(r => ({ targetId: r.targetId, type: r.type }));
}

function collectTransitiveNodes(
  graph: CodeGraph,
  startId: string,
  direction: 'up' | 'down',
  maxDepth: number,
): Array<{ id: string; name: string; kind: string; filePath: string | null; distance: number }> {
  const visited = new Set<string>([startId]);
  const result: Array<{ id: string; name: string; kind: string; filePath: string | null; distance: number }> = [];
  const queue: Array<{ id: string; distance: number }> = [{ id: startId, distance: 0 }];

  while (queue.length > 0) {
    const { id: currentId, distance } = queue.shift()!;
    if (distance >= maxDepth) continue;

    const neighbors = direction === 'up'
      ? getDependentIds(graph, currentId).map(r => r.sourceId)
      : getDependencyIds(graph, currentId).map(r => r.targetId);

    for (const neighborId of neighbors) {
      if (visited.has(neighborId)) continue;
      visited.add(neighborId);
      const node = graph.nodes[neighborId];
      if (!node) continue;
      result.push({ id: neighborId, name: node.name, kind: node.kind, filePath: node.sourceRef?.filePath ?? null, distance: distance + 1 });
      queue.push({ id: neighborId, distance: distance + 1 });
    }
  }

  return result;
}

function nodeShape(node: GraphNode) {
  return { id: node.id, name: node.name, kind: node.kind, filePath: node.sourceRef?.filePath ?? null, depth: node.depth };
}

function getNodeDomain(graph: CodeGraph, nodeId: string): string | null {
  let node = graph.nodes[nodeId];
  while (node) {
    if (node.depth === 1) return node.name;
    if (!node.parentId) return null;
    node = graph.nodes[node.parentId];
  }
  return null;
}

function buildLLMSettings(provider: LLMProvider, apiKey: string, model?: string): LLMSettings {
  return {
    activeProvider: provider,
    providers: {
      gemini: provider === 'gemini' ? { provider: 'gemini', apiKey, model: model ?? 'gemini-2.5-flash' } : null,
      openai: provider === 'openai' ? { provider: 'openai', apiKey, model: model ?? 'gpt-4o-mini' } : null,
      anthropic: provider === 'anthropic' ? { provider: 'anthropic', apiKey, model: model ?? 'claude-sonnet-4-6' } : null,
    },
  };
}

function detectProvider(): { provider: LLMProvider; apiKey: string } | null {
  if (process.env.GEMINI_API_KEY || process.env.API_KEY) {
    return { provider: 'gemini', apiKey: (process.env.GEMINI_API_KEY ?? process.env.API_KEY)! };
  }
  if (process.env.OPENAI_API_KEY) return { provider: 'openai', apiKey: process.env.OPENAI_API_KEY };
  if (process.env.ANTHROPIC_API_KEY) return { provider: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY };
  return null;
}

interface ArchRule {
  type: 'forbidden_cross_domain' | 'fan_in_threshold';
  from_domain?: string;
  to_domain?: string;
  file_query?: string;
  max?: number;
  description: string;
}

interface Violation {
  rule: string;
  severity: 'error' | 'warning';
  message: string;
  details: string;
}

function runRules(graph: CodeGraph, rules: ArchRule[]): Violation[] {
  const violations: Violation[] = [];

  for (const rule of rules) {
    if (rule.type === 'forbidden_cross_domain' && rule.from_domain && rule.to_domain) {
      for (const rel of Object.values(graph.relations)) {
        if (rel.type !== 'depends_on') continue;
        const src = graph.nodes[rel.sourceId];
        const tgt = graph.nodes[rel.targetId];
        // Only check module-level nodes to avoid duplicating domain-level aggregate relations
        if (src?.kind !== 'module' || tgt?.kind !== 'module') continue;
        const srcDomain = getNodeDomain(graph, rel.sourceId);
        const tgtDomain = getNodeDomain(graph, rel.targetId);
        if (srcDomain === rule.from_domain && tgtDomain === rule.to_domain) {
          violations.push({
            rule: rule.description,
            severity: 'error',
            message: `Forbidden import: "${src?.name}" (${rule.from_domain}) → "${tgt?.name}" (${rule.to_domain})`,
            details: `${src?.sourceRef?.filePath ?? src?.name} → ${tgt?.sourceRef?.filePath ?? tgt?.name}`,
          });
        }
      }
    }

    if (rule.type === 'fan_in_threshold' && rule.file_query && rule.max !== undefined) {
      const q = rule.file_query.toLowerCase();
      const matches = Object.values(graph.nodes).filter(n =>
        n.name.toLowerCase().includes(q) || (n.sourceRef?.filePath?.toLowerCase().includes(q) ?? false),
      );
      for (const node of matches) {
        const fanIn = Object.values(graph.relations).filter(r => r.targetId === node.id && r.type === 'depends_on').length;
        if (fanIn > rule.max!) {
          violations.push({
            rule: rule.description,
            severity: 'warning',
            message: `Fan-in exceeded: "${node.name}" has ${fanIn} dependents (max: ${rule.max})`,
            details: node.sourceRef?.filePath ?? node.name,
          });
        }
      }
    }
  }

  return violations;
}

function violationKey(v: Violation): string {
  return `${v.rule}::${v.details}`;
}

export function registerAnalysisTools(server: McpServer): void {
  server.tool(
    'analyze_node_impact',
    'Blast-radius analysis: shows direct dependents (fan-in), direct dependencies (fan-out), and transitive blast radius. Run before modifying any file to know the risk.',
    {
      graph_id: z.string().describe('CodeGraph ID'),
      node_id: z.string().optional().describe('Node ID to analyze'),
      file_path: z.string().optional().describe('Partial file path — resolves to the matching module node (use if node_id is unknown)'),
      max_depth: z.number().int().min(1).max(6).optional().describe('Transitive depth for blast radius (default: 3)'),
    },
    async ({ graph_id, node_id, file_path, max_depth = 3 }) => {
      const graph = await storage.getCodeGraph(graph_id);
      if (!graph) return { content: [{ type: 'text', text: `CodeGraph "${graph_id}" not found` }], isError: true };

      let node: GraphNode | undefined;
      if (node_id) {
        node = graph.nodes[node_id];
      } else if (file_path) {
        const q = file_path.toLowerCase();
        node = Object.values(graph.nodes).find(n => n.sourceRef?.filePath?.toLowerCase().includes(q));
      }

      if (!node) {
        return { content: [{ type: 'text', text: node_id ? `Node "${node_id}" not found` : `No node matches file path "${file_path}"` }], isError: true };
      }

      const directDependents = getDependentIds(graph, node.id).map(r => {
        const n = graph.nodes[r.sourceId];
        return n ? { ...nodeShape(n), relationType: r.type } : null;
      }).filter(Boolean);

      const directDependencies = getDependencyIds(graph, node.id).map(r => {
        const n = graph.nodes[r.targetId];
        return n ? { ...nodeShape(n), relationType: r.type } : null;
      }).filter(Boolean);

      const blastRadius = collectTransitiveNodes(graph, node.id, 'up', max_depth);

      const riskScore = Math.min(10, Math.ceil(
        (directDependents.length * 2 + blastRadius.length * 0.4) / 2,
      ));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            node: { ...nodeShape(node), tags: node.tags },
            impact: {
              directDependents: directDependents.length,
              directDependencies: directDependencies.length,
              transitiveBlastRadius: blastRadius.length,
              riskScore: `${riskScore}/10`,
            },
            directDependents,
            directDependencies,
            blastRadius: blastRadius.sort((a, b) => a.distance - b.distance),
          }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'find_dependency_path',
    'Find the shortest dependency path between two nodes (how does A reach B?). Useful for understanding indirect coupling.',
    {
      graph_id: z.string().describe('CodeGraph ID'),
      from_node_id: z.string().describe('Source node ID'),
      to_node_id: z.string().describe('Target node ID'),
      max_hops: z.number().int().min(1).max(10).optional().describe('Maximum path length to search (default: 6)'),
    },
    async ({ graph_id, from_node_id, to_node_id, max_hops = 6 }) => {
      const graph = await storage.getCodeGraph(graph_id);
      if (!graph) return { content: [{ type: 'text', text: `CodeGraph "${graph_id}" not found` }], isError: true };

      if (!graph.nodes[from_node_id]) return { content: [{ type: 'text', text: `Node "${from_node_id}" not found` }], isError: true };
      if (!graph.nodes[to_node_id]) return { content: [{ type: 'text', text: `Node "${to_node_id}" not found` }], isError: true };

      type QueueEntry = { id: string; path: string[]; relationPath: RelationType[] };
      const queue: QueueEntry[] = [{ id: from_node_id, path: [from_node_id], relationPath: [] }];
      const visited = new Set<string>([from_node_id]);

      while (queue.length > 0) {
        const { id: currentId, path, relationPath } = queue.shift()!;
        if (path.length > max_hops) continue;

        const outgoing = Object.values(graph.relations).filter(r => r.sourceId === currentId && r.type === 'depends_on');
        for (const rel of outgoing) {
          const isTarget = rel.targetId === to_node_id;
          if (isTarget || !visited.has(rel.targetId)) {
            const fullPath = [...path, rel.targetId];
            const fullRelPath = [...relationPath, rel.type];

            if (isTarget) {
              return {
                content: [{
                  type: 'text',
                  text: JSON.stringify({
                    found: true,
                    hops: fullPath.length - 1,
                    path: fullPath.map((nodeId, i) => {
                      const n = graph.nodes[nodeId];
                      return { id: nodeId, name: n?.name ?? nodeId, kind: n?.kind, filePath: n?.sourceRef?.filePath ?? null, relationToNext: i < fullPath.length - 1 ? fullRelPath[i] : null };
                    }),
                  }, null, 2),
                }],
              };
            }

            visited.add(rel.targetId);
            queue.push({ id: rel.targetId, path: fullPath, relationPath: fullRelPath });
          }
        }
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            found: false,
            message: `No dependency path from "${graph.nodes[from_node_id]?.name}" to "${graph.nodes[to_node_id]?.name}" within ${max_hops} hops`,
          }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'diff_codegraphs',
    'Structural diff between two CodeGraphs (before vs after a refactor). Reports added/removed files, new/dropped dependencies, and domain-level drift.',
    {
      base_graph_id: z.string().describe('Base CodeGraph ID (the "before" state)'),
      target_graph_id: z.string().describe('Target CodeGraph ID (the "after" state)'),
    },
    async ({ base_graph_id, target_graph_id }) => {
      const [base, target] = await Promise.all([storage.getCodeGraph(base_graph_id), storage.getCodeGraph(target_graph_id)]);
      if (!base) return { content: [{ type: 'text', text: `CodeGraph "${base_graph_id}" not found` }], isError: true };
      if (!target) return { content: [{ type: 'text', text: `CodeGraph "${target_graph_id}" not found` }], isError: true };

      const baseModules = Object.values(base.nodes).filter(n => n.kind === 'module');
      const targetModules = Object.values(target.nodes).filter(n => n.kind === 'module');
      const baseByPath = new Map(baseModules.map(n => [n.sourceRef?.filePath, n]));
      const targetByPath = new Map(targetModules.map(n => [n.sourceRef?.filePath, n]));

      const addedModules = targetModules.filter(n => n.sourceRef?.filePath && !baseByPath.has(n.sourceRef.filePath));
      const removedModules = baseModules.filter(n => n.sourceRef?.filePath && !targetByPath.has(n.sourceRef.filePath));

      const depKey = (graph: CodeGraph, r: { sourceId: string; targetId: string }) => {
        const src = graph.nodes[r.sourceId]?.sourceRef?.filePath;
        const tgt = graph.nodes[r.targetId]?.sourceRef?.filePath;
        return src && tgt ? `${src} → ${tgt}` : null;
      };

      const baseDeps = new Set(Object.values(base.relations).filter(r => r.type === 'depends_on').map(r => depKey(base, r)).filter(Boolean) as string[]);
      const targetDeps = new Set(Object.values(target.relations).filter(r => r.type === 'depends_on').map(r => depKey(target, r)).filter(Boolean) as string[]);

      const addedDeps = [...targetDeps].filter(d => !baseDeps.has(d));
      const removedDeps = [...baseDeps].filter(d => !targetDeps.has(d));

      const basePackages = new Set(Object.values(base.nodes).filter(n => n.depth === 1).map(n => n.name));
      const targetPackages = new Set(Object.values(target.nodes).filter(n => n.depth === 1).map(n => n.name));
      const addedDomains = [...targetPackages].filter(p => !basePackages.has(p));
      const removedDomains = [...basePackages].filter(p => !targetPackages.has(p));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            base: { id: base.id, name: base.name, scannedAt: new Date(base.createdAt).toISOString(), modules: baseModules.length, dependencies: baseDeps.size },
            target: { id: target.id, name: target.name, scannedAt: new Date(target.createdAt).toISOString(), modules: targetModules.length, dependencies: targetDeps.size },
            summary: {
              addedModules: addedModules.length,
              removedModules: removedModules.length,
              addedDependencies: addedDeps.length,
              removedDependencies: removedDeps.length,
              addedDomains: addedDomains.length,
              removedDomains: removedDomains.length,
            },
            addedModules: addedModules.map(n => ({ name: n.name, filePath: n.sourceRef?.filePath })),
            removedModules: removedModules.map(n => ({ name: n.name, filePath: n.sourceRef?.filePath })),
            addedDependencies: addedDeps.slice(0, 40),
            removedDependencies: removedDeps.slice(0, 40),
            domainChanges: { added: addedDomains, removed: removedDomains },
          }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'find_nodes',
    'Search for nodes by name, file path, kind, or depth. Use this to resolve a node ID before calling analyze_node_impact or find_dependency_path.',
    {
      graph_id: z.string().describe('CodeGraph ID'),
      query: z.string().optional().describe('Partial name or file path match (case-insensitive)'),
      kind: z.enum(['system', 'package', 'module', 'class', 'function', 'interface', 'variable', 'method', 'field']).optional().describe('Filter by node kind'),
      depth: z.number().int().min(0).max(4).optional().describe('Filter by depth (0=system, 1=package/domain, 2=module/file, 3=class/function, 4=method)'),
    },
    async ({ graph_id, query, kind, depth }) => {
      const graph = await storage.getCodeGraph(graph_id);
      if (!graph) return { content: [{ type: 'text', text: `CodeGraph "${graph_id}" not found` }], isError: true };

      let nodes = Object.values(graph.nodes);
      if (kind !== undefined) nodes = nodes.filter(n => n.kind === kind);
      if (depth !== undefined) nodes = nodes.filter(n => n.depth === depth);
      if (query) {
        const q = query.toLowerCase();
        nodes = nodes.filter(n => n.name.toLowerCase().includes(q) || (n.sourceRef?.filePath?.toLowerCase().includes(q) ?? false));
      }

      if (nodes.length === 0) {
        return { content: [{ type: 'text', text: 'No nodes matched the query.' }] };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(nodes.map(n => ({
            id: n.id,
            name: n.name,
            kind: n.kind,
            depth: n.depth,
            filePath: n.sourceRef?.filePath ?? null,
            parentId: n.parentId,
            childCount: n.children.length,
            tags: n.tags,
          })), null, 2),
        }],
      };
    },
  );

  server.tool(
    'check_architectural_rules',
    'Run deterministic architectural rules against a CodeGraph: forbidden cross-domain imports, fan-in thresholds. Optionally compare against a base graph to surface only NEW violations.',
    {
      graph_id: z.string().describe('CodeGraph to check'),
      rules: z.array(z.object({
        type: z.enum(['forbidden_cross_domain', 'fan_in_threshold']),
        from_domain: z.string().optional().describe('For forbidden_cross_domain: the importing domain name'),
        to_domain: z.string().optional().describe('For forbidden_cross_domain: the imported domain name'),
        file_query: z.string().optional().describe('For fan_in_threshold: partial file name to match'),
        max: z.number().optional().describe('For fan_in_threshold: maximum allowed fan-in'),
        description: z.string().describe('Human-readable rule description'),
      })).optional().describe('Rules to enforce. Omit to use the default bluelens ruleset.'),
      base_graph_id: z.string().optional().describe('If provided, report only NEW violations not present in the base graph'),
    },
    async ({ graph_id, rules: customRules, base_graph_id }) => {
      const graph = await storage.getCodeGraph(graph_id);
      if (!graph) return { content: [{ type: 'text', text: `CodeGraph "${graph_id}" not found` }], isError: true };

      const DEFAULT_RULES: ArchRule[] = [
        { type: 'forbidden_cross_domain', from_domain: 'Shared Utilities & Configuration', to_domain: 'Code Graph & Analysis', description: 'Shared utils must not import Code Graph layer' },
        { type: 'forbidden_cross_domain', from_domain: 'Shared Utilities & Configuration', to_domain: 'AI Agent & LLM Integration', description: 'Shared utils must not import LLM layer' },
        { type: 'forbidden_cross_domain', from_domain: 'Shared Utilities & Configuration', to_domain: 'Application Shell & Core UI', description: 'Shared utils must not import UI layer' },
        { type: 'forbidden_cross_domain', from_domain: 'Diagramming & Visualization', to_domain: 'AI Agent & LLM Integration', description: 'Diagramming must not directly import LLM agents' },
        { type: 'fan_in_threshold', file_query: 'types.ts', max: 310, description: 'types.ts fan-in must not grow beyond 310 (currently ~297)' },
        { type: 'fan_in_threshold', file_query: 'llmService.ts', max: 30, description: 'llmService.ts fan-in must not grow beyond 30 (currently ~23)' },
        { type: 'fan_in_threshold', file_query: 'App.tsx', max: 70, description: 'App.tsx dependency count must not grow beyond 70 (currently ~56)' },
      ];

      const rules: ArchRule[] = (customRules as ArchRule[] | undefined) ?? DEFAULT_RULES;
      const violations = runRules(graph, rules);

      let newViolations: Violation[] | undefined;
      if (base_graph_id) {
        const baseGraph = await storage.getCodeGraph(base_graph_id);
        if (!baseGraph) return { content: [{ type: 'text', text: `Base CodeGraph "${base_graph_id}" not found` }], isError: true };
        const baseViolations = new Set(runRules(baseGraph, rules).map(violationKey));
        newViolations = violations.filter(v => !baseViolations.has(violationKey(v)));
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            graph: { id: graph.id, name: graph.name },
            rulesChecked: rules.length,
            totalViolations: violations.length,
            ...(newViolations !== undefined ? { newViolations: newViolations.length, newViolationDetails: newViolations } : {}),
            violations,
          }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'review_architectural_drift',
    'LLM-powered review of structural changes between two CodeGraphs. Evaluates whether the changes align with the project architectural philosophy and flags risks. API keys read from env.',
    {
      base_graph_id: z.string().describe('Base CodeGraph ID (the "before")'),
      target_graph_id: z.string().describe('Target CodeGraph ID (the "after")'),
      project_directory: z.string().optional().describe('Path to the project root — used to read CLAUDE.md for architectural context'),
      architectural_context: z.string().optional().describe('Architectural philosophy to evaluate against (used if project_directory is not provided)'),
      llm_model: z.string().optional().describe('Model override (default: gemini-2.5-flash)'),
    },
    async ({ base_graph_id, target_graph_id, project_directory, architectural_context, llm_model }) => {
      const [base, target] = await Promise.all([storage.getCodeGraph(base_graph_id), storage.getCodeGraph(target_graph_id)]);
      if (!base) return { content: [{ type: 'text', text: `CodeGraph "${base_graph_id}" not found` }], isError: true };
      if (!target) return { content: [{ type: 'text', text: `CodeGraph "${target_graph_id}" not found` }], isError: true };

      const detected = detectProvider();
      if (!detected) return { content: [{ type: 'text', text: 'No LLM API key found in environment variables' }], isError: true };

      // Structural diff
      const baseModules = Object.values(base.nodes).filter(n => n.kind === 'module');
      const targetModules = Object.values(target.nodes).filter(n => n.kind === 'module');
      const baseByPath = new Map(baseModules.map(n => [n.sourceRef?.filePath, n]));
      const targetByPath = new Map(targetModules.map(n => [n.sourceRef?.filePath, n]));
      const addedModules = targetModules.filter(n => n.sourceRef?.filePath && !baseByPath.has(n.sourceRef.filePath)).map(n => n.sourceRef!.filePath);
      const removedModules = baseModules.filter(n => n.sourceRef?.filePath && !targetByPath.has(n.sourceRef.filePath)).map(n => n.sourceRef!.filePath);

      const depKey = (graph: CodeGraph, r: { sourceId: string; targetId: string }) => {
        const src = graph.nodes[r.sourceId]?.sourceRef?.filePath;
        const tgt = graph.nodes[r.targetId]?.sourceRef?.filePath;
        return src && tgt ? `${src} → ${tgt}` : null;
      };
      const baseDeps = new Set(Object.values(base.relations).filter(r => r.type === 'depends_on').map(r => depKey(base, r)).filter(Boolean) as string[]);
      const targetDeps = new Set(Object.values(target.relations).filter(r => r.type === 'depends_on').map(r => depKey(target, r)).filter(Boolean) as string[]);
      const addedDeps = [...targetDeps].filter(d => !baseDeps.has(d));
      const removedDeps = [...baseDeps].filter(d => !targetDeps.has(d));

      // Anomaly diff
      const baseAnomalies = codeGraphModelService.validateGraph(base);
      const targetAnomalies = codeGraphModelService.validateGraph(target);
      const baseAnomalyKeys = new Set(baseAnomalies.map(a => `${a.type}::${a.message}`));
      const newAnomalies = targetAnomalies.filter(a => !baseAnomalyKeys.has(`${a.type}::${a.message}`));

      // Deterministic rule violations (new only)
      const DEFAULT_RULES: ArchRule[] = [
        { type: 'forbidden_cross_domain', from_domain: 'Shared Utilities & Configuration', to_domain: 'Code Graph & Analysis', description: 'Shared utils must not import Code Graph layer' },
        { type: 'forbidden_cross_domain', from_domain: 'Shared Utilities & Configuration', to_domain: 'AI Agent & LLM Integration', description: 'Shared utils must not import LLM layer' },
        { type: 'forbidden_cross_domain', from_domain: 'Diagramming & Visualization', to_domain: 'AI Agent & LLM Integration', description: 'Diagramming must not directly import LLM agents' },
        { type: 'fan_in_threshold', file_query: 'types.ts', max: 310, description: 'types.ts fan-in threshold' },
        { type: 'fan_in_threshold', file_query: 'llmService.ts', max: 30, description: 'llmService.ts fan-in threshold' },
      ];
      const baseRuleViolations = new Set(runRules(base, DEFAULT_RULES).map(violationKey));
      const newRuleViolations = runRules(target, DEFAULT_RULES).filter(v => !baseRuleViolations.has(violationKey(v)));

      // Read architectural context
      let context = architectural_context ?? '';
      if (!context && project_directory) {
        try {
          context = readFileSync(join(project_directory, 'CLAUDE.md'), 'utf-8');
        } catch { /* not found */ }
        if (!context) {
          try {
            context = readFileSync(join(project_directory, 'PRD'), 'utf-8').slice(0, 3000);
          } catch { /* not found */ }
        }
      }

      // Read git log between the two scan timestamps
      let gitLog = '';
      if (project_directory) {
        try {
          const since = new Date(base.createdAt).toISOString();
          const until = new Date(target.createdAt + 1000).toISOString();
          gitLog = execSync(
            `git log --after="${since}" --before="${until}" --format="commit %h%n%s%n%b%n---" --no-merges`,
            { cwd: project_directory, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] },
          ).trim();
        } catch { /* not a git repo or no commits in range */ }
      }

      const basePackages = Object.values(base.nodes).filter(n => n.depth === 1).map(n => n.name);
      const targetPackages = Object.values(target.nodes).filter(n => n.depth === 1).map(n => n.name);

      const systemPrompt = `You are a senior software architect reviewing codebase evolution.
Your job: evaluate whether structural changes between two CodeGraph snapshots are consistent with the project's architectural philosophy, and flag concrete risks.
Be direct, concise, and specific. Do not summarize what you were given — focus on what matters architecturally.`;

      const userMessage = `## Architectural Philosophy
${context || '(not provided — use general software architecture principles)'}

## Commits Between Scans
${gitLog || '(no git history available — structural changes cannot be explained by commit context)'}

## Structural Changes
- Added modules (${addedModules.length}): ${addedModules.slice(0, 20).join(', ') || 'none'}
- Removed modules (${removedModules.length}): ${removedModules.slice(0, 20).join(', ') || 'none'}
- New dependencies (${addedDeps.length}): ${addedDeps.slice(0, 20).join('; ') || 'none'}
- Removed dependencies (${removedDeps.length}): ${removedDeps.slice(0, 20).join('; ') || 'none'}
- Domain structure changed: base=[${basePackages.join(', ')}] → target=[${targetPackages.join(', ')}]

## New Structural Anomalies Introduced (${newAnomalies.length})
${newAnomalies.map(a => `- [${a.severity}] ${a.type}: ${a.message}`).join('\n') || 'none'}

## New Deterministic Rule Violations (${newRuleViolations.length})
${newRuleViolations.map(v => `- [${v.severity}] ${v.message}`).join('\n') || 'none'}

Answer these three questions:
1. **Alignment**: Use the commit messages to understand intent. Do the structural changes match what the commits describe? Flag any structural change NOT explained by a commit.
2. **Risks**: What are the concrete architectural risks introduced? Distinguish between intentional changes (explained by commits) and unexplained drift.
3. **Recommendations**: What should be fixed or watched? If a commit lacks an architectural explanation for a significant structural change, flag that too.`;

      const messages: LLMMessage[] = [{ role: 'user', content: userMessage }];
      const llmSettings: LLMSettings = buildLLMSettings(detected.provider, detected.apiKey, llm_model);

      try {
        const response = await llmService.sendMessage(messages, systemPrompt, llmSettings, { source: 'architectural-review' });
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              base: { id: base.id, name: base.name, scannedAt: new Date(base.createdAt).toISOString() },
              target: { id: target.id, name: target.name, scannedAt: new Date(target.createdAt).toISOString() },
              structuralDiff: { addedModules: addedModules.length, removedModules: removedModules.length, addedDeps: addedDeps.length, removedDeps: removedDeps.length },
              newAnomalies: newAnomalies.length,
              newRuleViolations: newRuleViolations.length,
              tokensUsed: response.usage?.totalTokens,
              review: response.content,
            }, null, 2),
          }],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text', text: `LLM review failed: ${msg}` }], isError: true };
      }
    },
  );
}
