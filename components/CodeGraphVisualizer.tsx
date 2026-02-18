/**
 * CodeGraphVisualizer — force-directed 2D graph using react-force-graph-2d.
 * Replaces the Mermaid Preview when a CodeGraph is active.
 */

import React, { useMemo, useCallback, useRef, useEffect, useState } from 'react';
import type { ForceGraphMethods } from 'react-force-graph-2d';
import mermaid from 'mermaid';
import { CodeGraph, ViewLens, GraphNode, GraphRelation, GraphNodeKind, RelationType, GraphFlow } from '../types';
import { codeGraphModelService } from '../services/codeGraphModelService';

const ForceGraph2D = React.lazy(() => import('react-force-graph-2d'));

// --- Color palette by node kind ---
const KIND_COLORS: Record<GraphNodeKind, string> = {
  system: '#3b82f6',    // blue
  package: '#22c55e',   // green
  module: '#8b5cf6',    // purple
  class: '#f97316',     // orange
  function: '#06b6d4',  // cyan
  interface: '#eab308', // yellow
  variable: '#94a3b8',  // slate
  method: '#22d3ee',    // cyan-light
  field: '#9ca3af',     // gray
};

const DOMAIN_COLOR = '#60a5fa'; // blue-400 for domain nodes

interface ForceNode {
  id: string;
  name: string;
  description?: string;
  kind: GraphNodeKind | 'domain';
  depth: number;
  val: number;
  color: string;
  isSelected: boolean;
  isDomain: boolean;
}

interface ForceLink {
  source: string;
  target: string;
  type: RelationType | string;
  label?: string;
  isDashed: boolean;
}

interface CodeGraphVisualizerProps {
  graph: CodeGraph;
  lens: ViewLens;
  focusNodeId: string | null;
  selectedNodeId: string | null;
  activeFlow: GraphFlow | null;
  onNodeClick: (nodeId: string) => void;
  onNodeDoubleClick: (nodeId: string) => void;
  onBackgroundClick: () => void;
}

