import React, { useState, useEffect, useCallback } from 'react';
import { ChevronRight, ChevronDown, File, Folder, Loader2 } from 'lucide-react';
import { fileSystemService, FileEntry } from '../services/fileSystemService';

interface FileBrowserProps {
  repoId: string;
  onSelectFile: (filePath: string) => void;
}

interface TreeNode {
  entry: FileEntry;
  children: TreeNode[] | null;  // null = not loaded yet
  isLoading: boolean;
  isExpanded: boolean;
}

export const FileBrowser: React.FC<FileBrowserProps> = ({ repoId, onSelectFile }) => {
  const [roots, setRoots] = useState<TreeNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEntries = useCallback(async (path: string): Promise<FileEntry[]> => {
    const handle = fileSystemService.getHandle(repoId);
    if (!handle) throw new Error('Repository not connected');
    return fileSystemService.listDirectory(handle, path);
  }, [repoId]);

  // Load root entries
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    loadEntries('')
      .then(entries => {
        if (cancelled) return;
        setRoots(entries.map(e => ({
          entry: e,
          children: e.kind === 'directory' ? null : [],
          isLoading: false,
          isExpanded: false,
        })));
      })
      .catch(e => {
        if (cancelled) return;
        setError(e.message || 'Failed to load directory');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [loadEntries]);

  const toggleExpand = async (nodes: TreeNode[], path: string[]): Promise<TreeNode[]> => {
    return Promise.all(
      nodes.map(async (node) => {
        if (node.entry.path === path[0]) {
          if (path.length === 1) {
            // This is the node to toggle
            if (node.isExpanded) {
              return { ...node, isExpanded: false };
            }
            // Expand — load children if needed
            if (node.children === null) {
              try {
                const entries = await loadEntries(node.entry.path);
                return {
                  ...node,
                  isExpanded: true,
                  isLoading: false,
                  children: entries.map(e => ({
                    entry: e,
                    children: e.kind === 'directory' ? null : [],
                    isLoading: false,
                    isExpanded: false,
                  })),
                };
              } catch {
                return { ...node, isExpanded: true, children: [], isLoading: false };
              }
            }
            return { ...node, isExpanded: true };
          }
          // Recurse deeper
          if (node.children) {
            const newChildren = await toggleExpand(node.children, path.slice(1));
            return { ...node, children: newChildren };
          }
        }
        return node;
      })
    );
  };

  const handleToggle = async (entryPath: string) => {
    // entryPath is like "src/components" — split to find node in tree
    setRoots(prev => {
      // Fire-and-forget async update
      toggleExpand(prev, [entryPath]).then(setRoots);
      // Mark loading immediately
      return prev.map(n =>
        n.entry.path === entryPath && !n.isExpanded && n.children === null
          ? { ...n, isLoading: true }
          : n
      );
    });
  };

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isDir = node.entry.kind === 'directory';

    return (
      <div key={node.entry.path}>
        <div
          onClick={() => {
            if (isDir) {
              handleToggle(node.entry.path);
            } else {
              onSelectFile(node.entry.path);
            }
          }}
          className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-sm transition-colors
            ${isDir ? 'text-gray-300 hover:bg-dark-700' : 'text-gray-400 hover:bg-dark-700 hover:text-gray-200'}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
        >
          {isDir ? (
            node.isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-500" />
            ) : node.isExpanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
            )
          ) : (
            <span className="w-3.5" />
          )}
          {isDir ? (
            <Folder className="w-3.5 h-3.5 text-brand-500/70" />
          ) : (
            <File className="w-3.5 h-3.5 text-gray-500" />
          )}
          <span className="truncate">{node.entry.name}</span>
        </div>

        {isDir && node.isExpanded && node.children && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading files...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-400 py-4 text-center">{error}</div>
    );
  }

  return (
    <div className="max-h-64 overflow-y-auto border border-gray-700 rounded-lg bg-dark-800 py-1">
      {roots.map(node => renderNode(node))}
    </div>
  );
};
