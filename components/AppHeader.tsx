import React from 'react';
import { Sparkles, Menu, Settings, FolderGit2 } from 'lucide-react';

interface AppHeaderProps {
  onToggleSidebar: () => void;
  onOpenGlobalAI: () => void;
  onOpenAISettings: () => void;
  onOpenRepoManager: () => void;
  isSidebarOpen: boolean;
  repoCount: number;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  onToggleSidebar,
  onOpenGlobalAI,
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
        <svg width="32" height="32" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
          <path d="M 35 100 Q 100 50 165 100 Q 100 150 35 100 Z" stroke="url(#header-grad)" strokeWidth="3.5" fill="none"/>
          <circle cx="100" cy="100" r="40" fill="url(#header-grad)" opacity="0.2"/>
          <circle cx="100" cy="100" r="40" stroke="url(#header-grad)" strokeWidth="2.5" fill="none"/>
          <circle cx="100" cy="100" r="22" fill="url(#header-grad)"/>
          <circle cx="92" cy="92" r="7" fill="#ffffff" opacity="0.9"/>
          <line x1="60" y1="100" x2="140" y2="100" stroke="url(#header-grad)" strokeWidth="1" opacity="0.3"/>
          <line x1="100" y1="60" x2="100" y2="140" stroke="url(#header-grad)" strokeWidth="1" opacity="0.3"/>
          <defs>
            <linearGradient id="header-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity={1} />
              <stop offset="100%" stopColor="#7c3aed" stopOpacity={1} />
            </linearGradient>
          </defs>
        </svg>
        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-100 to-gray-400 hidden sm:block">
          BlueLens
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onOpenAISettings}
          className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
          title="AI Provider Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
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
          onClick={onOpenGlobalAI}
          style={{
            background: 'linear-gradient(#1e1e1e, #1e1e1e) padding-box, linear-gradient(135deg, #06b6d4, #7c3aed) border-box',
            border: '1px solid transparent',
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-150 hover:shadow-[0_0_14px_rgba(6,182,212,0.3)] hover:brightness-110"
          title="Ask AI"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-purple-400">Ask AI</span>
        </button>
      </div>
    </header>
  );
};
