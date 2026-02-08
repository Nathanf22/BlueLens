/**
 * Heuristic rule engine for diagram analysis and anti-pattern detection.
 * Parses Mermaid code as text to extract nodes/edges, then applies structural rules.
 */

import { MermaidGraph, MermaidNode, MermaidEdge, DiagramAnalysis, AnalysisFinding } from '../types';

function parseMermaidGraph(code: string): MermaidGraph {
  const lines = code.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'));
  const nodes: MermaidNode[] = [];
  const edges: MermaidEdge[] = [];
  const subgraphs: string[] = [];
  const nodeIds = new Set<string>();

  // Detect diagram type from first line
  let type = 'flowchart';
  if (lines.length > 0) {
    const firstLine = lines[0].toLowerCase();
    if (firstLine.startsWith('graph ') || firstLine.startsWith('flowchart ')) type = 'flowchart';
    else if (firstLine.startsWith('sequencediagram')) type = 'sequenceDiagram';
    else if (firstLine.startsWith('classdiagram')) type = 'classDiagram';
    else if (firstLine.startsWith('erdiagram')) type = 'erDiagram';
    else if (firstLine.startsWith('statediagram')) type = 'stateDiagram';
  }

  const addNode = (id: string, label?: string) => {
    if (!nodeIds.has(id)) {
      nodeIds.add(id);
      nodes.push({ id, label: label || id });
    }
  };

  for (const line of lines) {
    // Skip directive lines
    if (line.startsWith('graph ') || line.startsWith('flowchart ') || line.startsWith('direction ')) continue;
    if (line === 'end') continue;

    // Subgraphs
    const subgraphMatch = line.match(/^subgraph\s+(.+?)(?:\s*\[.*\])?$/);
    if (subgraphMatch) {
      subgraphs.push(subgraphMatch[1].trim());
      continue;
    }

    // Edge patterns: A-->B, A-->|label|B, A-- label -->B, A-.->B, A==>B, etc.
    const edgePattern = /^(\w+)(?:\[.*?\]|[({].*?[})])?(\s*)(-->|==>|-.->|---->|--->|-->|--[^>].*?-->|--\|.*?\|)(>?)(\s*)(\w+)(?:\[.*?\]|[({].*?[})])?/;
    const edgeMatch = line.match(edgePattern);
    if (edgeMatch) {
      const fromId = edgeMatch[1];
      const toId = edgeMatch[6];
      // Try to extract edge label
      let edgeLabel: string | undefined;
      const labelMatch = line.match(/--\|(.+?)\|/);
      if (labelMatch) edgeLabel = labelMatch[1].trim();
      else {
        const labelMatch2 = line.match(/--\s+(.+?)\s+-->/);
        if (labelMatch2) edgeLabel = labelMatch2[1].trim();
      }

      addNode(fromId);
      addNode(toId);
      edges.push({ from: fromId, to: toId, label: edgeLabel });
      continue;
    }

    // Multiple edges on one line: A --> B --> C
    const multiEdge = line.match(/^(\w+)(?:\[.*?\])?\s*(-->|==>|-.->)\s*(.+)$/);
    if (multiEdge) {
      const parts = line.split(/\s*(?:-->|==>|-.->)\s*/);
      for (let i = 0; i < parts.length; i++) {
        const nodeMatch = parts[i].match(/^(\w+)(?:\[.*?\]|[({].*?[})])?/);
        if (nodeMatch) {
          const id = nodeMatch[1];
          // Extract label from brackets
          const bracketMatch = parts[i].match(/\[(.+?)\]|\((.+?)\)|{(.+?)}/);
          const label = bracketMatch ? (bracketMatch[1] || bracketMatch[2] || bracketMatch[3]) : undefined;
          addNode(id, label);
          if (i > 0) {
            const prevMatch = parts[i - 1].match(/^(\w+)/);
            if (prevMatch) {
              edges.push({ from: prevMatch[1], to: id });
            }
          }
        }
      }
      continue;
    }

    // Standalone node definitions: A[Label], A(Label), A{Label}, A((Label))
    const nodeDefMatch = line.match(/^(\w+)\s*[\[({](.+?)[\])}]/);
    if (nodeDefMatch) {
      addNode(nodeDefMatch[1], nodeDefMatch[2]);
      continue;
    }
  }

  return { type, nodes, edges, subgraphs };
}

