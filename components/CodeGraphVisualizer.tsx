/**
 * CodeGraphVisualizer — D3 force-directed SVG graph.
 * Node design adapted from github.com/Nathanf22/CodeGraph (components/GraphCanvas.tsx).
 * Rounded rects + Lucide icons + grid background + zoom controls.
 */

import React, { useEffect, useRef, useMemo, useCallback, useState } from 'react';
import * as d3 from 'd3';
import { createRoot } from 'react-dom/client';
import { ZoomIn, ZoomOut, Eye, Server, Box, Network, FileText, Terminal, Cpu, ShieldCheck, Layers, Code2 } from 'lucide-react';
import mermaid from 'mermaid';
import { CodeGraph, ViewLens, GraphNodeKind, RelationType, GraphFlow } from '../types';
import { codeGraphModelService } from '../services/codeGraphModelService';

// --- Node geometry ---
const NODE_W = 190;
const NODE_H = 54;
const DOMAIN_W = 170;
const DOMAIN_H = 60;

// --- Icon mapping by kind ---
const KIND_ICON: Record<string, React.ComponentType<{ size?: number }>> = {
  system:    Server,
  package:   Network,
  module:    Layers,
  class:     FileText,
  function:  Terminal,
  interface: ShieldCheck,
  variable:  Box,
  method:    Code2,
  field:     Box,
};

