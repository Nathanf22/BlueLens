import React, { useState, useRef } from 'react';
import { Plus, Trash2, FileText, Layout, Download, Loader2, Upload } from 'lucide-react';
import { Diagram } from '../types';
import JSZip from 'jszip';

interface SidebarProps {
  diagrams: Diagram[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onImport: (diagrams: Diagram[]) => void;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

export const Sidebar: React.FC<SidebarProps> = ({ 
  diagrams, 
  activeId, 
  onSelect, 
  onCreate, 
  onDelete,
  onImport
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadAll = async () => {
    if (diagrams.length === 0) return;

    setIsProcessing(true);
    try {
      const zip = new JSZip();
      
      diagrams.forEach((diagram) => {
        // Sanitize filename: remove special chars, replace spaces with underscores
        let safeName = diagram.name.replace(/[^a-z0-9_\-\s]/gi, '').trim().replace(/\s+/g, '_');
        if (!safeName) safeName = `untitled_${diagram.id}`;
        
        zip.file(`${safeName}.mmd`, diagram.code);
      });

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `mermaid-diagrams-backup-${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Failed to zip files", error);
      alert("Failed to create backup zip.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    const newDiagrams: Diagram[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        if (file.name.endsWith('.zip')) {
          // Handle ZIP
          try {
            const zip = await JSZip.loadAsync(file);
            const promises: Promise<void>[] = [];

            zip.forEach((relativePath, zipEntry) => {
              if (!zipEntry.dir && (zipEntry.name.endsWith('.mmd') || zipEntry.name.endsWith('.txt') || zipEntry.name.endsWith('.mermaid'))) {
                const promise = zipEntry.async('string').then((content) => {
                  // Extract name from path (handle folders inside zip)
                  const fileName = zipEntry.name.split('/').pop() || zipEntry.name;
                  const name = fileName.replace(/\.(mmd|txt|mermaid)$/, '');
                  
                  newDiagrams.push({
                    id: generateId(),
                    name: name,
                    code: content,
                    comments: [],
                    lastModified: Date.now()
                  });
                });
                promises.push(promise);
              }
            });
            await Promise.all(promises);
          } catch (e) {
            console.error("Error unzipping", e);
            alert(`Could not read zip file: ${file.name}`);
          }
        } else {
          // Handle Single Text File
          const text = await file.text();
          newDiagrams.push({
            id: generateId(),
            name: file.name.replace(/\.(mmd|txt|mermaid)$/, ''),
            code: text,
            comments: [],
            lastModified: Date.now()
          });
        }
      }

      if (newDiagrams.length > 0) {
        onImport(newDiagrams);
      }
    } catch (error) {
      console.error("Import error", error);
      alert("Failed to import files.");
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = ''; // Reset input
      }
    }
  };

  return (
    <div className="w-64 bg-dark-900 flex flex-col border-r border-gray-800 h-full flex-shrink-0">
      <input 
        type="file" 
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
        multiple
        accept=".mmd,.txt,.mermaid,.zip"
      />

      <div className="p-4 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-brand-600 flex items-center justify-center">
            <Layout className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-gray-200">Explorer</span>
        </div>
        
        <div className="flex items-center gap-1">
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="p-1.5 text-gray-500 hover:text-brand-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded hover:bg-dark-800"
            title="Import diagrams (.mmd, .txt, .zip)"
          >
            <Upload className="w-4 h-4" />
          </button>
          <button 
            onClick={handleDownloadAll}
            disabled={isProcessing || diagrams.length === 0}
            className="p-1.5 text-gray-500 hover:text-brand-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded hover:bg-dark-800"
            title="Download all as ZIP"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        <div className="px-3 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider flex justify-between items-center">
          <span>Diagrams</span>
          <span className="bg-dark-800 px-1.5 py-0.5 rounded text-[10px]">{diagrams.length}</span>
        </div>
        <div className="space-y-0.5 px-2">
          {diagrams.map((diagram) => (
            <div
              key={diagram.id}
              onClick={() => onSelect(diagram.id)}
              className={`
                group flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors
                ${activeId === diagram.id 
                  ? 'bg-brand-900/30 text-brand-400' 
                  : 'text-gray-400 hover:bg-dark-800 hover:text-gray-200'}
              `}
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-4 h-4 flex-shrink-0" />
                <span className="truncate text-sm font-medium">{diagram.name}</span>
              </div>
              
              <button
                type="button"
                disabled={diagrams.length <= 1}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(diagram.id, e);
                }}
                className={`
                  p-1 rounded transition-opacity
                  ${diagrams.length <= 1 
                    ? 'opacity-0 cursor-default text-gray-700' 
                    : activeId === diagram.id 
                      ? 'opacity-100 hover:bg-red-900/50 hover:text-red-400' 
                      : 'opacity-0 group-hover:opacity-100 hover:bg-red-900/50 hover:text-red-400 text-gray-500'
                  }
                `}
                title={diagrams.length <= 1 ? "Cannot delete the last diagram" : "Delete diagram"}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="p-3 border-t border-gray-800">
        <button
          onClick={onCreate}
          className="w-full flex items-center justify-center gap-2 bg-dark-800 hover:bg-brand-900/30 text-gray-300 hover:text-brand-400 py-2 px-4 rounded-lg border border-gray-700 hover:border-brand-500/50 transition-all text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          New Diagram
        </button>
      </div>
    </div>
  );
};