function detectHighFanOut(graph: MermaidGraph): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  const outgoing = new Map<string, number>();
  for (const edge of graph.edges) {
    outgoing.set(edge.from, (outgoing.get(edge.from) || 0) + 1);
  }
  for (const [nodeId, count] of outgoing) {
    if (count > 5) {
      const node = graph.nodes.find(n => n.id === nodeId);
      findings.push({
        ruleId: 'high-fan-out',
        severity: 'warning',
        message: `"${node?.label || nodeId}" has ${count} outgoing dependencies (>5)`,
        nodeIds: [nodeId],
      });
    }
  }
  return findings;
}

function detectHighFanIn(graph: MermaidGraph): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  const incoming = new Map<string, number>();
  for (const edge of graph.edges) {
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
  }
  for (const [nodeId, count] of incoming) {
    if (count > 5) {
      const node = graph.nodes.find(n => n.id === nodeId);
      findings.push({
        ruleId: 'high-fan-in',
        severity: 'info',
        message: `"${node?.label || nodeId}" has ${count} incoming dependencies — may be a shared dependency`,
        nodeIds: [nodeId],
      });
    }
  }
  return findings;
}

function detectIsolatedNodes(graph: MermaidGraph): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  const connected = new Set<string>();
  for (const edge of graph.edges) {
    connected.add(edge.from);
    connected.add(edge.to);
  }
  for (const node of graph.nodes) {
    if (!connected.has(node.id)) {
      findings.push({
        ruleId: 'isolated-node',
        severity: 'warning',
        message: `"${node.label}" is disconnected from all other nodes`,
        nodeIds: [node.id],
      });
    }
  }
  return findings;
}

function detectCircularDependencies(graph: MermaidGraph): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  const adj = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (!adj.has(edge.from)) adj.set(edge.from, []);
    adj.get(edge.from)!.push(edge.to);
  }

  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): boolean {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    for (const neighbor of adj.get(node) || []) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recStack.has(neighbor)) {
        // Found cycle — extract it from path
        const cycleStart = path.indexOf(neighbor);
        const cycle = path.slice(cycleStart);
        cycle.push(neighbor);
        const labels = cycle.map(id => {
          const n = graph.nodes.find(nd => nd.id === id);
          return n?.label || id;
        });
        findings.push({
          ruleId: 'circular-dependency',
          severity: 'error',
          message: `Circular dependency: ${labels.join(' \u2192 ')}`,
          nodeIds: cycle.slice(0, -1),
        });
        return true;
      }
    }

    path.pop();
    recStack.delete(node);
    return false;
  }

  for (const node of graph.nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id);
    }
  }

  return findings;
}

function detectGodNodes(graph: MermaidGraph): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  const totalEdges = new Map<string, number>();
  for (const edge of graph.edges) {
    totalEdges.set(edge.from, (totalEdges.get(edge.from) || 0) + 1);
    totalEdges.set(edge.to, (totalEdges.get(edge.to) || 0) + 1);
  }
  for (const [nodeId, count] of totalEdges) {
    if (count > 8) {
      const node = graph.nodes.find(n => n.id === nodeId);
      findings.push({
        ruleId: 'god-node',
        severity: 'warning',
        message: `"${node?.label || nodeId}" has ${count} total connections — consider decomposing`,
        nodeIds: [nodeId],
      });
    }
  }
  return findings;
}

function detectMissingLabels(graph: MermaidGraph): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];

  for (const node of graph.nodes) {
    if (node.label === node.id && /^[A-Z]$/.test(node.id)) {
      findings.push({
        ruleId: 'missing-labels',
        severity: 'info',
        message: `Node "${node.id}" has no descriptive label`,
        nodeIds: [node.id],
      });
    }
  }

  const unlabeledEdges = graph.edges.filter(e => !e.label).length;
  if (unlabeledEdges > 0 && graph.edges.length > 3) {
    const pct = Math.round((unlabeledEdges / graph.edges.length) * 100);
    if (pct > 50) {
      findings.push({
        ruleId: 'missing-labels',
        severity: 'info',
        message: `${unlabeledEdges} of ${graph.edges.length} edges (${pct}%) lack labels`,
      });
    }
  }

  return findings;
}

export const diagramAnalyzerService = {
  parseMermaidGraph,

  analyze(code: string): DiagramAnalysis {
    const graph = parseMermaidGraph(code);

    const findings: AnalysisFinding[] = [
      ...detectHighFanOut(graph),
      ...detectHighFanIn(graph),
      ...detectIsolatedNodes(graph),
      ...detectCircularDependencies(graph),
      ...detectGodNodes(graph),
      ...detectMissingLabels(graph),
    ];

    return {
      findings,
      stats: {
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        subgraphCount: graph.subgraphs.length,
      },
    };
  },
};
