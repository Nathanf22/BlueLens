import React from 'react';
import { ZoomIn } from 'lucide-react';

interface SubDiagramBadgeProps {
  onZoomIn: () => void;
}

export const SubDiagramBadge: React.FC<SubDiagramBadgeProps> = ({ onZoomIn }) => {
  return (
    <div className="absolute top-2 right-2 z-10">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onZoomIn();
        }}
        className="flex items-center gap-1.5 px-2 py-1 bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium rounded-full shadow-lg transition-all hover:scale-105 group"
        title="Double-click diagram or press Z to zoom in"
      >
        <ZoomIn className="w-3 h-3" />
        <span className="hidden group-hover:inline">Zoom In</span>
      </button>
    </div>
  );
};
