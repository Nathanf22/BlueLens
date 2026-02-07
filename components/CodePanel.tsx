import React, { useRef, useEffect } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { X, FileCode } from 'lucide-react';
import { CodeFile } from '../types';

interface CodePanelProps {
  codeFile: CodeFile;
  onClose: () => void;
}

export const CodePanel: React.FC<CodePanelProps> = ({ codeFile, onClose }) => {
  const editorRef = useRef<any>(null);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
    highlightRange(editor);
  };

  const highlightRange = (editor: any) => {
    if (!codeFile.lineStart) return;

    const startLine = codeFile.lineStart;
    const endLine = codeFile.lineEnd || codeFile.lineStart;

    // Scroll to the line range
    editor.revealLineInCenter(startLine);

    // Highlight the line range
    editor.deltaDecorations([], [
      {
        range: {
          startLineNumber: startLine,
          startColumn: 1,
          endLineNumber: endLine,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          className: 'code-highlight-line',
          glyphMarginClassName: 'code-highlight-glyph',
        },
      },
    ]);
  };

  // Update highlight when codeFile changes
  useEffect(() => {
    if (editorRef.current) {
      highlightRange(editorRef.current);
    }
  }, [codeFile.lineStart, codeFile.lineEnd]);

  const lineInfo = codeFile.lineStart
    ? codeFile.lineEnd
      ? `L${codeFile.lineStart}-${codeFile.lineEnd}`
      : `L${codeFile.lineStart}`
    : '';

  return (
    <div className="flex flex-col h-full border-l border-gray-700 bg-dark-900">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 bg-dark-800 min-h-[40px]">
        <div className="flex items-center gap-2 min-w-0">
          <FileCode className="w-4 h-4 text-green-400 flex-shrink-0" />
          <span className="text-xs text-gray-300 truncate">{codeFile.filePath}</span>
          {lineInfo && (
            <span className="text-xs text-gray-500 flex-shrink-0">{lineInfo}</span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-dark-700 text-gray-400 hover:text-gray-200 transition-colors flex-shrink-0"
          title="Close code panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          language={codeFile.language}
          value={codeFile.content}
          theme="vs-dark"
          onMount={handleEditorMount}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            renderLineHighlight: 'none',
            fontSize: 13,
            padding: { top: 8 },
            domReadOnly: true,
          }}
        />
      </div>

      {/* Inline style for highlights */}
      <style>{`
        .code-highlight-line {
          background-color: rgba(34, 197, 94, 0.1) !important;
          border-left: 3px solid #22c55e !important;
        }
        .code-highlight-glyph {
          background-color: #22c55e;
          width: 3px !important;
          margin-left: 3px;
        }
      `}</style>
    </div>
  );
};