interface D3Node {
  id: string;
  name: string;
  description?: string;
  kind: GraphNodeKind | 'domain';
  depth: number;
  isDomain: boolean;
  // D3 simulation mutates these:
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface D3Link {
  id: string;
  source: string | D3Node;
  target: string | D3Node;
  type: RelationType | string;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const svgSelectionRef = useRef<d3.Selection<SVGSVGElement, unknown, null, undefined> | null>(null);
  const zoomBehaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const graphContainerRef = useRef<SVGGElement | null>(null);
  const simulationRef = useRef<d3.Simulation<D3Node, undefined> | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        setDimensions({ width: Math.floor(width), height: Math.floor(height) });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Build graph data from CodeGraph model
  const graphData = useMemo(() => {
    if (lens.type === 'domain') return buildDomainData(graph);
    return buildStandardData(graph, lens, focusNodeId);
  }, [graph, lens, focusNodeId]);

  // Fit view helper
  const handleFitView = useCallback(() => {
    if (!graphContainerRef.current || !svgSelectionRef.current || !zoomBehaviorRef.current) return;
    try {
      const bounds = graphContainerRef.current.getBBox();
      const { width, height } = dimensions;
      if (bounds.width === 0 || bounds.height === 0) return;
      const scale = Math.min(width / (bounds.width + 120), height / (bounds.height + 120), 1);
      const cx = bounds.x + bounds.width / 2;
      const cy = bounds.y + bounds.height / 2;
      const transform = d3.zoomIdentity
        .translate(width / 2, height / 2)
        .scale(scale)
        .translate(-cx, -cy);
      svgSelectionRef.current.transition().duration(750).call(zoomBehaviorRef.current.transform, transform);
    } catch { /* getBBox can fail on empty graphs */ }
  }, [dimensions]);

  const handleZoomIn  = () => svgSelectionRef.current?.transition().duration(300).call(zoomBehaviorRef.current!.scaleBy, 1.2);
  const handleZoomOut = () => svgSelectionRef.current?.transition().duration(300).call(zoomBehaviorRef.current!.scaleBy, 0.8);

  // Main D3 effect — runs when data or dimensions change
  useEffect(() => {
    if (!svgRef.current) return;

    const { width, height } = dimensions;
    const nodes: D3Node[] = graphData.nodes.map(n => ({ ...n }));
    const links: D3Link[] = graphData.links.map(l => ({ ...l }));

    if (simulationRef.current) simulationRef.current.stop();

    const simulation = d3.forceSimulation<D3Node>(nodes)
      .force('link', d3.forceLink<D3Node, D3Link>(links).id(d => d.id).distance(200))
      .force('charge', d3.forceManyBody().strength(-900))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(90));

    simulationRef.current = simulation;

    const svg = d3.select(svgRef.current);
    svgSelectionRef.current = svg;

    // Background click
    svg.on('click', (event) => {
      if (event.target === svgRef.current || (event.target as Element).tagName === 'rect' && (event.target as Element).getAttribute('fill') === 'url(#bg-grid)') {
        onBackgroundClick();
      }
    });

    // Defs (once)
    let defs = svg.select<SVGDefsElement>('defs');
    if (defs.empty()) defs = svg.append('defs');
    defs.html(''); // reset

    // Grid pattern
    const pattern = defs.append('pattern')
      .attr('id', 'bg-grid').attr('width', 40).attr('height', 40).attr('patternUnits', 'userSpaceOnUse');
    pattern.append('path')
      .attr('d', 'M 40 0 L 0 0 0 40').attr('fill', 'none').attr('stroke', '#1f2937').attr('stroke-width', 1).attr('opacity', 0.5);

    // Gradients
    const techGrad = defs.append('linearGradient').attr('id', 'tech-grad').attr('x1', '0%').attr('y1', '0%').attr('x2', '0%').attr('y2', '100%');
    techGrad.append('stop').attr('offset', '0%').attr('stop-color', '#374151');
    techGrad.append('stop').attr('offset', '100%').attr('stop-color', '#111827');

    const domainGrad = defs.append('linearGradient').attr('id', 'domain-grad').attr('x1', '0%').attr('y1', '0%').attr('x2', '0%').attr('y2', '100%');
    domainGrad.append('stop').attr('offset', '0%').attr('stop-color', '#6b21a8');
    domainGrad.append('stop').attr('offset', '100%').attr('stop-color', '#3b0764');

    // Shadow filter (feGaussianBlur + feOffset + feMerge)
    const shadowFilter = defs.append('filter').attr('id', 'shadow-sm').attr('height', '130%');
    shadowFilter.append('feGaussianBlur').attr('in', 'SourceAlpha').attr('stdDeviation', 2).attr('result', 'blur');
    shadowFilter.append('feOffset').attr('in', 'blur').attr('dx', 0).attr('dy', 2).attr('result', 'offsetBlur');
    const feMerge = shadowFilter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'offsetBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Arrow markers
    const mkMarker = (id: string, color: string, refX: number) => {
      defs.append('marker')
        .attr('id', id).attr('viewBox', '0 -5 10 10')
        .attr('refX', refX).attr('refY', 0)
        .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
        .append('path').attr('fill', color).attr('d', 'M0,-5L10,0L0,5');
    };
    mkMarker('arrow-std',    '#4b5563', 34);
    mkMarker('arrow-flow',   '#3b82f6', 34);
    mkMarker('arrow-domain', '#a855f7', 34);

    // Container group
    let container = svg.select<SVGGElement>('.graph-container');
    if (container.empty()) container = svg.append('g').attr('class', 'graph-container');
    graphContainerRef.current = container.node();

    // Links
    const link = container.selectAll<SVGLineElement, D3Link>('.link')
      .data(links, d => d.id)
      .join('line')
      .attr('class', 'link')
      .attr('stroke', d => {
        if (lens.type === 'flow')   return '#3b82f6';
        if (lens.type === 'domain') return '#a855f7';
        return '#4b5563';
      })
      .attr('stroke-width', d => lens.type === 'flow' ? 2 : 1.5)
      .attr('stroke-dasharray', d => d.isDashed ? '4,4' : lens.type === 'flow' ? '4,4' : '0')
      .attr('opacity', 0.6)
      .attr('marker-end', () => {
        if (lens.type === 'flow')   return 'url(#arrow-flow)';
        if (lens.type === 'domain') return 'url(#arrow-domain)';
        return 'url(#arrow-std)';
      });

    if (lens.type === 'flow') link.style('animation', 'dash 1s linear infinite');
    else link.style('animation', 'none');

    // Nodes
    const node = container.selectAll<SVGGElement, D3Node>('.node')
      .data(nodes, d => d.id)
      .join('g')
      .attr('class', 'node')
      .style('cursor', 'pointer')
      .call(
        d3.drag<SVGGElement, D3Node>()
          .on('start', (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
          .on('end',  (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
          }) as any
      );

    // Click / double-click
    const lastClick = { time: 0, id: '' };
    node.on('click', (event, d) => {
      event.stopPropagation();
      const now = Date.now();
      const isDbl = now - lastClick.time < 350 && lastClick.id === d.id;
      lastClick.time = now;
      lastClick.id = d.id;
      if (isDbl) onNodeDoubleClick(d.id);
      else onNodeClick(d.id);
    });

    // Draw shapes
    node.each(function(d) {
      const el = d3.select(this);
      el.selectAll('*').remove();

      const isSel = d.id === selectedNodeId;
      const w = d.isDomain ? DOMAIN_W : NODE_W;
      const h = d.isDomain ? DOMAIN_H : NODE_H;
      const x = -w / 2;
      const y = -h / 2;
      const r = d.isDomain ? 30 : 8;

      // Main rect with gradient + shadow
      el.append('rect')
        .attr('width', w).attr('height', h)
        .attr('x', x).attr('y', y)
        .attr('rx', r).attr('ry', r)
        .attr('fill', d.isDomain ? 'url(#domain-grad)' : 'url(#tech-grad)')
        .attr('stroke', isSel ? (d.isDomain ? '#e879f9' : '#38bdf8') : (d.isDomain ? '#7e22ce' : '#374151'))
        .attr('stroke-width', isSel ? 2 : 1)
        .attr('filter', 'url(#shadow-sm)');

      // Top highlight — glassy sheen
      el.append('path')
        .attr('d', `M ${x + r},${y + 1} L ${x + w - r},${y + 1}`)
        .attr('stroke', 'white').attr('stroke-width', 1).attr('opacity', 0.15);

      // Status dot (green, top-right) — tech nodes only
      if (!d.isDomain) {
        el.append('circle')
          .attr('cx', x + w - 12).attr('cy', y + 12).attr('r', 3)
          .attr('fill', '#10b981');
      }

      // Icon via foreignObject
      const iconSize = 20;
      const fo = el.append('foreignObject')
        .attr('width', iconSize).attr('height', iconSize)
        .attr('x', x + 15).attr('y', y + (h - iconSize) / 2)
        .style('pointer-events', 'none');

      const div = document.createElement('div');
      div.className = `flex items-center justify-center w-full h-full ${d.isDomain ? 'text-purple-200' : 'text-blue-400'}`;
      fo.node()?.appendChild(div);
      const Icon = d.isDomain ? Network : (KIND_ICON[d.kind] ?? Box);
      createRoot(div).render(React.createElement(Icon, { size: iconSize }));

      // Label
      el.append('text')
        .text(truncate(d.name, d.isDomain ? 16 : 18))
        .attr('x', x + 45).attr('y', y + h / 2 + 5)
        .attr('fill', '#f3f4f6')
        .attr('font-size', '14px')
        .attr('font-weight', '600')
        .attr('font-family', 'sans-serif')
        .style('text-shadow', '0 1px 2px rgba(0,0,0,0.8)')
        .style('pointer-events', 'none')
        .style('user-select', 'none');
    });

    // Tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as D3Node).x ?? 0)
        .attr('y1', d => (d.source as D3Node).y ?? 0)
        .attr('x2', d => (d.target as D3Node).x ?? 0)
        .attr('y2', d => (d.target as D3Node).y ?? 0);
      node.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    // Zoom
    zoomBehaviorRef.current = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 4])
      .on('zoom', event => container.attr('transform', event.transform.toString()));
    svg.call(zoomBehaviorRef.current);

    // Fit view after simulation settles
    const fitTimer = setTimeout(handleFitView, 600);

    return () => {
      simulation.stop();
      clearTimeout(fitTimer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphData, dimensions]);

  // Selection highlight effect — updates stroke only, no simulation restart
  useEffect(() => {
    if (!svgRef.current) return;
    d3.select(svgRef.current)
      .selectAll<SVGGElement, D3Node>('.node')
      .select('rect')
      .attr('stroke', d =>
        d.isDomain
          ? (d.id === selectedNodeId ? '#e879f9' : '#7e22ce')
          : (d.id === selectedNodeId ? '#38bdf8' : '#374151')
      )
      .attr('stroke-width', d => d.id === selectedNodeId ? 2 : 1);
  }, [selectedNodeId]);

  // --- Sequence diagram for active flow ---
  const [seqSvg, setSeqSvg] = useState('');
  const seqDiagramRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeFlow?.sequenceDiagram) { setSeqSvg(''); return; }
    let cancelled = false;
    mermaid.initialize({ startOnLoad: false, theme: 'dark', sequence: { mirrorActors: false, useMaxWidth: false } });
    (async () => {
      try {
        const { svg } = await mermaid.render(`seq-${activeFlow.id}-${Date.now()}`, activeFlow.sequenceDiagram);
        if (!cancelled) setSeqSvg(svg);
      } catch { if (!cancelled) setSeqSvg(''); }
    })();
    return () => { cancelled = true; };
  }, [activeFlow]);

  if (activeFlow) {
    return (
      <div ref={containerRef} className="w-full h-full bg-[#0d0d0d] rounded-lg overflow-hidden flex flex-col">
        <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 bg-dark-900/80 flex-shrink-0">
          <div className="w-2 h-2 rounded-full bg-cyan-400 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-gray-200 truncate">{activeFlow.name}</h3>
            <p className="text-[10px] text-gray-500 truncate">{activeFlow.description}</p>
          </div>
          <span className="text-[10px] text-gray-600 flex-shrink-0">{activeFlow.steps.length} steps</span>
        </div>
        <div className="flex-1 overflow-auto p-4 flex items-start justify-center">
          {seqSvg
            ? <div ref={seqDiagramRef} className="mermaid-sequence" dangerouslySetInnerHTML={{ __html: seqSvg }} />
            : <div className="flex items-center justify-center h-full text-gray-500 text-sm">Rendering…</div>
          }
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full bg-gray-900 relative overflow-hidden group">
      <style>{`@keyframes dash { to { stroke-dashoffset: -10; } }`}</style>
      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full h-full outline-none block"
      >
        {/* Grid background */}
        <rect width="100%" height="100%" fill="url(#bg-grid)" opacity={0.15} pointerEvents="none" />
        <defs />
        {/* .graph-container created by D3 */}
      </svg>

      {/* Zoom controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-0 opacity-70 group-hover:opacity-100 transition-opacity">
        <div className="bg-dark-800 rounded border border-gray-700 shadow-lg flex flex-col">
          <button onClick={handleZoomIn}  className="p-2 hover:bg-gray-700 rounded-t text-gray-300 transition-colors" title="Zoom in"><ZoomIn  size={16} /></button>
          <button onClick={handleZoomOut} className="p-2 hover:bg-gray-700 text-gray-300 transition-colors"          title="Zoom out"><ZoomOut size={16} /></button>
          <div className="h-px bg-gray-700" />
          <button onClick={handleFitView} className="p-2 hover:bg-gray-700 rounded-b text-gray-300 transition-colors" title="Fit view"><Eye size={16} /></button>
        </div>
      </div>
    </div>
  );
};

// --- Data builders ---

function buildStandardData(
  graph: CodeGraph,
  lens: ViewLens,
  focusNodeId: string | null,
): { nodes: D3Node[]; links: D3Link[] } {
  const visibleNodes = codeGraphModelService.getDirectChildrenForDisplay(graph, lens, focusNodeId ?? undefined);
  const visibleNodeIds = new Set(visibleNodes.map(n => n.id));
  const visibleRelations = codeGraphModelService.getVisibleRelations(graph, lens, visibleNodeIds);
  const nonContain = visibleRelations.filter(r => r.type !== 'contains');

  const nodes: D3Node[] = visibleNodes.map(n => ({
    id: n.id, name: n.name, description: n.description,
    kind: n.kind, depth: n.depth, isDomain: false,
  }));

  const links: D3Link[] = nonContain.map(r => ({
    id: r.id, source: r.sourceId, target: r.targetId,
    type: r.type, isDashed: r.type === 'implements' || r.type === 'inherits',
  }));

  return { nodes, links };
}

function buildDomainData(
  graph: CodeGraph,
): { nodes: D3Node[]; links: D3Link[] } {
  const domainNodes = Object.values(graph.domainNodes);
  const domainRelations = Object.values(graph.domainRelations);

  if (domainNodes.length === 0) {
    return {
      nodes: [{ id: '__empty__', name: 'No domain model — click Analyze', kind: 'module', depth: 0, isDomain: true }],
      links: [],
    };
  }

  const nodes: D3Node[] = domainNodes.map(dn => ({
    id: dn.id, name: dn.name, kind: 'module' as const, depth: 0, isDomain: true,
  }));

  const links: D3Link[] = domainRelations.map(dr => ({
    id: dr.id, source: dr.sourceId, target: dr.targetId,
    type: dr.type, isDashed: dr.type === 'requires',
  }));

  return { nodes, links };
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
