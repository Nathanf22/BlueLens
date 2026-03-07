/**
 * LocalFileSystemProvider — IFileSystemProvider implementation backed by the
 * File System Access API (Chromium only).
 *
 * Delegates all I/O to the existing fileSystemService, capturing the
 * FileSystemDirectoryHandle at construction time. This is a thin wrapper;
 * all hard logic stays in fileSystemService.
 */

import { IFileSystemProvider, FileProviderEntry } from './IFileSystemProvider';
import { fileSystemService } from './fileSystemService';

export class LocalFileSystemProvider implements IFileSystemProvider {
    constructor(private readonly handle: FileSystemDirectoryHandle) { }

    async listDirectory(path: string): Promise<FileProviderEntry[]> {
        // fileSystemService.listDirectory already filters ignored dirs and
        // normalises paths — we can use it directly.
        return fileSystemService.listDirectory(this.handle, path);
    }

    async readFile(path: string): Promise<string> {
        return fileSystemService.readFile(this.handle, path);
    }
}
