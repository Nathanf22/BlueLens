/**
 * gitService — isomorphic-git bridge for the File System Access API.
 *
 * Reads the local `.git` folder directly via a FileSystemDirectoryHandle,
 * without any server, CORS proxy, or file copy. 100% client-side.
 *
 * Architecture: We implement a minimal POSIX read-only `fs` adapter that
 * maps isomorphic-git's stat/readFile/readdir calls to File System Access
 * API traversal. Write ops (write/mkdir/unlink/…) are no-ops since we
 * only run log + read operations.
 *
 * Amélioration #2: Blob cache (immuable par définition côté Git).
 * Amélioration #4: Erreurs explicites (GitServiceError) pour les cas dégradés.
 * Amélioration #5: listFilesAtCommit via git.walk() (TREE walker).
 */

import git from 'isomorphic-git';
import type { GitCommit } from '../types';
import { CODE_EXTENSIONS } from './IFileSystemProvider';

// ---------------------------------------------------------------------------
// Custom error type (amélioration #4)
// ---------------------------------------------------------------------------

export class GitServiceError extends Error {
    constructor(
        message: string,
        public readonly cause?: unknown
    ) {
        super(message);
        this.name = 'GitServiceError';
    }
}

import { Buffer } from 'buffer';

// Ensure Buffer is available globally for isomorphic-git (amélioration #3bis)
if (typeof (globalThis as any).Buffer === 'undefined') {
    (globalThis as any).Buffer = Buffer;
}

// ---------------------------------------------------------------------------
// File System Access API → POSIX adapter
// ---------------------------------------------------------------------------

/** Navigate a FileSystemDirectoryHandle to a sub-path and return the final handle. */
async function navigateTo(
    root: FileSystemDirectoryHandle,
    parts: string[]
): Promise<FileSystemDirectoryHandle | FileSystemFileHandle | null> {
    let current: FileSystemDirectoryHandle = root;
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (!part) continue;
        try {
            if (i === parts.length - 1) {
                // Last segment: try file first, then directory
                try { return await current.getFileHandle(part); } catch { /* not a file */ }
                try { return await current.getDirectoryHandle(part); } catch { /* not a dir */ }
                return null;
            } else {
                current = await current.getDirectoryHandle(part);
            }
        } catch {
            return null;
        }
    }
    return current;
}

/**
 * Build a minimal `fs` object that isomorphic-git can use.
 * We implement the read path primarily.
 */
