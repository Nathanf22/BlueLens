/**
 * GitFileSystemProvider — IFileSystemProvider backed by a specific Git commit.
 *
 * Reads files and directory structure from a historical commit SHA, using
 * gitService under the hood. Enables codebaseAnalyzerService to analyze any
 * past version of the codebase without checking it out.
 *
 * Constructor params:
 *  - handle    : FileSystemDirectoryHandle of the local repo root
 *  - commitSha : Git object SHA to read from (full 40-char or abbreviated)
 */

import { IFileSystemProvider, FileProviderEntry, getLanguage } from './IFileSystemProvider';
import { gitService } from './gitService';

export class GitFileSystemProvider implements IFileSystemProvider {
    /**
     * Cache of the flat file list for this commit.
     * We load it lazily on first listDirectory call and reuse it for all
     * subsequent directory traversals (the list is commit-specific).
     */
    private fileListCache: string[] | null = null;

    constructor(
        private readonly handle: FileSystemDirectoryHandle,
        private readonly commitSha: string
    ) { }

    /**
     * Load (and cache) the flat list of all code files at this commit.
     */
    private async getFileList(): Promise<string[]> {
        if (this.fileListCache === null) {
            this.fileListCache = await gitService.listFilesAtCommit(this.handle, this.commitSha);
        }
        return this.fileListCache;
    }

    /**
     * Simulate directory listing from the flat git tree.
     *
     * isomorphic-git's walk() gives us a flat list of all file paths.
     * We reconstruct the one-level directory view by filtering and grouping
     * paths that share the same first segment under `dirPath`.
     */
    async listDirectory(dirPath: string): Promise<FileProviderEntry[]> {
        const allFiles = await this.getFileList();
        const prefix = dirPath ? `${dirPath}/` : '';
        const seen = new Map<string, FileProviderEntry>();

        for (const filePath of allFiles) {
            if (!filePath.startsWith(prefix)) continue;
            const rest = filePath.slice(prefix.length);
            const parts = rest.split('/');

            if (parts.length === 1) {
                // Direct child file
                const name = parts[0];
                seen.set(name, { name, kind: 'file', path: filePath });
            } else {
                // Subdirectory
                const name = parts[0];
                const subDirPath = prefix + name;
                if (!seen.has(name)) {
                    seen.set(name, { name, kind: 'directory', path: subDirPath });
                }
            }
        }

        // Sort: directories first, then alphabetically
        return Array.from(seen.values()).sort((a, b) => {
            if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
    }

    async readFile(filePath: string): Promise<string> {
        return gitService.readFileAtCommit(this.handle, this.commitSha, filePath);
    }
}

// Re-export getLanguage so callers can use this module as a one-stop shop
export { getLanguage };
