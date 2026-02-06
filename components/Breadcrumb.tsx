import React from 'react';
import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbItem {
  id: string;
  name: string;
}

interface BreadcrumbProps {
  path: BreadcrumbItem[];
  onNavigate: (index: number) => void;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ path, onNavigate }) => {
  if (path.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-dark-900/50 border-b border-gray-700 text-sm overflow-x-auto">
      <button
        onClick={() => onNavigate(0)}
        className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-gray-700 transition-colors text-gray-400 hover:text-white shrink-0"
        title="Return to root"
      >
        <Home className="w-3.5 h-3.5" />
      </button>
      
      {path.map((item, index) => (
        <React.Fragment key={item.id}>
          <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" />
          <button
            onClick={() => onNavigate(index)}
            className={`px-2 py-1 rounded transition-colors truncate max-w-[200px] ${
              index === path.length - 1
                ? 'text-brand-400 font-semibold cursor-default'
                : 'text-gray-300 hover:bg-gray-700 hover:text-white'
            }`}
            disabled={index === path.length - 1}
            title={item.name}
          >
            {item.name}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};