function buildFsAdapter(root: FileSystemDirectoryHandle) {
    const fsMethods = {
        // ── stat ─────────────────────────────────────────────────────────────────
        async stat(path: string) {
            if (!path || typeof path !== 'string') {
                console.warn(`[GitFS] stat called with invalid path:`, path);
                const err: any = new Error(`ENOENT: invalid path`);
                err.code = 'ENOENT';
                throw err;
            }

            console.debug(`[GitFS] stat: ${path}`);
            const parts = path.replace(/^\//, '').split('/').filter(Boolean);
            const handle = parts.length === 0 ? root : await navigateTo(root, parts);
            if (!handle) {
                // This is a common case, debug level is appropriate
                console.debug(`[GitFS] stat ENOENT: ${path}`);
                const err: any = new Error(`ENOENT: no such file or directory, stat '${path}'`);
                err.code = 'ENOENT';
                throw err;
            }

            const isDir = handle.kind === 'directory';
            let size = 0;
            let mtime = 0;

            if (!isDir) {
                try {
                    const file = await (handle as FileSystemFileHandle).getFile();
                    size = file.size;
                    mtime = file.lastModified;
                } catch { /* ignore */ }
            }

            const result = {
                dev: 1,
                ino: 1,
                mode: isDir ? 0o40755 : 0o100644,
                nlink: 1,
                uid: 1,
                gid: 1,
                rdev: 0,
                size,
                blksize: 4096,
                blocks: Math.ceil(size / 4096),
                atimeMs: mtime,
                mtimeMs: mtime,
                ctimeMs: mtime,
                birthtimeMs: mtime,
                atime: new Date(mtime),
                mtime: new Date(mtime),
                ctime: new Date(mtime),
                birthtime: new Date(mtime),
                isDirectory: () => isDir,
                isFile: () => !isDir,
                isSymbolicLink: () => false,
                isFIFO: () => false,
                isSocket: () => false,
                isCharacterDevice: () => false,
                isBlockDevice: () => false,
            };
            // console.debug(`[GitFS] stat result for ${path}:`, isDir ? 'DIR' : 'FILE', size);
            return result;
        },

        // ── lstat ─────────────────────────────────────────────────────────────
        lstat(path: string) {
            return this.stat(path);
        },

        // ── readFile ──────────────────────────────────────────────────────────
        async readFile(path: string, options?: { encoding?: string } | string): Promise<Uint8Array | string> {
            if (!path || typeof path !== 'string') {
                console.warn(`[GitFS] readFile called with invalid path:`, path);
                const err: any = new Error(`ENOENT: invalid path`);
                err.code = 'ENOENT';
                throw err;
            }

            console.debug(`[GitFS] readFile: ${path}`, options);
            const parts = path.replace(/^\//, '').split('/').filter(Boolean);
            const handle = await navigateTo(root, parts);
            if (!handle || handle.kind !== 'file') {
                console.debug(`[GitFS] readFile ENOENT: ${path}`);
                const err: any = new Error(`ENOENT: no such file or directory, open '${path}'`);
                err.code = 'ENOENT';
                throw err;
            }

            const file = await (handle as FileSystemFileHandle).getFile();
            const encoding = typeof options === 'string' ? options : options?.encoding;

            if (encoding === 'utf8' || encoding === 'utf-8') {
                const text = await file.text();
                console.debug(`[GitFS] readFile result (text): ${path}, length: ${text.length}`);
                return text;
            }

            const arrayBuffer = await file.arrayBuffer();
            const data = (globalThis as any).Buffer.from(arrayBuffer);
            console.debug(`[GitFS] readFile result (Buffer): ${path}, size: ${data.length}`);

            if (!data) {
                console.error(`[GitFS] readFile CRITICAL: returned null for ${path}`);
            }
            return data;
        },

        // ── readdir ──────────────────────────────────────────────────────────
        async readdir(path: string): Promise<string[]> {
            if (!path || typeof path !== 'string') {
                console.warn(`[GitFS] readdir called with invalid path:`, path);
                const err: any = new Error(`ENOENT: invalid path`);
                err.code = 'ENOENT';
                throw err;
            }

            console.debug(`[GitFS] readdir: ${path}`);
            const parts = path.replace(/^\//, '').split('/').filter(Boolean);
            let dir: FileSystemDirectoryHandle;
            if (parts.length === 0) {
                dir = root;
            } else {
                const handle = await navigateTo(root, parts);
                if (!handle || handle.kind !== 'directory') {
                    console.debug(`[GitFS] readdir ENOTDIR: ${path}`);
                    const err: any = new Error(`ENOTDIR: not a directory, readdir '${path}'`);
                    err.code = 'ENOTDIR';
                    throw err;
                }
                dir = handle as FileSystemDirectoryHandle;
            }

            const names: string[] = [];
            // Most compatible way to list keys
            try {
                for await (const name of (dir as any).keys()) {
                    names.push(name);
                }
            } catch {
                const iter = (dir as any).keys();
                while (true) {
                    const { value, done } = await iter.next();
                    if (done) break;
                    names.push(value);
                }
            }
            console.debug(`[GitFS] readdir result for ${path}:`, names.length, 'entries');
            return names;
        },

        // ── readlink ──────────────────────────────────────────────────────────
        async readlink(path: string): Promise<string> {
            console.debug(`[GitFS] readlink: ${path}`);
            const err: any = new Error(`EINVAL: invalid argument, readlink '${path}'`);
            err.code = 'EINVAL';
            throw err;
        },

        // ── write ops (no-ops) ────────────────────────────────────────────────
        async writeFile(path: string): Promise<void> { console.debug(`[GitFS] writeFile (no-op): ${path}`); },
        async mkdir(path: string): Promise<void> { console.debug(`[GitFS] mkdir (no-op): ${path}`); },
        async rmdir(path: string): Promise<void> { console.debug(`[GitFS] rmdir (no-op): ${path}`); },
        async unlink(path: string): Promise<void> { console.debug(`[GitFS] unlink (no-op): ${path}`); },
        async rename(from: string, to: string): Promise<void> { console.debug(`[GitFS] rename (no-op): ${from} -> ${to}`); },
        async chmod(path: string): Promise<void> { console.debug(`[GitFS] chmod (no-op): ${path}`); },
        async symlink(target: string, path: string): Promise<void> { console.debug(`[GitFS] symlink (no-op): ${target} -> ${path}`); },
    };

    // isomorphic-git looks for fs.promises or methods directly on fs
    const fs: any = {
        ...fsMethods,
        promises: fsMethods
    };
    return fs;
}

// ---------------------------------------------------------------------------
// Blob cache (amélioration #2) — SHA→content, immuable par définition Git
// ---------------------------------------------------------------------------

const blobCache = new Map<string, string>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verify that the directory handle points to a Git repository.
 * Throws GitServiceError with an explicit message if not (amélioration #4).
 */
async function assertIsGitRepo(handle: FileSystemDirectoryHandle): Promise<void> {
    try {
        const gitDir = await handle.getDirectoryHandle('.git');
        await gitDir.getFileHandle('HEAD');
    } catch {
        throw new GitServiceError(
            'Ce dossier n\'est pas un dépôt Git valide (.git/HEAD introuvable). ' +
            'Ouvrez un dossier contenant un historique Git.'
        );
    }
}

export const gitService = {
    /**
     * Diagnostic tool to verify that the .git folder and its contents are accessible.
     */
    async diagnose(handle: FileSystemDirectoryHandle): Promise<void> {
        console.group('[GitService] Diagnosis');
        try {
            const gitDir = await handle.getDirectoryHandle('.git');
            console.log('✅ Found .git folder');

            const heads = ['HEAD', 'config', 'description'];
            for (const h of heads) {
                try {
                    const f = await gitDir.getFileHandle(h);
                    const file = await f.getFile();
                    console.log(`✅ ${h}: Found, size ${file.size} bytes`);
                } catch {
                    console.warn(`❌ ${h}: Not found`);
                }
            }

            try {
                const refs = await gitDir.getDirectoryHandle('refs');
                console.log('✅ refs: Found');
            } catch {
                console.warn('❌ refs: Not found');
            }

            try {
                const objects = await gitDir.getDirectoryHandle('objects');
                const hasPack = await objects.getDirectoryHandle('pack').catch(() => null);
                console.log(`✅ objects: Found${hasPack ? ' (with pack folder)' : ''}`);
            } catch {
                console.warn('❌ objects: Not found');
            }

        } catch (err: any) {
            console.error('❌ Critical failure accessing .git:', err);
        }
        console.groupEnd();
    },

    /**
     * List the last `maxCount` commits on the current branch (HEAD).
     *
     * @throws GitServiceError if the directory is not a git repo or has no commits.
     */
    async listCommits(
        handle: FileSystemDirectoryHandle,
        maxCount = 50
    ): Promise<GitCommit[]> {
        await this.diagnose(handle);
        await assertIsGitRepo(handle);

        const fs = buildFsAdapter(handle);
        const dir = '/';

        let commits;
        try {
            commits = await git.log({ fs, dir, depth: maxCount });
        } catch (err: any) {
            console.error('[GitService] log error:', err);
            // isomorphic-git throws when HEAD points to an unborn branch (empty repo)
            if (err?.code === 'NotFoundError' || err?.message?.includes('Could not find')) {
                throw new GitServiceError(
                    'Aucun commit trouvé. Le dépôt est peut-être vide ou est un shallow clone.',
                    err
                );
            }
            throw new GitServiceError(`Impossible de lire l'historique Git : ${err?.message}`, err);
        }

        if (!commits || !Array.isArray(commits)) {
            return [];
        }

        return commits.map(c => {
            if (!c || !c.commit) return null as any;
            return {
                sha: c.oid || 'unknown',
                message: (c.commit.message || '').trim(),
                author: c.commit.author?.name || 'Unknown',
                email: c.commit.author?.email || '',
                // isomorphic-git returns seconds, we convert to ms
                timestamp: (c.commit.author?.timestamp || 0) * 1000,
            };
        }).filter(Boolean);
    },

    /**
     * Read the text content of a file as it existed at a given commit SHA.
     * Results are cached (SHA + path → content) since git objects are immutable.
     *
     * @throws GitServiceError if the file does not exist at that commit.
     */
    async readFileAtCommit(
        handle: FileSystemDirectoryHandle,
        commitSha: string,
        filePath: string
    ): Promise<string> {
        const cacheKey = `${commitSha}:${filePath}`;
        if (blobCache.has(cacheKey)) {
            return blobCache.get(cacheKey)!;
        }

        const fs = buildFsAdapter(handle);
        const dir = '/';

        let content: string;
        try {
            const { blob } = await git.readBlob({
                fs,
                dir,
                oid: commitSha,
                filepath: filePath,
            });
            content = new TextDecoder('utf-8', { fatal: false }).decode(blob);
        } catch (err: any) {
            throw new GitServiceError(
                `Impossible de lire le fichier "${filePath}" au commit ${commitSha.slice(0, 7)} : ${err?.message}`,
                err
            );
        }

        blobCache.set(cacheKey, content);
        return content;
    },

    /**
     * List all file paths (code files only) that existed at a given commit SHA.
     * Uses git.walk() with the TREE walker — no checkout needed (amélioration #5).
     *
     * @throws GitServiceError if the commit SHA is not found.
     */
    async listFilesAtCommit(
        handle: FileSystemDirectoryHandle,
        commitSha: string
    ): Promise<string[]> {
        const fs = buildFsAdapter(handle);
        const dir = '/';

        let allPaths: string[];
        try {
            // Use listFiles instead of walk for better reliability with tree traversal
            allPaths = await git.listFiles({
                fs,
                dir,
                ref: commitSha,
            });
        } catch (err: any) {
            throw new GitServiceError(
                `Impossible de lister les fichiers au commit ${commitSha.slice(0, 7)} : ${err?.message}`,
                err
            );
        }

        console.log(`[GitService] Files found: ${(allPaths || []).length}`);

        return (allPaths || []).filter(p => {
            if (!p) return false;
            const ext = p.substring(p.lastIndexOf('.')).toLowerCase();
            return CODE_EXTENSIONS.has(ext);
        });
    },

    /**
     * DEBUG: Extract all code files from a specific commit into a `_debug_dump_<sha>` folder
     * at the root of the repository. Useful to verify file contents and structure.
     */
    async debugDumpCommit(
        handle: FileSystemDirectoryHandle,
        commitSha: string
    ): Promise<string> {
        const files = await this.listFilesAtCommit(handle, commitSha);
        console.log(`[GitService] Dumping ${files.length} files for commit ${commitSha}...`);

        const folderName = `_debug_dump_${commitSha.slice(0, 7)}`;
        const rootDumpHandle = await handle.getDirectoryHandle(folderName, { create: true });

        for (const filePath of files) {
            const content = await this.readFileAtCommit(handle, commitSha, filePath);
            
            // Create subdirectories
            const parts = filePath.split('/');
            const fileName = parts.pop();
            if (!fileName) continue;

            let currentDir = rootDumpHandle;
            for (const part of parts) {
                if (part === '.' || part === '') continue;
                currentDir = await currentDir.getDirectoryHandle(part, { create: true });
            }

            // Write file
            const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
            // @ts-ignore - createWritable exists in Chromium-based browsers
            const writable = await (fileHandle as any).createWritable();
            await writable.write(content);
            await writable.close();
        }

        return `Dumped ${files.length} files to /${folderName}`;
    },
};
