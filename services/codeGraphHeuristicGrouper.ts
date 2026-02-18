/**
 * Heuristic functional grouper for CodeGraph.
 *
 * When AI is unavailable, groups files by naming conventions + import affinity
 * instead of raw directory structure. Produces functional module names like
 * "State Management", "AI Intelligence" instead of "hooks", "services".
 */

import { CodebaseAnalysis, CodebaseModule, AnalyzedFile } from '../types';

// ── Pattern table ───────────────────────────────────────────────────

interface GroupPattern {
  pattern: RegExp;
  name: string;
  description: string;
}

const GROUP_PATTERNS: GroupPattern[] = [
  { pattern: /[Cc]ode[Gg]raph|[Cc]ode[Gg]raph/,       name: 'Code Graph',         description: 'Code graph creation, visualization, and synchronization' },
  { pattern: /[Cc]hat|[Ll][Ll][Mm]|[Aa][Ii](?:Chat|Gen|Service)|gemini|openai|anthropic|llmService/i,
                                                         name: 'AI Intelligence',    description: 'AI chat, LLM integration, and intelligent analysis' },
  { pattern: /[Ss]can(?:ner|Result)|[Ss]ync(?:Handler|Mode|Status)|[Dd]ivergence|codeScannerService/,
                                                         name: 'Code Sync',          description: 'Code scanning, divergence detection, and sync management' },
  { pattern: /[Dd]iagram(?:Anal|Gen|Handler)|[Mm]ermaid|[Ee]ditor(?:\.tsx)?$|[Pp]review(?:\.tsx)?$|useDiagram/,
                                                         name: 'Diagram Editor',     description: 'Diagram editing, rendering, and analysis' },
  { pattern: /[Nn]avigat|[Bb]readcrumb|[Zz]oom/,        name: 'Navigation',         description: 'Multi-level navigation, breadcrumbs, and zoom' },
  { pattern: /[Ss]idebar|[Ff]older(?:Handler)?|[Ww]orkspace(?:Handler|View)?/,
                                                         name: 'Workspace',          description: 'Workspace management, folder hierarchy, and sidebar' },
  { pattern: /[Ss]torage|persist|[Cc]rypto|[Ii]ndexedDB/i,
                                                         name: 'Storage',            description: 'Data persistence, encrypted storage, and caching' },
  { pattern: /[Ee]xport|[Ii]mport|[Bb]lueprint(?:Export|Import)/,
                                                         name: 'Import & Export',    description: 'File import/export, blueprint format handling' },
  { pattern: /[Cc]ode[Ll]ink|[Rr]epo(?:Manager|Handler|Config)|[Ff]ile[Ss]ystem/,
                                                         name: 'Code Integration',   description: 'Repository management, code linking, and file system access' },
  { pattern: /[Cc]omment|[Nn]ode[Ll]ink|[Ss]vgParser|[Bb]adge/,
                                                         name: 'Annotations',        description: 'Comments, node links, and SVG badge injection' },
  { pattern: /[Ss]caffold|[Dd]iff[Vv]iew/,              name: 'Code Generation',    description: 'Code scaffolding and visual diff' },
  { pattern: /[Mm]odal|[Hh]eader|[Ff]ooter|[Ss]plit[Pp]ane|[Rr]esize/,
                                                         name: 'UI Shell',           description: 'Application shell, modals, layout, and resize handling' },
  { pattern: /[Dd]omain|[Dd]omainNode/,                 name: 'Domain Modeling',    description: 'Domain-driven design analysis and projections' },
  { pattern: /[Ff]low(?:Service|Generation)|[Ss]equence/,name: 'Flow Analysis',     description: 'Runtime flow detection and sequence diagram generation' },
  { pattern: /[Cc]odebase(?:Analy|Import)/,              name: 'Codebase Analysis', description: 'Codebase scanning, module analysis, and diagram generation' },
];

// ── Core algorithm ──────────────────────────────────────────────────

/**
 * Match a file to a group by its path/filename.
 * Returns the group name or null if no pattern matches.
 */
function matchFileToGroup(filePath: string): GroupPattern | null {
  const fileName = filePath.split('/').pop() || filePath;
  for (const gp of GROUP_PATTERNS) {
    if (gp.pattern.test(fileName) || gp.pattern.test(filePath)) {
      return gp;
    }
  }
  return null;
}

/**
 * Replaces raw directory-based grouping with functional grouping.
 * Uses naming conventions + import affinity.
 */
