/**
 * File System Access API wrapper for reading local repository files.
 * Chromium-only. Directory handles are in-memory (lost on page refresh).
 */

export interface FileEntry {
  name: string;
  kind: 'file' | 'directory';
  path: string;
}

// In-memory handle storage — handles can't be persisted to localStorage
const repoHandleStore = new Map<string, FileSystemDirectoryHandle>();

const IGNORED_DIRS = new Set([
  '.git', 'node_modules', '__pycache__', '.next', '.nuxt',
  'dist', 'build', '.venv', 'venv', '.tox', '.mypy_cache',
  '.pytest_cache', 'coverage', '.turbo', '.cache'
]);

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.kt': 'kotlin',
  '.rb': 'ruby',
  '.php': 'php',
  '.cs': 'csharp',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.h': 'cpp', '.hpp': 'cpp',
  '.c': 'c',
  '.swift': 'swift',
  '.dart': 'dart',
  '.json': 'json',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.sql': 'sql',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
  '.md': 'markdown',
  '.dockerfile': 'dockerfile',
};

export const fileSystemService = {
  isSupported(): boolean {
    return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  },

  async openDirectory(): Promise<{ handle: FileSystemDirectoryHandle; name: string } | null> {
    try {
      const handle = await (window as any).showDirectoryPicker({ mode: 'read' });
      return { handle, name: handle.name };
    } catch (e: any) {
      // User cancelled the picker
      if (e.name === 'AbortError') return null;
      throw e;
    }
  },

  storeHandle(repoId: string, handle: FileSystemDirectoryHandle): void {
    repoHandleStore.set(repoId, handle);
  },

  getHandle(repoId: string): FileSystemDirectoryHandle | undefined {
    return repoHandleStore.get(repoId);
  },

  removeHandle(repoId: string): void {
    repoHandleStore.delete(repoId);
  },

  hasHandle(repoId: string): boolean {
    return repoHandleStore.has(repoId);
  },

  async listDirectory(handle: FileSystemDirectoryHandle, path: string = ''): Promise<FileEntry[]> {
    let targetHandle = handle;

    // Navigate to subdirectory if path is specified
    if (path) {
      const parts = path.split('/').filter(Boolean);
      for (const part of parts) {
        targetHandle = await targetHandle.getDirectoryHandle(part);
      }
    }

    const entries: FileEntry[] = [];
    for await (const [name, entryHandle] of (targetHandle as any).entries()) {
      if (entryHandle.kind === 'directory' && IGNORED_DIRS.has(name)) continue;
      if (name.startsWith('.') && entryHandle.kind === 'directory') continue;

      entries.push({
        name,
        kind: entryHandle.kind,
        path: path ? `${path}/${name}` : name,
      });
    }

    // Sort: directories first, then alphabetically
    entries.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return entries;
  },

  async readFile(handle: FileSystemDirectoryHandle, path: string): Promise<string> {
    const parts = path.split('/').filter(Boolean);
    let dirHandle = handle;

    // Navigate to the directory containing the file
    for (let i = 0; i < parts.length - 1; i++) {
      dirHandle = await dirHandle.getDirectoryHandle(parts[i]);
    }

    const fileName = parts[parts.length - 1];
    const fileHandle = await dirHandle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return file.text();
  },

  getLanguage(filename: string): string {
    const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    return EXTENSION_LANGUAGE_MAP[ext] || 'plaintext';
  },
};
