import React from 'react';
import { Sparkles, Menu, Layout, Settings, FolderGit2 } from 'lucide-react';
import { Button } from './Button';

interface AppHeaderProps {
  onToggleSidebar: () => void;
  onOpenAIModal: () => void;
  onOpenAISettings: () => void;
  onOpenRepoManager: () => void;
  isSidebarOpen: boolean;
  repoCount: number;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  onToggleSidebar,
  onOpenAIModal,
  onOpenAISettings,
  onOpenRepoManager,
  isSidebarOpen,
  repoCount,
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

      <div className="flex items-center gap-2">
        <button
          onClick={onOpenRepoManager}
          className="relative flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-700 hover:border-green-600 bg-dark-900 hover:bg-green-900/20 text-gray-400 hover:text-green-400 transition-colors text-sm"
          title="Manage Repositories"
        >
          <FolderGit2 className="w-4 h-4" />
          <span className="hidden sm:inline">Repositories</span>
          {repoCount > 0 ? (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-900/50 text-green-400 font-medium leading-none">
              {repoCount}
            </span>
          ) : (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-yellow-900/50 text-yellow-500 font-medium leading-none">
              0
            </span>
          )}
        </button>
        <button
          onClick={onOpenAISettings}
          className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
          title="AI Provider Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
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