export function groupByFunctionalHeuristics(analysis: CodebaseAnalysis): CodebaseAnalysis {
  const allFiles = analysis.modules.flatMap(m => m.files);
  if (allFiles.length === 0) return analysis;

  // Phase 1: Pattern matching
  const groups = new Map<string, { files: AnalyzedFile[]; description: string }>();
  const unmatched: AnalyzedFile[] = [];

  for (const file of allFiles) {
    const match = matchFileToGroup(file.filePath);
    if (match) {
      if (!groups.has(match.name)) {
        groups.set(match.name, { files: [], description: match.description });
      }
      groups.get(match.name)!.files.push(file);
    } else {
      unmatched.push(file);
    }
  }

  // Phase 2: Import affinity for unmatched files
  // Build a map of filePath → group name for matched files
  const fileToGroup = new Map<string, string>();
  for (const [groupName, { files }] of groups) {
    for (const f of files) {
      fileToGroup.set(f.filePath, groupName);
    }
  }

  // For each unmatched file, count how many of its imports go to each group
  for (const file of unmatched) {
    const affinity = new Map<string, number>();
    for (const imp of file.imports) {
      if (imp.isExternal && !imp.source.startsWith('@/')) continue;
      // Try to resolve import to a file path
      const importBase = imp.source.replace(/^@\//, '').replace(/^\.\//, '');
      for (const [fp, gn] of fileToGroup) {
        const fpBase = fp.replace(/\.[^/.]+$/, '');
        if (fpBase.endsWith(importBase) || importBase.endsWith(fpBase.split('/').pop()?.replace(/\.[^/.]+$/, '') || '')) {
          affinity.set(gn, (affinity.get(gn) || 0) + 1);
        }
      }
    }

    // Pick group with highest affinity
    let bestGroup: string | null = null;
    let bestCount = 0;
    for (const [gn, count] of affinity) {
      if (count > bestCount) {
        bestCount = count;
        bestGroup = gn;
      }
    }

    if (bestGroup && groups.has(bestGroup)) {
      groups.get(bestGroup)!.files.push(file);
      fileToGroup.set(file.filePath, bestGroup);
    } else {
      // Fallback: try to infer from file role
      const fileName = file.filePath.split('/').pop() || '';
      const dirName = file.filePath.split('/').slice(-2, -1)[0] || '';
      let fallbackGroup = 'Core';

      if (fileName === 'App.tsx' || fileName === 'main.tsx' || fileName === 'index.html') {
        fallbackGroup = 'UI Shell';
      } else if (fileName === 'types.ts' || fileName.endsWith('.d.ts')) {
        fallbackGroup = 'Core';
      } else if (dirName === 'components') {
        fallbackGroup = 'UI Shell';
      }

      if (!groups.has(fallbackGroup)) {
        groups.set(fallbackGroup, { files: [], description: 'Core application types and configuration' });
      }
      groups.get(fallbackGroup)!.files.push(file);
      fileToGroup.set(file.filePath, fallbackGroup);
    }
  }

  // Phase 3: Merge small groups (< 2 files) into their highest-import-affinity group
  const smallGroups: string[] = [];
  for (const [name, { files }] of groups) {
    if (files.length < 2 && groups.size > 3) {
      smallGroups.push(name);
    }
  }

  for (const smallName of smallGroups) {
    const smallData = groups.get(smallName);
    if (!smallData) continue;

    // Find best merge target by counting imports into other groups
    const affinity = new Map<string, number>();
    for (const file of smallData.files) {
      for (const imp of file.imports) {
        if (imp.isExternal && !imp.source.startsWith('@/')) continue;
        const importBase = imp.source.replace(/^@\//, '').replace(/^\.\//, '');
        for (const [fp, gn] of fileToGroup) {
          if (gn === smallName) continue;
          const fpBase = fp.replace(/\.[^/.]+$/, '');
          if (fpBase.endsWith(importBase) || importBase.endsWith(fpBase.split('/').pop()?.replace(/\.[^/.]+$/, '') || '')) {
            affinity.set(gn, (affinity.get(gn) || 0) + 1);
          }
        }
      }
    }

    let bestTarget: string | null = null;
    let bestCount = 0;
    for (const [gn, count] of affinity) {
      if (count > bestCount && groups.has(gn) && !smallGroups.includes(gn)) {
        bestCount = count;
        bestTarget = gn;
      }
    }

    if (bestTarget && groups.has(bestTarget)) {
      const targetData = groups.get(bestTarget)!;
      targetData.files.push(...smallData.files);
      for (const f of smallData.files) {
        fileToGroup.set(f.filePath, bestTarget);
      }
      groups.delete(smallName);
    }
  }

  // Phase 4: Compute cross-group dependencies
  const groupDeps = new Map<string, Set<string>>();
  for (const [groupName, { files }] of groups) {
    const deps = new Set<string>();
    for (const file of files) {
      for (const imp of file.imports) {
        if (imp.isExternal && !imp.source.startsWith('@/')) continue;
        const importBase = imp.source.replace(/^@\//, '').replace(/^\.\//, '');
        for (const [fp, gn] of fileToGroup) {
          if (gn === groupName) continue;
          const fpBase = fp.replace(/\.[^/.]+$/, '');
          if (fpBase.endsWith(importBase) || importBase.endsWith(fpBase.split('/').pop()?.replace(/\.[^/.]+$/, '') || '')) {
            deps.add(gn);
          }
        }
      }
    }
    groupDeps.set(groupName, deps);
  }

  // Build modules
  const modules: CodebaseModule[] = [];
  for (const [name, { files, description }] of groups) {
    const deps = groupDeps.get(name);
    modules.push({
      name,
      description,
      path: files[0]?.filePath.split('/')[0] || '',
      files,
      dependencies: deps ? [...deps] : [],
    });
  }

  // Sort by file count descending for consistent ordering
  modules.sort((a, b) => b.files.length - a.files.length);

  return {
    ...analysis,
    modules,
  };
}
