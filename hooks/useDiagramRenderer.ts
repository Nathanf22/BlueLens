import { useState, useEffect } from 'react';
import mermaid from 'mermaid';

// Initialize mermaid once
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  fontFamily: 'Inter, sans-serif',
});

export const useDiagramRenderer = (
  code: string,
  onSuccess: () => void,
  onError: (error: string) => void
) => {
  const [svgContent, setSvgContent] = useState<string>('');

  useEffect(() => {
    let isMounted = true;

    const renderDiagram = async () => {
      if (!code.trim()) {
        setSvgContent('');
        return;
      }

      try {
        const id = `mermaid-${Date.now()}`;
        const { svg } = await mermaid.render(id, code);
        
        if (isMounted) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(svg, 'image/svg+xml');
          const svgElement = doc.documentElement;
          
          if (svgElement.tagName.toLowerCase() !== 'svg') {
             throw new Error('Rendered content is not an SVG');
          }

          const viewBox = svgElement.getAttribute('viewBox');
          if (viewBox) {
            const [, , width, height] = viewBox.split(/\s+/).map(Number);
            if (width && height) {
                svgElement.setAttribute('width', `${width}px`);
                svgElement.setAttribute('height', `${height}px`);
            }
          }

          svgElement.style.maxWidth = '';
          svgElement.style.width = '';
          svgElement.style.height = ''; 
          
          const serializer = new XMLSerializer();
          const cleanSvg = serializer.serializeToString(svgElement);

          setSvgContent(cleanSvg);
          onSuccess();
        }
      } catch (err: any) {
        if (isMounted) {
          console.error("Mermaid Render Error", err);
          const message = err.message || "Syntax error";
          onError(message);
        }
      }
    };

    renderDiagram();

    return () => {
      isMounted = false;
    };
  }, [code, onSuccess, onError]);

  return { svgContent };
};
