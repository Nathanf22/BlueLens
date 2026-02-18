/**
 * File System Access API wrapper for reading local repository files.
 * Chromium-only. Directory handles are in-memory (lost on page refresh),
 * but can be persisted to IndexedDB and reconnected via requestPermission().
 */

export interface FileEntry {
  name: string;
  kind: 'file' | 'directory';
  path: string;
}

// In-memory handle storage — handles can't be persisted to localStorage
const repoHandleStore = new Map<string, FileSystemDirectoryHandle>();

// IndexedDB helpers for persisting FileSystemDirectoryHandle across sessions
const HANDLE_DB_NAME = 'blueprint_fs_handles';
const HANDLE_STORE = 'handles';

function openHandleDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(HANDLE_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key: string): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openHandleDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(HANDLE_STORE, 'readonly').objectStore(HANDLE_STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbPut(key: string, handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    const db = await openHandleDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(HANDLE_STORE, 'readwrite').objectStore(HANDLE_STORE).put(handle, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // IndexedDB unavailable — silently skip persistence
  }
}

async function idbDelete(key: string): Promise<void> {
  try {
    const db = await openHandleDB();
    return new Promise((resolve, reject) => {
      const req = db.transaction(HANDLE_STORE, 'readwrite').objectStore(HANDLE_STORE).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Silently skip
  }
}

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
    idbDelete(repoId);
  },

  hasHandle(repoId: string): boolean {
    return repoHandleStore.has(repoId);
  },

  /** Persist a handle to IndexedDB so it can survive a page refresh. */
  async persistHandle(repoId: string, handle: FileSystemDirectoryHandle): Promise<void> {
    await idbPut(repoId, handle);
  },

  /**
   * Try to reconnect a previously-persisted repo handle without opening
   * the directory picker. Calls requestPermission() which shows a small
   * browser prompt ("Allow Blueprint to access [folder]?") instead of
   * the full directory picker.
   * Returns true if permission was granted and the handle is ready to use.
   */
  async reconnectRepo(repoId: string): Promise<{ name: string } | null> {
    const handle = await idbGet(repoId);
    if (!handle) return null;

    try {
      const permission = await (handle as any).requestPermission({ mode: 'read' });
      if (permission === 'granted') {
        repoHandleStore.set(repoId, handle);
        return { name: handle.name };
      }
    } catch {
      // requestPermission not supported or denied
    }
    return null;
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
