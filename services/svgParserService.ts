/**
 * SVG Parser Service - DEBUG VERSION
 * Extracts and manipulates nodes from Mermaid-generated SVG diagrams
 */

export interface ParsedNode {
  id: string;              // Mermaid node ID (e.g., "A", "B", "flowchart-A-123")
  svgElementId: string;    // DOM element ID in the SVG
  bounds: DOMRect;         // Position and size
  label: string;           // Display text
  element: SVGGElement;    // Reference to the SVG element
}

export const svgParserService = {
  /**
   * Parse all nodes from a rendered SVG element
   */
  parseNodes(svgElement: SVGElement): ParsedNode[] {
    const nodes: ParsedNode[] = [];
    
    // Mermaid uses .node class for graph nodes
    const nodeElements = svgElement.querySelectorAll<SVGGElement>('.node');
    
    nodeElements.forEach((element, index) => {
      const id = element.id || '';
      
      // Extract the Mermaid node ID from the SVG element ID
      const nodeId = this.extractNodeId(id);
      
      // Get the label text - Mermaid uses foreignObject with nodeLabel
      let label = '';
      
      // Mermaid structure: g.node > g.label > foreignObject > div > span.nodeLabel > p
      const labelGroup = element.querySelector('g.label');
      if (labelGroup) {
        // Try to find the nodeLabel span
        const nodeLabel = labelGroup.querySelector('.nodeLabel');
        if (nodeLabel) {
          label = nodeLabel.textContent?.trim() || '';
        }
      }
      
      // Fallback: try direct text element (older Mermaid versions)
      if (!label) {
        const textElement = element.querySelector('text');
        if (textElement) {
          label = textElement.textContent?.trim() || '';
        }
      }

      
      // Get bounding box
      const bounds = element.getBoundingClientRect();
      
      nodes.push({
        id: nodeId,
        svgElementId: id,
        bounds,
        label,
        element
      });
    });
    
    return nodes;
  },

  /**
   * Extract the Mermaid node ID from SVG element ID
   * e.g., "flowchart-A-123" -> "A"
   */
  extractNodeId(svgElementId: string): string {
    console.log('[SVG Parser] Extracting ID from:', svgElementId);
    
    // Try to extract the node ID from common Mermaid patterns
    // Pattern 1: "flowchart-A-123" -> "A"
    const match1 = svgElementId.match(/flowchart-([^-]+)-/);
    if (match1) {
      return match1[1];
    }
    
    // Pattern 2: "node-A" -> "A"
    const match2 = svgElementId.match(/node-(.+)/);
    if (match2) {
      return match2[1];
    }
    
    // Pattern 3: Try graph-div-A-123 format
    const match3 = svgElementId.match(/-([A-Z])-\d+$/);
    if (match3) {
      return match3[1];
    }
    
    // Fallback: use the whole ID
    return svgElementId;
  },

  /**
   * Find a specific node element by Mermaid node ID
   */
  findNodeElement(svgElement: SVGElement, nodeId: string): SVGGElement | null {
    const nodes = this.parseNodes(svgElement);
    const node = nodes.find(n => n.id === nodeId);
    console.log('[SVG Parser] Finding node:', nodeId, 'Found:', !!node);
    return node?.element || null;
  },

  /**
   * Inject a badge (small blue circle) into a node element
   * Badge appears at top-right corner of the node
   */
  injectBadge(nodeElement: SVGGElement, onClick: () => void): void {
    console.log('[SVG Parser] Injecting badge into node:', nodeElement.id);
    
    // Remove existing badge if any
    const existingBadge = nodeElement.querySelector('.node-link-badge');
    if (existingBadge) {
      existingBadge.remove();
    }

    // Get the bounding box of the node (in local coordinates)
    const bbox = nodeElement.getBBox();
    
    // Create badge group
    // Position badge at top-right corner relative to the node's bounding box
    // Since badge is appended to nodeElement, coordinates are relative to the node's coordinate system
    const badge = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    badge.setAttribute('class', 'node-link-badge');
    badge.setAttribute('transform', `translate(${bbox.x + bbox.width - 8}, ${bbox.y + 4})`);
    badge.style.cursor = 'pointer';
    
    // Create unique ID for this badge's gradient
    const uniqueId = `badge-${Math.random().toString(36).substr(2, 9)}`;
    
    // Get or create defs element in the SVG
    const svg = nodeElement.ownerSVGElement;
    let defs = svg?.querySelector('defs');
    if (!defs && svg) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svg.insertBefore(defs, svg.firstChild);
    }
    
    if (defs) {
      // Create radial gradient for 3D effect
      const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
      gradient.setAttribute('id', `${uniqueId}-gradient`);
      gradient.setAttribute('cx', '30%');
      gradient.setAttribute('cy', '30%');
      
      const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop1.setAttribute('offset', '0%');
      stop1.style.stopColor = '#60a5fa'; // Lighter blue
      
      const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop2.setAttribute('offset', '100%');
      stop2.style.stopColor = '#2563eb'; // Darker blue
      
      gradient.appendChild(stop1);
      gradient.appendChild(stop2);
      defs.appendChild(gradient);
      
      // Create SVG filter for drop shadow
      const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
      filter.setAttribute('id', `${uniqueId}-shadow`);
      filter.setAttribute('x', '-50%');
      filter.setAttribute('y', '-50%');
      filter.setAttribute('width', '200%');
      filter.setAttribute('height', '200%');
      
      const feDropShadow = document.createElementNS('http://www.w3.org/2000/svg', 'feDropShadow');
      feDropShadow.setAttribute('dx', '0');
      feDropShadow.setAttribute('dy', '1');
      feDropShadow.setAttribute('stdDeviation', '1');
      feDropShadow.setAttribute('flood-opacity', '0.3');
      
      filter.appendChild(feDropShadow);
      defs.appendChild(filter);
    }
    
    // Create blue circle with gradient and shadow
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', '6');
    // CRITICAL: Use style.fill to override Mermaid CSS, not setAttribute('fill')
    circle.style.fill = `url(#${uniqueId}-gradient)`;
    circle.setAttribute('filter', `url(#${uniqueId}-shadow)`);
    circle.style.opacity = '1';
    circle.style.stroke = 'none';
    circle.style.pointerEvents = 'all'; // Ensure it receives pointer events
    
    // Add hover effect
    badge.addEventListener('mouseenter', () => {
      circle.setAttribute('r', '7');
    });
    
    badge.addEventListener('mouseleave', () => {
      circle.setAttribute('r', '6');
    });
    
    // Add click handler on badge group - use mouseup for better compatibility
    badge.addEventListener('mouseup', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onClick();
    });
    
    // Also add click handler directly on circle
    circle.addEventListener('mouseup', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onClick();
    });
    
    badge.appendChild(circle);
    nodeElement.appendChild(badge);
  },

  /**
   * Attach a double-click handler to a node element
   */
  attachDoubleClickHandler(nodeElement: SVGGElement, handler: () => void): void {
    console.log('[SVG Parser] Attaching double-click handler to:', nodeElement.id);
    
    // Store handler reference for potential cleanup
    const dblClickHandler = (e: Event) => {
      console.log('[SVG Parser] Double-click detected!');
      e.stopPropagation();
      e.preventDefault();
      handler();
    };
    
    // Remove existing double-click listeners by setting a data attribute
    if (nodeElement.dataset.hasDoubleClick === 'true') {
      return;
    }
    
    nodeElement.addEventListener('dblclick', dblClickHandler);
    nodeElement.dataset.hasDoubleClick = 'true';
    
    // Make it visually clear it's clickable
    nodeElement.style.cursor = 'pointer';
    
    // Add hover effect to highlight the node
    // Find the shape element (rect, circle, polygon, etc.) within the node
    const shapeElement = nodeElement.querySelector('rect, circle, polygon, path, ellipse');
    
    if (shapeElement) {
      // Store original fill color
      const originalFill = window.getComputedStyle(shapeElement).fill;
      
      nodeElement.addEventListener('mouseenter', () => {
        // Apply a light blue tint on hover
        (shapeElement as SVGElement).style.fill = '#3b82f620'; // Blue with 12% opacity
        (shapeElement as SVGElement).style.transition = 'fill 0.2s ease';
      });
      
      nodeElement.addEventListener('mouseleave', () => {
        // Restore original fill
        (shapeElement as SVGElement).style.fill = '';
      });
    }
  },

  /**
   * Inject a green code-link badge into a node element.
   * Offset 16px below the blue node-link badge position.
   */
  injectCodeBadge(nodeElement: SVGGElement, onClick: () => void): void {
    // Remove existing code badge if any
    const existingBadge = nodeElement.querySelector('.code-link-badge');
    if (existingBadge) {
      existingBadge.remove();
    }

    const bbox = nodeElement.getBBox();

    // Check if there is already a node-link badge — offset further down if so
    const hasNodeLinkBadge = !!nodeElement.querySelector('.node-link-badge');
    const yOffset = hasNodeLinkBadge ? 20 : 4;

    const badge = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    badge.setAttribute('class', 'code-link-badge');
    badge.setAttribute('transform', `translate(${bbox.x + bbox.width - 8}, ${bbox.y + yOffset})`);
    badge.style.cursor = 'pointer';

    const uniqueId = `cbadge-${Math.random().toString(36).substr(2, 9)}`;

    const svg = nodeElement.ownerSVGElement;
    let defs = svg?.querySelector('defs');
    if (!defs && svg) {
      defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      svg.insertBefore(defs, svg.firstChild);
    }

    if (defs) {
      const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
      gradient.setAttribute('id', `${uniqueId}-gradient`);
      gradient.setAttribute('cx', '30%');
      gradient.setAttribute('cy', '30%');

      const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop1.setAttribute('offset', '0%');
      stop1.style.stopColor = '#4ade80'; // Light green

      const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
      stop2.setAttribute('offset', '100%');
      stop2.style.stopColor = '#16a34a'; // Dark green

      gradient.appendChild(stop1);
      gradient.appendChild(stop2);
      defs.appendChild(gradient);

      const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
      filter.setAttribute('id', `${uniqueId}-shadow`);
      filter.setAttribute('x', '-50%');
      filter.setAttribute('y', '-50%');
      filter.setAttribute('width', '200%');
      filter.setAttribute('height', '200%');

      const feDropShadow = document.createElementNS('http://www.w3.org/2000/svg', 'feDropShadow');
      feDropShadow.setAttribute('dx', '0');
      feDropShadow.setAttribute('dy', '1');
      feDropShadow.setAttribute('stdDeviation', '1');
      feDropShadow.setAttribute('flood-opacity', '0.3');

      filter.appendChild(feDropShadow);
      defs.appendChild(filter);
    }

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', '6');
    circle.style.fill = `url(#${uniqueId}-gradient)`;
    circle.setAttribute('filter', `url(#${uniqueId}-shadow)`);
    circle.style.opacity = '1';
    circle.style.stroke = 'none';
    circle.style.pointerEvents = 'all';

    badge.addEventListener('mouseenter', () => circle.setAttribute('r', '7'));
    badge.addEventListener('mouseleave', () => circle.setAttribute('r', '6'));

    badge.addEventListener('mouseup', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onClick();
    });

    circle.addEventListener('mouseup', (e) => {
      e.stopPropagation();
      e.preventDefault();
      onClick();
    });

    badge.appendChild(circle);
    nodeElement.appendChild(badge);
  },

  /**
   * Remove all code-link badges from an SVG element
   */
  removeAllCodeBadges(svgElement: SVGElement): void {
    const badges = svgElement.querySelectorAll('.code-link-badge');
    badges.forEach(badge => badge.remove());

    const defs = svgElement.querySelector('defs');
    if (defs) {
      const cbadgeDefs = defs.querySelectorAll('[id^="cbadge-"]');
      cbadgeDefs.forEach(def => def.remove());
    }
  },

  /**
   * Remove all badges from an SVG element
   */
  removeAllBadges(svgElement: SVGElement): void {
    // Remove badge elements
    const badges = svgElement.querySelectorAll('.node-link-badge');
    badges.forEach(badge => badge.remove());

    // Also remove code badges
    this.removeAllCodeBadges(svgElement);

    // Clean up badge-related definitions (gradients and filters)
    const defs = svgElement.querySelector('defs');
    if (defs) {
      // Remove all elements with IDs starting with 'badge-' or 'cbadge-'
      const badgeDefs = defs.querySelectorAll('[id^="badge-"], [id^="cbadge-"]');
      badgeDefs.forEach(def => def.remove());
    }
  }
};
