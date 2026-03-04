import React, { useState, useEffect, useRef } from 'react';
import mermaid from 'mermaid';

interface InlineDiagramPreviewProps {
  code: string;
}

let _globalIdCounter = 0;

export const InlineDiagramPreview: React.FC<InlineDiagramPreviewProps> = ({ code }) => {
  const [view, setView] = useState<'diagram' | 'code'>('diagram');
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const renderId = useRef(`inline-preview-${++_globalIdCounter}`);

  useEffect(() => {
    if (!code.trim()) return;
    let cancelled = false;
    setSvg('');
    setError('');

    const id = renderId.current;
    (async () => {
      try {
        const { svg: rendered } = await mermaid.render(id, code);
        if (!cancelled) setSvg(rendered);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Render error');
      }
    })();

    return () => { cancelled = true; };
  }, [code]);

  return (
    <div className="mt-2 rounded-lg border border-gray-800 overflow-hidden text-xs">
      {/* Toggle */}
      <div className="flex items-center gap-1 px-2 py-1.5 bg-gray-900/60 border-b border-gray-800">
        <button
          onClick={() => setView('diagram')}
          className={`px-2 py-0.5 rounded transition-colors ${
            view === 'diagram'
              ? 'bg-brand-600/20 text-brand-400'
              : 'text-gray-500 hover:text-gray-400'
          }`}
        >
          Preview
        </button>
        <button
          onClick={() => setView('code')}
          className={`px-2 py-0.5 rounded transition-colors ${
            view === 'code'
              ? 'bg-brand-600/20 text-brand-400'
              : 'text-gray-500 hover:text-gray-400'
          }`}
        >
          Code
        </button>
      </div>

      {/* Content */}
      {view === 'diagram' ? (
        <div className="p-3 bg-gray-950/50 overflow-auto max-h-72 flex items-start justify-center">
          {error ? (
            <span className="text-red-400">{error}</span>
          ) : svg ? (
            <div
              className="[&_svg]:max-w-full [&_svg]:h-auto"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <span className="text-gray-600">Rendering…</span>
          )}
        </div>
      ) : (
        <pre className="p-3 bg-gray-950/50 overflow-auto max-h-72 font-mono text-gray-400 whitespace-pre leading-relaxed">
          {code}
        </pre>
      )}
    </div>
  );
};
