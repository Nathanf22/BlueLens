import React from 'react';
import { Sparkles, Menu, Layout } from 'lucide-react';
import { Button } from './Button';

interface AppHeaderProps {
  onToggleSidebar: () => void;
  onOpenAIModal: () => void;
  isSidebarOpen: boolean;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  onToggleSidebar,
  onOpenAIModal,
  isSidebarOpen
}) => {
  return (
    <header className="flex items-center justify-between px-4 py-2 bg-dark-800 border-b border-gray-700 shadow-md z-20 shrink-0 h-14">
      <div className="flex items-center gap-3">
        <button 
          onClick={onToggleSidebar}
          className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white lg:hidden"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
          <Layout className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-100 to-gray-400 hidden sm:block">
          Blueprint
        </h1>
      </div>

      <div className="flex items-center gap-4">
        <Button 
          onClick={onOpenAIModal}
          icon={<Sparkles className="w-4 h-4" />}
          className="bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 border-none h-9"
        >
          Ask AI
        </Button>
      </div>
    </header>
  );
};
