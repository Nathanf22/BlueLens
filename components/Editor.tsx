import React, { useState, useRef } from 'react';
import { Copy, Check, Download, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';

interface EditorProps {
  code: string;
  name: string;
  onCodeChange: (value: string) => void;
  onNameChange: (value: string) => void;
  error: string | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const Editor: React.FC<EditorProps> = ({ code, name, onCodeChange, onNameChange, error, isCollapsed, onToggleCollapse }) => {
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/vnd.mermaid' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name.replace(/\s+/g, '_')}.mmd`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Synchronize scrolling between textarea and line numbers
  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  // Generate line numbers array
  const lineCount = code.split('\n').length;
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  return (
    <div className={`flex flex-col h-full bg-black border-r border-gray-700 transition-all duration-300 ease-in-out ${isCollapsed ? 'w-12' : 'flex-1'}`}>
      {isCollapsed ? (
        // Collapsed view - vertical tab
        <div className="flex flex-col items-center justify-center h-full gap-4 py-8">
          <button
            onClick={onToggleCollapse}
            className="p-2 text-gray-500 hover:text-brand-400 transition-colors rounded hover:bg-dark-800"
            title="Expand editor"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="flex items-center justify-center" style={{ writingMode: 'vertical-rl' }}>
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
              {name || 'Editor'}
            </span>
          </div>
          <Pencil className="w-4 h-4 text-gray-500" />
        </div>
      ) : (
        // Expanded view - full editor
        <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-dark-800 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-2 group flex-1 mr-4">
          <Pencil className="w-3 h-3 text-gray-500 group-hover:text-brand-500 transition-colors" />
          <input 
            type="text" 
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className="bg-transparent border-none outline-none text-sm font-medium text-gray-300 focus:text-white placeholder-gray-600 w-full hover:bg-black/50 rounded px-1 -ml-1 transition-colors"
            placeholder="Diagram Name"
          />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onToggleCollapse}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-400 hover:text-brand-400 bg-black hover:bg-dark-700 border border-gray-700 hover:border-brand-500/50 rounded transition-all"
            title="Collapse editor"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Collapse</span>
          </button>
          <button 
            onClick={handleDownload}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-200 transition-colors"
            title="Download source code"
          >
            <Download className="w-3 h-3" />
            Download
          </button>
          <button 
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-200 transition-colors"
            title="Copy to clipboard"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      
      {/* Editor Area with Line Numbers */}
      <div className="flex-1 relative flex overflow-hidden">
        {/* Line Numbers Column */}
        <div 
          ref={lineNumbersRef}
          className="hidden sm:block flex-shrink-0 w-12 bg-black border-r border-gray-800 text-right text-gray-600 font-mono text-sm leading-6 py-4 pr-3 select-none overflow-hidden"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
          aria-hidden="true"
        >
          {lineNumbers.map((num) => (
            <div key={num}>{num}</div>
          ))}
        </div>

        {/* Code Input */}
        <textarea
          ref={textareaRef}
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          onScroll={handleScroll}
          className="flex-1 w-full h-full py-4 pl-3 pr-4 bg-black text-gray-300 font-mono text-sm leading-6 resize-none outline-none border-none focus:ring-0 whitespace-pre overflow-auto"
          spellCheck={false}
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
          placeholder="Enter Mermaid code here..."
        />
      </div>

      {/* Error Panel */}
      {error && (
        <div className="p-4 bg-red-900/20 border-t border-red-900/50 shrink-0">
          <p className="text-xs text-red-400 font-mono break-all">
            <span className="font-bold block mb-1">Syntax Error:</span>
            {error}
          </p>
        </div>
      )}
        </>
      )}
    </div>
  );
};