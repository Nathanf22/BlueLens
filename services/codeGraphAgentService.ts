/**
 * LLM Agent Pipeline for architectural grouping.
 *
 * Two-agent approach:
 *   Agent 1 (File Analyst): Batched file-level analysis — purpose + role
 *   Agent 2 (Architect): Groups files into functional modules + relationships
 *
 * Falls back to directory-based grouping when LLM is unavailable or fails.
 */

import { CodebaseAnalysis, CodebaseModule, AnalyzedFile, LLMSettings, ProgressLogCategory } from '../types';
import { llmService } from './llmService';
import { groupByFunctionalHeuristics } from './codeGraphHeuristicGrouper';

export type LogEntryFn = (category: ProgressLogCategory, message: string, detail?: string) => void;

// ── Types ────────────────────────────────────────────────────────────

export interface FileAnalysis {
  filePath: string;
  purpose: string;
  role: 'entry_point' | 'service' | 'component' | 'hook' | 'utility' | 'model' | 'config' | 'test' | 'style';
}

export interface ArchitectureBlueprint {
  modules: Array<{ name: string; description: string; files: string[] }>;
  relationships: Array<{ from: string; to: string; label: string }>;
}

const VALID_ROLES = new Set([
  'entry_point', 'service', 'component', 'hook', 'utility', 'model', 'config', 'test', 'style',
]);

const BATCH_SIZE = 10;
const MAX_RETRIES = 2;

// ── Path normalization ───────────────────────────────────────────────

