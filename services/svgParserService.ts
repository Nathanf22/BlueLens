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
    
    console.log('[SVG Parser] Found', nodeElements.length, 'node elements');
    
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
          console.log('[SVG Parser] Found label in nodeLabel:', label);
        }
      }
      
      // Fallback: try direct text element (older Mermaid versions)
      if (!label) {
        const textElement = element.querySelector('text');
        if (textElement) {
          label = textElement.textContent?.trim() || '';
          console.log('[SVG Parser] Found label in text element:', label);
        }
      }
      
      console.log(`[SVG Parser] Node ${index}:`, {
        svgElementId: id,
        extractedId: nodeId,
        label: label
      });
      
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
    
    console.log('[SVG Parser] Parsed nodes:', nodes.map(n => ({ id: n.id, label: n.label })));
    
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
      console.log('[SVG Parser] Matched pattern 1:', match1[1]);
      return match1[1];
    }
    
    // Pattern 2: "node-A" -> "A"
    const match2 = svgElementId.match(/node-(.+)/);
    if (match2) {
      console.log('[SVG Parser] Matched pattern 2:', match2[1]);
      return match2[1];
    }
    
    // Pattern 3: Try graph-div-A-123 format
    const match3 = svgElementId.match(/-([A-Z])-\d+$/);
    if (match3) {
      console.log('[SVG Parser] Matched pattern 3:', match3[1]);
      return match3[1];
    }
    
    // Fallback: use the whole ID
    console.log('[SVG Parser] No pattern matched, using full ID');
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

    // Get the bounding box of the node
    const bbox = nodeElement.getBBox();
    
    // Create badge group
    const badge = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    badge.setAttribute('class', 'node-link-badge');
    badge.setAttribute('transform', `translate(${bbox.x + bbox.width - 8}, ${bbox.y + 4})`);
    badge.style.cursor = 'pointer';
    
    // Create blue circle
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', '6');
    circle.setAttribute('fill', '#3b82f6');
    circle.setAttribute('opacity', '0.8');
    circle.setAttribute('stroke', 'white');
    circle.setAttribute('stroke-width', '1.5');
    circle.style.pointerEvents = 'all'; // Ensure it receives pointer events
    
    // Add hover effect
    badge.addEventListener('mouseenter', () => {
      console.log('[SVG Parser] Badge mouseenter');
      circle.setAttribute('r', '7');
      circle.setAttribute('opacity', '1');
    });
    
    badge.addEventListener('mouseleave', () => {
      console.log('[SVG Parser] Badge mouseleave');
      circle.setAttribute('r', '6');
      circle.setAttribute('opacity', '0.8');
    });
    
    // Add click handler on badge group - use mouseup for better compatibility
    badge.addEventListener('mouseup', (e) => {
      console.log('[SVG Parser] Badge mouseup!');
      e.stopPropagation();
      e.preventDefault();
      onClick();
    });
    
    // Also add click handler directly on circle
    circle.addEventListener('mouseup', (e) => {
      console.log('[SVG Parser] Circle mouseup!');
      e.stopPropagation();
      e.preventDefault();
      onClick();
    });
    
    badge.appendChild(circle);
    nodeElement.appendChild(badge);
    
    console.log('[SVG Parser] Badge injected successfully, testing click...');
    
    // Test if the badge is actually clickable by simulating a click
    setTimeout(() => {
      console.log('[SVG Parser] Badge element:', badge);
      console.log('[SVG Parser] Badge parent:', badge.parentElement);
      console.log('[SVG Parser] Badge pointer-events:', window.getComputedStyle(badge).pointerEvents);
    }, 100);
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
      console.log('[SVG Parser] Node already has double-click handler, skipping');
      return;
    }
    
    nodeElement.addEventListener('dblclick', dblClickHandler);
    nodeElement.dataset.hasDoubleClick = 'true';
    
    // Make it visually clear it's clickable
    nodeElement.style.cursor = 'pointer';
    
    console.log('[SVG Parser] Double-click handler attached');
  },

  /**
   * Remove all badges from an SVG element
   */
  removeAllBadges(svgElement: SVGElement): void {
    const badges = svgElement.querySelectorAll('.node-link-badge');
    console.log('[SVG Parser] Removing', badges.length, 'badges');
    badges.forEach(badge => badge.remove());
  }
};
