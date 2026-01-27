import React from 'react';
import { Plus, Trash2, FileText, Layout } from 'lucide-react';
import { Diagram } from '../types';

interface SidebarProps {
  diagrams: Diagram[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  diagrams, 
  activeId, 
  onSelect, 
  onCreate, 
  onDelete 
}) => {
  return (
    <div className="w-64 bg-dark-900 flex flex-col border-r border-gray-800 h-full flex-shrink-0">
      <div className="p-4 border-b border-gray-800 flex items-center gap-2">
        <div className="w-6 h-6 rounded bg-brand-600 flex items-center justify-center">
          <Layout className="w-4 h-4 text-white" />
        </div>
        <span className="font-bold text-gray-200">Explorer</span>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        <div className="px-3 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Diagrams
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
                onClick={(e) => onDelete(diagram.id, e)}
                className={`
                  p-1 rounded hover:bg-red-900/50 hover:text-red-400 transition-opacity
                  ${activeId === diagram.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                `}
                title="Delete diagram"
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
