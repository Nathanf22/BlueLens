import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { IFileSystemProvider, FileProviderEntry } from '../../../services/IFileSystemProvider.js';

export type { IFileSystemProvider, FileProviderEntry };
export { CODE_EXTENSIONS, getLanguage } from '../../../services/IFileSystemProvider.js';

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.svn', 'dist', 'build', 'out', '.next', '.nuxt',
  '__pycache__', '.pytest_cache', '.mypy_cache', 'venv', '.venv', 'env',
  'target', 'vendor', '.cargo', 'coverage', '.nyc_output', '.turbo',
]);

export class NodeFileSystemProvider implements IFileSystemProvider {
  constructor(private readonly rootPath: string) {}

  async listDirectory(relPath: string): Promise<FileProviderEntry[]> {
    const absPath = relPath ? join(this.rootPath, relPath) : this.rootPath;
    const entries = await readdir(absPath, { withFileTypes: true });

    return entries
      .filter(e => !e.name.startsWith('.') || e.name === '.env')
      .filter(e => !(e.isDirectory() && IGNORED_DIRS.has(e.name)))
      .map(e => ({
        name: e.name,
        kind: (e.isDirectory() ? 'directory' : 'file') as 'file' | 'directory',
        path: relPath ? `${relPath}/${e.name}` : e.name,
      }));
  }

  async readFile(relPath: string): Promise<string> {
    return readFile(join(this.rootPath, relPath), 'utf-8');
  }
}
