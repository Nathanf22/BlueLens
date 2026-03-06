/**
 * useGitHistory — React hook to load and expose a repo's Git commit history.
 *
 * Features:
 *  - Loads the last `maxCount` commits via gitService.listCommits()
 *  - Provides an analyzeAtCommit() helper that runs codebaseAnalyzerService
 *    with a GitFileSystemProvider, with a per-SHA result cache (amélioration #6)
 *  - Surfaces explicit, user-readable errors from GitServiceError
 */

import { useState, useRef, useCallback } from 'react';
import { GitCommit, CodebaseAnalysis } from '../types';
import { fileSystemService } from '../services/fileSystemService';
import { gitService, GitServiceError } from '../services/gitService';
import { GitFileSystemProvider } from '../services/GitFileSystemProvider';
import { codebaseAnalyzerService } from '../services/codebaseAnalyzerService';

interface UseGitHistoryReturn {
    /** The list of commits, most recent first. Empty until loaded. */
    commits: GitCommit[];
    /** True while listCommits() or analyzeAtCommit() is running. */
    loading: boolean;
    /** User-readable error message, or null if no error. */
    error: string | null;
    /** Load (or reload) commits for a given repo. */
    loadCommits: (repoId: string) => Promise<void>;
    /**
     * Analyze the codebase at a given commit SHA.
     * Results are cached per SHA — repeated calls are instant.
     */
    analyzeAtCommit: (repoId: string, sha: string) => Promise<CodebaseAnalysis | null>;
    /** Clear error state. */
    clearError: () => void;
}

export function useGitHistory(maxCount = 30): UseGitHistoryReturn {
    const [commits, setCommits] = useState<GitCommit[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Amélioration #6: per-SHA analysis cache so navigating back to a commit is instant
    const analysisCache = useRef(new Map<string, CodebaseAnalysis>());

    const loadCommits = useCallback(async (repoId: string) => {
        const handle = fileSystemService.getHandle(repoId);
        if (!handle) {
            setError('Repo disconnected. Please re-open the directory first.');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            const result = await gitService.listCommits(handle, maxCount);
            setCommits(result);
        } catch (err: any) {
            const message = err instanceof GitServiceError
                ? err.message
                : `Unexpected error: ${err?.message ?? String(err)}`;
            setError(message);
            setCommits([]);
        } finally {
            setLoading(false);
        }
    }, [maxCount]);

    const analyzeAtCommit = useCallback(async (
        repoId: string,
        sha: string
    ): Promise<CodebaseAnalysis | null> => {
        // Cache hit (amélioration #6)
        if (analysisCache.current.has(sha)) {
            return analysisCache.current.get(sha)!;
        }

        const handle = fileSystemService.getHandle(repoId);
        if (!handle) {
            setError('Repo disconnected. Please re-open the directory first.');
            return null;
        }

        setLoading(true);
        setError(null);
        try {
            const provider = new GitFileSystemProvider(handle, sha);
            const analysis = await codebaseAnalyzerService.analyzeCodebase(provider);
            analysisCache.current.set(sha, analysis);
            return analysis;
        } catch (err: any) {
            const message = err instanceof GitServiceError
                ? err.message
                : `Analysis failed: ${err?.message ?? String(err)}`;
            setError(message);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    const clearError = useCallback(() => setError(null), []);

    return { commits, loading, error, loadCommits, analyzeAtCommit, clearError };
}