export const CodeGraphVisualizer: React.FC<CodeGraphVisualizerProps> = ({
  graph,
  lens,
  focusNodeId,
  selectedNodeId,
  activeFlow,
  onNodeClick,
  onNodeDoubleClick,
  onBackgroundClick,
}) => {
  const fgRef = useRef<ForceGraphMethods<ForceNode, ForceLink>>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = React.useState({ width: 800, height: 600 });

  // Track last click time for double-click detection
  const lastClickTime = useRef<number>(0);
  const lastClickNodeId = useRef<string | null>(null);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width: Math.floor(width), height: Math.floor(height) });
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Build force-graph data from visible nodes/relations
  const graphData = useMemo(() => {
    if (lens.type === 'domain') {
      return buildDomainGraphData(graph, selectedNodeId);
    }
    return buildStandardGraphData(graph, lens, focusNodeId, selectedNodeId);
  }, [graph, lens, focusNodeId, selectedNodeId]);

  // Fit to view when data changes
  useEffect(() => {
    const timer = setTimeout(() => {
      fgRef.current?.zoomToFit(400, 40);
    }, 300);
    return () => clearTimeout(timer);
  }, [graphData]);

  // Handle node click (single vs double)
  const handleNodeClick = useCallback((node: ForceNode) => {
    const now = Date.now();
    const isDoubleClick =
      now - lastClickTime.current < 350 &&
      lastClickNodeId.current === node.id;

    lastClickTime.current = now;
    lastClickNodeId.current = node.id;

    if (isDoubleClick) {
      onNodeDoubleClick(node.id);
    } else {
      onNodeClick(node.id);
    }
  }, [onNodeClick, onNodeDoubleClick]);

  // Custom node rendering on canvas
  const paintNode = useCallback((node: ForceNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const radius = Math.sqrt(node.val) * 3;
    const fontSize = Math.max(10 / globalScale, 1.5);

    // Selection highlight ring
    if (node.isSelected) {
      ctx.beginPath();
      ctx.arc(x, y, radius + 3, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 / globalScale;
      ctx.stroke();
    }

    // Node circle
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = node.color;
    ctx.fill();
    ctx.strokeStyle = node.isSelected ? '#ffffff' : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = (node.isSelected ? 1.5 : 0.5) / globalScale;
    ctx.stroke();

    // Label
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(node.name, x, y + radius + 2);

    // Description subtitle for D1 (package) nodes
    if (node.description && node.kind === 'package' && globalScale > 0.6) {
      const descFontSize = Math.max(8 / globalScale, 1.2);
      ctx.font = `${descFontSize}px sans-serif`;
      ctx.fillStyle = 'rgba(148, 163, 184, 0.7)';
      const maxLen = 35;
      const desc = node.description.length > maxLen
        ? node.description.slice(0, maxLen) + '...'
        : node.description;
      ctx.fillText(desc, x, y + radius + 2 + fontSize + 2);
    }
  }, []);

  // Hit area for pointer detection
  const paintNodeArea = useCallback((node: ForceNode, color: string, ctx: CanvasRenderingContext2D) => {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const radius = Math.sqrt(node.val) * 3 + 2;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  }, []);

  // Link styling
  const linkColor = useCallback((link: ForceLink) => {
    if (link.isDashed) return 'rgba(139, 92, 246, 0.4)'; // purple for implements/inherits
    if (link.type === 'calls') return 'rgba(6, 182, 212, 0.4)'; // cyan
    return 'rgba(148, 163, 184, 0.3)'; // default gray
  }, []);

  const linkDash = useCallback((link: ForceLink) => {
    return link.isDashed ? [4, 2] : null;
  }, []);

  // Sequence diagram rendering for active flow
  const seqDiagramRef = useRef<HTMLDivElement>(null);
  const [seqSvg, setSeqSvg] = useState<string>('');

  useEffect(() => {
    if (!activeFlow?.sequenceDiagram) {
      setSeqSvg('');
      return;
    }

    let cancelled = false;
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      sequence: {
        actorMargin: 50,
        messageMargin: 40,
        boxMargin: 10,
        noteMargin: 10,
        mirrorActors: false,
        useMaxWidth: false,
      },
    });

    const renderDiagram = async () => {
      try {
        const uniqueId = `seq-${activeFlow.id}-${Date.now()}`;
        const { svg } = await mermaid.render(uniqueId, activeFlow.sequenceDiagram);
        if (!cancelled) setSeqSvg(svg);
      } catch (err) {
        console.warn('[CodeGraph] Failed to render sequence diagram:', err);
        if (!cancelled) setSeqSvg('');
      }
    };
    renderDiagram();

    return () => { cancelled = true; };
  }, [activeFlow]);

  // Show sequence diagram when a flow is active
  if (activeFlow) {
    return (
      <div
        ref={containerRef}
        className="w-full h-full bg-[#0d0d0d] rounded-lg overflow-hidden flex flex-col"
      >
        {/* Flow header */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 bg-dark-900/80 flex-shrink-0">
          <div className="w-2 h-2 rounded-full bg-cyan-400 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-gray-200 truncate">{activeFlow.name}</h3>
            <p className="text-[10px] text-gray-500 truncate">{activeFlow.description}</p>
          </div>
          <span className="text-[10px] text-gray-600 flex-shrink-0">
            {activeFlow.steps.length} steps
          </span>
        </div>

        {/* Sequence diagram */}
        <div className="flex-1 overflow-auto p-4 flex items-start justify-center">
          {seqSvg ? (
            <div
              ref={seqDiagramRef}
              className="mermaid-sequence"
              dangerouslySetInnerHTML={{ __html: seqSvg }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              Rendering sequence diagram...
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-[#0d0d0d] rounded-lg overflow-hidden"
    >
      <React.Suspense fallback={
        <div className="w-full h-full flex items-center justify-center text-gray-500">
          Loading graph...
        </div>
      }>
        <ForceGraph2D
          ref={fgRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="#0d0d0d"
          nodeCanvasObject={paintNode}
          nodeCanvasObjectMode={() => 'replace'}
          nodePointerAreaPaint={paintNodeArea}
          onNodeClick={handleNodeClick}
          onBackgroundClick={onBackgroundClick}
          linkColor={linkColor}
          linkLineDash={linkDash}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          linkWidth={1}
          linkCurvature={0.1}
          d3AlphaDecay={0.03}
          d3VelocityDecay={0.3}
          cooldownTicks={100}
          enableNodeDrag={true}
        />
      </React.Suspense>
    </div>
  );
};

// --- Data builders ---

function buildStandardGraphData(
  graph: CodeGraph,
  lens: ViewLens,
  focusNodeId: string | null,
  selectedNodeId: string | null
): { nodes: ForceNode[]; links: ForceLink[] } {
  const visibleNodes = codeGraphModelService.getDirectChildrenForDisplay(graph, lens, focusNodeId || undefined);
  const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
  const visibleRelations = codeGraphModelService.getVisibleRelations(graph, lens, visibleNodeIds);

  // Skip containment relations for the force graph — structure is implicit
  const nonContainRelations = visibleRelations.filter(r => r.type !== 'contains');

  const nodes: ForceNode[] = visibleNodes.map(node => ({
    id: node.id,
    name: node.name,
    description: node.description,
    kind: node.kind,
    depth: node.depth,
    val: Math.max(2, (node.children?.length || 0) + 1),
    color: KIND_COLORS[node.kind] || '#94a3b8',
    isSelected: node.id === selectedNodeId,
    isDomain: false,
  }));

  const links: ForceLink[] = nonContainRelations.map(rel => ({
    source: rel.sourceId,
    target: rel.targetId,
    type: rel.type,
    label: rel.label,
    isDashed: rel.type === 'implements' || rel.type === 'inherits',
  }));

  return { nodes, links };
}

function buildDomainGraphData(
  graph: CodeGraph,
  selectedNodeId: string | null
): { nodes: ForceNode[]; links: ForceLink[] } {
  const domainNodes = Object.values(graph.domainNodes);
  const domainRelations = Object.values(graph.domainRelations);

  if (domainNodes.length === 0) {
    // Show a placeholder node
    return {
      nodes: [{
        id: '__empty__',
        name: 'No domain model — click Analyze',
        kind: 'domain',
        depth: 0,
        val: 5,
        color: DOMAIN_COLOR,
        isSelected: false,
        isDomain: true,
      }],
      links: [],
    };
  }

  const nodes: ForceNode[] = domainNodes.map(dn => ({
    id: dn.id,
    name: dn.name,
    kind: 'domain' as const,
    depth: 0,
    val: Math.max(2, dn.projections.length + 1),
    color: DOMAIN_COLOR,
    isSelected: dn.id === selectedNodeId,
    isDomain: true,
  }));

  const links: ForceLink[] = domainRelations.map(dr => ({
    source: dr.sourceId,
    target: dr.targetId,
    type: dr.type,
    label: dr.label,
    isDashed: dr.type === 'requires',
  }));

  return { nodes, links };
}
