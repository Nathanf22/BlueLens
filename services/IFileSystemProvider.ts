/**
 * IFileSystemProvider — Contract for all file system access in BlueLens.
 *
 * Decouples codebaseAnalyzerService from the concrete storage mechanism
 * (local File System Access API today, Git object store tomorrow).
 *
 * NOTE: getLanguage() is intentionally NOT part of this interface; it is a
 * pure filename → language mapping with no dependency on storage. It lives
 * here as a shared utility importable by all providers and consumers.
 */

export interface FileProviderEntry {
    name: string;
    kind: 'file' | 'directory';
    path: string;
}

export interface IFileSystemProvider {
    /**
     * List the immediate children (non-recursive) of a directory.
     * @param path  Relative path from the repo root, e.g. "src/utils". Use "" for root.
     */
    listDirectory(path: string): Promise<FileProviderEntry[]>;

    /**
     * Read the full text content of a file.
     * @param path  Relative path from the repo root, e.g. "src/utils/helpers.ts"
     */
    readFile(path: string): Promise<string>;
}

// ---------------------------------------------------------------------------
// Shared utility: filename → language (identical to the map in fileSystemService)
// ---------------------------------------------------------------------------

/**
 * Set of file extensions considered as "code" for analysis purposes.
 * Shared between gitService and codebaseAnalyzerService to ensure consistency.
 */
export const CODE_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.py',
    '.rs', '.go', '.java', '.kt', '.rb',
    '.php', '.cs', '.cpp', '.cc', '.c', '.h', '.hpp',
    '.swift', '.dart',
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

/**
 * Returns the programming language for a given filename.
 * This is a pure filename→string mapping with no I/O — it is shared by all
 * providers instead of being duplicated inside each implementation.
 */
export function getLanguage(filename: string): string {
    const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    return EXTENSION_LANGUAGE_MAP[ext] || 'plaintext';
}
