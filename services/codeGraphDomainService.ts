/**
 * LLM-powered domain analysis for CodeGraph.
 * Sends graph structure to the configured LLM and parses domain mappings.
 */

import { CodeGraph, DomainNode, DomainRelation, DomainRelationType, ProjectionRole, LLMSettings, GraphNode } from '../types';
import { llmService } from './llmService';

const generateId = () => Math.random().toString(36).substr(2, 9);

const SYSTEM_PROMPT = `You are a software architecture domain analyst. Given a code graph with nodes (files, classes, functions) and their relationships, identify the high-level business/domain concepts.

Your response MUST be valid JSON with this exact structure:
{
  "domains": [
    {
      "name": "string — domain concept name (e.g., 'Authentication', 'Payment Processing')",
      "description": "string — what this domain handles",
      "projections": [
        { "nodeId": "string — ID of a graph node that belongs to this domain", "role": "primary | supporting | referenced" }
      ]
    }
  ],
  "relations": [
    {
      "source": "string — domain name",
      "target": "string — domain name",
      "type": "owns | triggers | requires | produces | consumes",
      "label": "string — optional description"
    }
  ]
}

Guidelines:
- Identify 3-10 domain concepts based on the code structure
- Each code node should map to at most 2 domains
- Mark the most relevant mapping as "primary", others as "supporting" or "referenced"
- Domain relations should reflect business logic flow, not just code dependencies
- Use descriptive names that a non-developer would understand
- Return ONLY the JSON, no markdown fences or explanation`;

function buildGraphPrompt(graph: CodeGraph): string {
  const nodes = Object.values(graph.nodes);
  const relations = Object.values(graph.relations);

  // Summarize graph structure (limit to prevent token overflow)
  const nodeDescriptions = nodes
    .filter(n => n.kind !== 'system') // skip root
    .slice(0, 200) // cap
    .map(n => {
      const source = n.sourceRef ? ` [${n.sourceRef.filePath}]` : '';
      const tags = n.tags.length > 0 ? ` tags:[${n.tags.join(',')}]` : '';
      return `  ${n.id}: ${n.kind} "${n.name}"${source}${tags}`;
    })
    .join('\n');

  const relDescriptions = relations
    .filter(r => r.type !== 'contains')
    .slice(0, 300)
    .map(r => {
      const sourceName = graph.nodes[r.sourceId]?.name || r.sourceId;
      const targetName = graph.nodes[r.targetId]?.name || r.targetId;
      return `  ${sourceName} --${r.type}--> ${targetName}`;
    })
    .join('\n');

  return `Analyze this code graph and identify domain concepts:

Nodes (${nodes.length} total):
${nodeDescriptions}

Relations (${relations.length} total, showing non-containment):
${relDescriptions}

Return JSON with domain mappings.`;
}

interface LLMDomainResponse {
  domains: Array<{
    name: string;
    description?: string;
    projections: Array<{
      nodeId: string;
      role: 'primary' | 'supporting' | 'referenced';
    }>;
  }>;
  relations: Array<{
    source: string;
    target: string;
    type: string;
    label?: string;
  }>;
}

function parseResponse(raw: string): LLMDomainResponse {
  // Strip markdown fences if present
  let cleaned = raw.trim();
  const jsonMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (jsonMatch) {
    cleaned = jsonMatch[1].trim();
  }

  const parsed = JSON.parse(cleaned);

  if (!Array.isArray(parsed.domains)) {
    throw new Error('Response missing "domains" array');
  }

  return parsed as LLMDomainResponse;
}

const VALID_ROLES: ProjectionRole[] = ['primary', 'supporting', 'referenced'];
const VALID_DOMAIN_REL_TYPES: DomainRelationType[] = ['owns', 'triggers', 'requires', 'produces', 'consumes'];

export async function analyzeDomain(
  graph: CodeGraph,
  llmSettings: LLMSettings
): Promise<{
  domainNodes: Record<string, DomainNode>;
  domainRelations: Record<string, DomainRelation>;
}> {
  const prompt = buildGraphPrompt(graph);

  const response = await llmService.sendMessage(
    [{ role: 'user', content: prompt }],
    SYSTEM_PROMPT,
    llmSettings
  );

  const parsed = parseResponse(response.content);
  const validNodeIds = new Set(Object.keys(graph.nodes));

  // Build DomainNodes
  const domainNodes: Record<string, DomainNode> = {};
  const nameToId = new Map<string, string>();

  for (const domain of parsed.domains) {
    const id = generateId();
    nameToId.set(domain.name, id);

    const validProjections = (domain.projections || [])
      .filter(p => validNodeIds.has(p.nodeId) && VALID_ROLES.includes(p.role))
      .map(p => ({ graphNodeId: p.nodeId, role: p.role as ProjectionRole }));

    domainNodes[id] = {
      id,
      name: domain.name,
      description: domain.description,
      projections: validProjections,
      children: [],
      parentId: null,
    };
  }

  // Build DomainRelations
  const domainRelations: Record<string, DomainRelation> = {};

  for (const rel of parsed.relations) {
    const sourceId = nameToId.get(rel.source);
    const targetId = nameToId.get(rel.target);
    if (!sourceId || !targetId) continue;

    const type = VALID_DOMAIN_REL_TYPES.includes(rel.type as DomainRelationType)
      ? (rel.type as DomainRelationType)
      : 'requires';

    const id = generateId();
    domainRelations[id] = {
      id,
      sourceId,
      targetId,
      type,
      label: rel.label,
    };
  }

  return { domainNodes, domainRelations };
}

export const codeGraphDomainService = {
  analyzeDomain,
};
