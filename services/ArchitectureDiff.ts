import { CodebaseAnalysis, CodebaseModule, AnalyzedFile } from '../types';

export interface DiffResult {
    added: string[];    // paths to files or modules
    removed: string[];  // paths to files or modules
    modified: string[]; // paths where metrics changed (links, file count, etc.)
}

/**
 * Compares two codebase analyses and returns the differences.
 * A is the 'new' version (HEAD), B is the 'old' version (commit-xyz).
 */
export function compareAnalysis(newAnalysis: CodebaseAnalysis, oldAnalysis: CodebaseAnalysis): DiffResult {
    const result: DiffResult = {
        added: [],
        removed: [],
        modified: [],
    };

    const oldModulesMap = new Map<string, CodebaseModule>();
    (oldAnalysis.modules || []).forEach(m => oldModulesMap.set(m.path, m));

    const newModulesMap = new Map<string, CodebaseModule>();
    (newAnalysis.modules || []).forEach(m => newModulesMap.set(m.path, m));

    // 1. Check for modules
    for (const [path, newMod] of newModulesMap) {
        if (!oldModulesMap.has(path)) {
            result.added.push(path);
        } else {
            // Module exists in both, check files
            const oldMod = oldModulesMap.get(path)!;
            compareFiles(newMod.files, oldMod.files, result);
        }
    }

    for (const [path] of oldModulesMap) {
        if (!newModulesMap.has(path)) {
            result.removed.push(path);
        }
    }

    return result;
}

function compareFiles(newFiles: AnalyzedFile[], oldFiles: AnalyzedFile[], result: DiffResult) {
    const oldFilesMap = new Map<string, AnalyzedFile>();
    (oldFiles || []).forEach(f => oldFilesMap.set(f.filePath, f));

    const newFilesMap = new Map<string, AnalyzedFile>();
    (newFiles || []).forEach(f => newFilesMap.set(f.filePath, f));

    for (const [path, newFile] of newFilesMap) {
        const oldFile = oldFilesMap.get(path);
        if (!oldFile) {
            result.added.push(path);
        } else {
            // Check if modified (symbol count changed for now)
            if ((newFile.symbols || []).length !== (oldFile.symbols || []).length ||
                (newFile.imports || []).length !== (oldFile.imports || []).length ||
                newFile.size !== oldFile.size) {
                result.modified.push(path);
            }
        }
    }

    for (const [path] of oldFilesMap) {
        if (!newFilesMap.has(path)) {
            result.removed.push(path);
        }
    }
}
