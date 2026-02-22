import React from 'react';
import { Save } from 'lucide-react';

interface AppFooterProps {
  diagramCount: number;
  saveStatus: 'saved' | 'saving';
}

export const AppFooter: React.FC<AppFooterProps> = ({ diagramCount, saveStatus }) => {
  return (
    <footer className="bg-dark-900 border-t border-gray-800 px-4 py-1 text-xs text-gray-600 flex justify-between items-center shrink-0">
      <span>{diagramCount} Diagram{diagramCount !== 1 ? 's' : ''}</span>
      <div className="flex items-center gap-4">
        <span className={`flex items-center gap-1.5 transition-colors ${saveStatus === 'saving' ? 'text-brand-400' : 'text-green-500'}`}>
          <Save className="w-3 h-3" />
          {saveStatus === 'saving' ? 'Saving to browser...' : 'Saved to browser'}
        </span>
        <span className="opacity-50">|</span>
        <span>Mermaid.js v11</span>
      </div>
    </footer>
  );
};