/** Strip leading ./ and normalize path for comparison */
function normalizePath(p: string): string {
  return p.replace(/^\.\//, '').replace(/\/+/g, '/');
}

/**
 * Build a lookup that resolves LLM-returned paths to actual file paths.
 * Handles: exact match, with/without ./, with/without extension, basename match.
 */
function buildPathResolver(allFilePaths: Set<string>): (candidate: string) => string | null {
  // Pre-build lookup maps
  const exactMap = new Map<string, string>();      // normalized → original
  const noExtMap = new Map<string, string>();       // normalized-without-ext → original
  const basenameMap = new Map<string, string[]>();   // basename → originals

  for (const fp of allFilePaths) {
    const norm = normalizePath(fp);
    exactMap.set(norm, fp);

    const noExt = norm.replace(/\.[^/.]+$/, '');
    if (!noExtMap.has(noExt)) noExtMap.set(noExt, fp);

    const basename = fp.split('/').pop() || fp;
    if (!basenameMap.has(basename)) basenameMap.set(basename, []);
    basenameMap.get(basename)!.push(fp);
  }

  return (candidate: string): string | null => {
    const norm = normalizePath(candidate);

    // 1. Exact match (after normalization)
    if (exactMap.has(norm)) return exactMap.get(norm)!;

    // 2. Match without extension (LLM might omit .ts/.tsx)
    if (noExtMap.has(norm)) return noExtMap.get(norm)!;

    // 3. Basename match (only if unambiguous)
    const basename = candidate.split('/').pop() || candidate;
    const matches = basenameMap.get(basename);
    if (matches && matches.length === 1) return matches[0];

    return null;
  };
}

// ── JSON extraction ──────────────────────────────────────────────────

function extractJSON(text: string): string {
  // Try to extract JSON from markdown code fences first
  const fenced = text.match(/```(?:json)?\s*\n([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  // Try to find array or object
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];

  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) return objMatch[0];

  return text.trim();
}

// ── Agent 1: File Analyst ────────────────────────────────────────────

const FILE_ANALYST_SYSTEM = `You are a code analyst. For each file, determine its purpose and role.

Respond with a JSON array. Each element must have exactly these fields:
- "filePath": string (COPY the exact file path from the input — do NOT add "./" prefix or change it in any way)
- "purpose": string (1 sentence describing what this file does)
- "role": one of "entry_point", "service", "component", "hook", "utility", "model", "config", "test", "style"

You MUST return one entry per input file with the EXACT same filePath string.
Respond ONLY with the JSON array, no other text.`;

interface FileSummary {
  path: string;
  symbols: string[];
  imports: string[];
  exports: string[];
}

function buildFileAnalystPrompt(files: FileSummary[]): string {
  const entries = files.map(f => {
    const lines = [`File: ${f.path}`];
    if (f.symbols.length > 0) lines.push(`Symbols: ${f.symbols.join(', ')}`);
    if (f.imports.length > 0) lines.push(`Imports: ${f.imports.join(', ')}`);
    if (f.exports.length > 0) lines.push(`Exports: ${f.exports.join(', ')}`);
    return lines.join('\n');
  });
  return entries.join('\n\n');
}

function validateFileAnalyses(
  raw: unknown,
  expectedPaths: Set<string>,
): FileAnalysis[] | null {
  if (!Array.isArray(raw)) return null;

  const resolvePath = buildPathResolver(expectedPaths);
  const results: FileAnalysis[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const { filePath, purpose, role } = item as Record<string, unknown>;
    if (typeof filePath !== 'string') continue;

    // Resolve path flexibly
    const resolved = resolvePath(filePath);
    if (!resolved || seen.has(resolved)) continue;

    const validPurpose = typeof purpose === 'string' && purpose.length > 0
      ? purpose
      : filePath;
    const validRole = typeof role === 'string' && VALID_ROLES.has(role)
      ? role as FileAnalysis['role']
      : inferRoleFromPath(resolved);

    seen.add(resolved);
    results.push({ filePath: resolved, purpose: validPurpose, role: validRole });
  }

  // Accept if we got at least half the files
  return results.length >= Math.ceil(expectedPaths.size / 2) ? results : null;
}

async function analyzeFilesBatch(
  files: FileSummary[],
  llmSettings: LLMSettings,
  signal?: AbortSignal,
): Promise<FileAnalysis[]> {
  const expectedPaths = new Set(files.map(f => f.path));
  const prompt = buildFileAnalystPrompt(files);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const userContent = attempt === 0
        ? prompt
        : `${prompt}\n\nPrevious response was invalid JSON or had wrong schema. Please return ONLY a valid JSON array. IMPORTANT: filePath values must match the input exactly.`;

      const response = await llmService.sendMessage(
        [{ role: 'user', content: userContent }],
        FILE_ANALYST_SYSTEM,
        llmSettings,
        signal,
      );

      const jsonStr = extractJSON(response.content);
      const parsed = JSON.parse(jsonStr);
      const validated = validateFileAnalyses(parsed, expectedPaths);

      if (validated) {
        // Fill in any missing files from this batch
        const covered = new Set(validated.map(v => v.filePath));
        for (const f of files) {
          if (!covered.has(f.path)) {
            validated.push({
              filePath: f.path,
              purpose: f.path,
              role: inferRoleFromPath(f.path),
            });
          }
        }
        return validated;
      }
    } catch (err) {
      console.warn(`[CodeGraph Agent 1] Batch attempt ${attempt + 1} failed:`, err);
    }
  }

  // Fallback: generate basic analyses from file paths
  console.warn('[CodeGraph Agent 1] All retries exhausted, using path-based fallback');
  return files.map(f => ({
    filePath: f.path,
    purpose: f.path,
    role: inferRoleFromPath(f.path),
  }));
}

function inferRoleFromPath(filePath: string): FileAnalysis['role'] {
  const name = filePath.split('/').pop() || '';
  if (name.startsWith('use') && name.endsWith('.ts')) return 'hook';
  if (name.endsWith('.tsx')) return 'component';
  if (/[Ss]ervice/.test(name)) return 'service';
  if (name === 'types.ts' || name.endsWith('.d.ts')) return 'model';
  if (/config/i.test(name)) return 'config';
  if (/\.test\.|\.spec\./.test(name)) return 'test';
  if (/\.css|\.scss|\.less/.test(name)) return 'style';
  if (name === 'App.tsx' || name === 'index.ts' || name === 'main.ts') return 'entry_point';
  return 'utility';
}

// ── Agent 2: Architect ───────────────────────────────────────────────

function buildArchitectSystem(filePaths: string[]): string {
  // Include the exact file list in the system prompt so the LLM knows what paths are valid
  const fileList = filePaths.map(p => `  "${p}"`).join('\n');

  return `You are a software architect. Given file summaries and import relationships, group files into functional modules.

CRITICAL RULES:
1. Group by FUNCTIONAL COHESION, not directory structure
2. Module names must be descriptive domain concepts
3. NEVER use technical groupings like "Services", "Hooks", "Components", "Utils" as module names
4. Files from different directories that implement the same feature MUST be in the same module
5. Every file must be in exactly one module
6. Create between 2 and 10 modules
7. Relationships describe data/control flow between modules
8. File paths in the "files" arrays MUST be copied EXACTLY from the input — do NOT add "./" prefix or change them
9. Each module MUST have a "description" explaining its functional purpose (1-2 sentences)

GROUPING HINTS:
- A component + its hook + its service = SAME module (e.g. "ChatPanel.tsx" + "useChatHandlers.ts" + "aiChatService.ts" → "AI Intelligence")
- If file A imports heavily from file B, they likely belong together
- Think in terms of user-facing FEATURES, not code layers

GOOD module names: "Diagram Editor", "AI Intelligence", "Code Sync", "Navigation", "Workspace Management", "Import & Export"
BAD module names: "Services", "Components", "Hooks", "Utils", "Core", "Lib"

VALID FILE PATHS (use these exact strings):
${fileList}

Respond with a JSON object:
{
  "modules": [
    { "name": "Module Name", "description": "What this module handles, in 1-2 sentences", "files": ["path1.ts", "path2.tsx"] }
  ],
  "relationships": [
    { "from": "Module A", "to": "Module B", "label": "what flows between them" }
  ]
}

Respond ONLY with the JSON object, no other text.`;
}

function buildArchitectPrompt(
  fileAnalyses: FileAnalysis[],
  importEdges: Array<{ from: string; to: string }>,
): string {
  const summaries = fileAnalyses.map(
    f => `${f.filePath} — ${f.purpose} [${f.role}]`,
  ).join('\n');

  const edges = importEdges.length > 0
    ? importEdges.map(e => `${e.from} → ${e.to}`).join('\n')
    : '(no internal imports detected)';

  return `FILE SUMMARIES:\n${summaries}\n\nIMPORT RELATIONSHIPS:\n${edges}`;
}

function validateArchitecture(
  raw: unknown,
  allFilePaths: Set<string>,
): ArchitectureBlueprint | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const obj = raw as Record<string, unknown>;

  if (!Array.isArray(obj.modules)) return null;

  const resolvePath = buildPathResolver(allFilePaths);
  const moduleNames = new Set<string>();
  const assignedFiles = new Set<string>();
  const modules: ArchitectureBlueprint['modules'] = [];

  for (const mod of obj.modules) {
    if (typeof mod !== 'object' || mod === null) continue; // skip bad module, don't reject all
    const { name, description, files } = mod as Record<string, unknown>;
    if (typeof name !== 'string' || name.length === 0) continue;
    if (!Array.isArray(files) || files.length === 0) continue;

    // Deduplicate module names
    let finalName = name;
    if (moduleNames.has(finalName)) {
      let suffix = 2;
      while (moduleNames.has(`${name} ${suffix}`)) suffix++;
      finalName = `${name} ${suffix}`;
    }

    // Resolve file paths flexibly
    const validFiles: string[] = [];
    for (const f of files) {
      if (typeof f !== 'string') continue;
      const resolved = resolvePath(f);
      if (resolved && !assignedFiles.has(resolved)) {
        validFiles.push(resolved);
        assignedFiles.add(resolved);
      }
    }

    if (validFiles.length === 0) {
      console.warn(`[CodeGraph Agent 2] Module "${finalName}" had 0 valid files, skipping`);
      continue; // skip this module, don't reject the whole blueprint
    }

    moduleNames.add(finalName);
    const desc = typeof description === 'string' ? description : '';
    modules.push({ name: finalName, description: desc, files: validFiles });
  }

  if (modules.length < 1) {
    console.warn('[CodeGraph Agent 2] No valid modules found');
    return null;
  }

  // Validate relationships
  const relationships: ArchitectureBlueprint['relationships'] = [];
  if (Array.isArray(obj.relationships)) {
    for (const rel of obj.relationships) {
      if (typeof rel !== 'object' || rel === null) continue;
      const { from, to, label } = rel as Record<string, unknown>;
      if (typeof from === 'string' && typeof to === 'string' && typeof label === 'string') {
        if (moduleNames.has(from) && moduleNames.has(to)) {
          relationships.push({ from, to, label });
        }
      }
    }
  }

  return { modules, relationships };
}

async function buildArchitecture(
  fileAnalyses: FileAnalysis[],
  importEdges: Array<{ from: string; to: string }>,
  llmSettings: LLMSettings,
  signal?: AbortSignal,
): Promise<ArchitectureBlueprint | null> {
  const allFilePaths = new Set(fileAnalyses.map(f => f.filePath));
  const systemPrompt = buildArchitectSystem([...allFilePaths]);
  const prompt = buildArchitectPrompt(fileAnalyses, importEdges);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const userContent = attempt === 0
        ? prompt
        : `${prompt}\n\nPrevious response was invalid. Return ONLY valid JSON matching the schema. File paths must EXACTLY match the ones from the input.`;

      const response = await llmService.sendMessage(
        [{ role: 'user', content: userContent }],
        systemPrompt,
        llmSettings,
        signal,
      );

      const jsonStr = extractJSON(response.content);
      const parsed = JSON.parse(jsonStr);
      const blueprint = validateArchitecture(parsed, allFilePaths);

      if (blueprint) {
        // Auto-fix: add unassigned files to "Other" module
        const assigned = new Set(blueprint.modules.flatMap(m => m.files));
        const missing = [...allFilePaths].filter(f => !assigned.has(f));
        if (missing.length > 0) {
          blueprint.modules.push({
            name: 'Other',
            description: 'Files not assigned to a specific module',
            files: missing,
          });
        }
        console.log(`[CodeGraph Agent 2] Created ${blueprint.modules.length} modules with ${blueprint.relationships.length} relationships`);
        return blueprint;
      } else {
        console.warn(`[CodeGraph Agent 2] Attempt ${attempt + 1}: validation failed`);
      }
    } catch (err) {
      console.warn(`[CodeGraph Agent 2] Attempt ${attempt + 1} error:`, err);
    }
  }

  console.warn('[CodeGraph Agent 2] All retries exhausted, falling back to directory grouping');
  return null;
}

// ── Orchestrator ─────────────────────────────────────────────────────

/**
 * Uses LLM agents to re-group a CodebaseAnalysis by functional cohesion.
 * Returns a new CodebaseAnalysis with smart modules, or the original on failure.
 */
export async function analyzeCodebaseWithAI(
  analysis: CodebaseAnalysis,
  llmSettings: LLMSettings,
  onProgress?: (step: string, current: number, total: number) => void,
  onLogEntry?: LogEntryFn,
  signal?: AbortSignal,
): Promise<CodebaseAnalysis> {
  const allFiles = analysis.modules.flatMap(m => m.files);
  if (allFiles.length === 0) return analysis;

  // Prepare file summaries for Agent 1
  const fileSummaries: FileSummary[] = allFiles.map(f => ({
    path: f.filePath,
    symbols: f.symbols.map(s => `${s.name} (${s.kind})`),
    imports: f.imports.map(i => i.source),
    exports: f.exportedSymbols,
  }));

  // Batch files for Agent 1
  const batches: FileSummary[][] = [];
  for (let i = 0; i < fileSummaries.length; i += BATCH_SIZE) {
    batches.push(fileSummaries.slice(i, i + BATCH_SIZE));
  }

  const totalSteps = batches.length + 1; // +1 for architect step

  // Agent 1: Analyze files in batches
  const allAnalyses: FileAnalysis[] = [];
  for (let i = 0; i < batches.length; i++) {
    onProgress?.('Analyzing files', i + 1, totalSteps);
    const batchFileNames = batches[i].map(f => f.path.split('/').pop()).join(', ');
    onLogEntry?.('ai-analyze', `Analyzing batch ${i + 1}/${batches.length} (${batches[i].length} files)`, batchFileNames);
    const batchResults = await analyzeFilesBatch(batches[i], llmSettings, signal);
    allAnalyses.push(...batchResults);
    onLogEntry?.('ai-analyze', `Batch ${i + 1} complete: ${batchResults.length} file analyses`);
  }

  console.log(`[CodeGraph] Agent 1 complete: ${allAnalyses.length} file analyses`);

  // Build import edges for Agent 2
  const allFilePaths = new Set(allFiles.map(f => f.filePath));
  const importEdges: Array<{ from: string; to: string }> = [];
  for (const file of allFiles) {
    for (const imp of file.imports) {
      if (imp.isExternal && !imp.source.startsWith('@/')) continue;
      // Simple resolution: check if any file matches the import source
      const importBase = normalizePath(imp.source.replace(/^@\//, ''));
      for (const targetPath of allFilePaths) {
        const targetNorm = normalizePath(targetPath);
        const targetNoExt = targetNorm.replace(/\.[^/.]+$/, '');
        if (
          targetNorm === importBase ||
          targetNoExt === importBase ||
          targetNorm === `${importBase}.ts` ||
          targetNorm === `${importBase}.tsx`
        ) {
          if (targetPath !== file.filePath) {
            importEdges.push({ from: file.filePath, to: targetPath });
          }
          break;
        }
      }
    }
  }

  console.log(`[CodeGraph] Import edges resolved: ${importEdges.length}`);

  // Agent 2: Build architecture
  onProgress?.('Building architecture', batches.length + 1, totalSteps);
  onLogEntry?.('ai-architect', 'Building functional architecture...');
  const blueprint = await buildArchitecture(allAnalyses, importEdges, llmSettings, signal);

  if (!blueprint) {
    onLogEntry?.('ai-architect', 'AI architecture failed, falling back to heuristic grouping');
    console.warn('[CodeGraph] AI pipeline failed, falling back to heuristic grouping');
    return groupByFunctionalHeuristics(analysis);
  }

  // Convert blueprint to CodebaseAnalysis modules
  const fileByPath = new Map<string, AnalyzedFile>();
  for (const file of allFiles) {
    fileByPath.set(file.filePath, file);
  }

  const modules: CodebaseModule[] = blueprint.modules.map(mod => {
    const files = mod.files
      .map(fp => fileByPath.get(fp))
      .filter((f): f is AnalyzedFile => f !== undefined);

    // Cross-module dependencies from blueprint relationships
    const dependencies = blueprint.relationships
      .filter(r => r.from === mod.name)
      .map(r => r.to);

    return {
      name: mod.name,
      description: mod.description,
      path: files[0]?.filePath.split('/')[0] || '',
      files,
      dependencies,
    };
  });

  const moduleNames = modules.map(m => m.name).join(', ');
  onLogEntry?.('ai-architect', `Architecture: ${modules.length} modules, ${blueprint.relationships.length} relationships`, moduleNames);
  console.log(`[CodeGraph] AI pipeline success: ${modules.map(m => `${m.name}(${m.files.length})`).join(', ')}`);

  return {
    ...analysis,
    modules,
  };
}

export const codeGraphAgentService = {
  analyzeCodebaseWithAI,
};
