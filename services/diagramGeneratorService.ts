/**
 * Generates Mermaid diagrams from a CodebaseAnalysis.
 * Pure code generation — no LLM required.
 */

import { CodebaseAnalysis, CodebaseModule, AnalyzedFile, DiagramGenerationResult } from '../types';
import { DiffResult } from './ArchitectureDiff';

const MAX_NODES = 25;

function sanitizeMermaidId(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^(\d)/, '_$1')
    .replace(/_+/g, '_')
    .replace(/_$/, '');
}

function truncateLabel(label: string, maxLen: number = 30): string {
  if (label.length <= maxLen) return label;
  return label.substring(0, maxLen - 3) + '...';
}

function escapeLabel(label: string): string {
  return label.replace(/"/g, '#quot;');
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

interface DiagramSpec {
  id: string;
  name: string;
  code: string;
  level: 1 | 2 | 3;
  moduleRef?: string;
  fileRef?: string;
}

/** L1: System Overview — modules as nodes, cross-module deps as edges */
function generateSystemOverview(analysis: CodebaseAnalysis, diff?: DiffResult): DiagramSpec {
  const lines: string[] = ['flowchart TD'];
  const modules = analysis.modules || [];

  const addedIds: string[] = [];
  const removedIds: string[] = [];
  const modifiedIds: string[] = [];

  // Add module nodes
  const modulesToProcess = [...modules];

  // If we have a diff, we should potentially add "removed" modules to the graph for visualization
  if (diff) {
    for (const path of diff.removed) {
      // Very simple heuristic: if it looks like a module path (shallow)
      if (!path.includes('/') || path.split('/').length <= 2) {
        const name = path.split('/').pop() || path;
        const id = sanitizeMermaidId(name) + '_REMOVED';
        lines.push(`    ${id}["${escapeLabel(name)}\\n(REMOVED)"]`);
        removedIds.push(id);
      }
    }
  }

  for (let i = 0; i < Math.min(modulesToProcess.length, MAX_NODES - 1); i++) {
    const mod = modulesToProcess[i];
    const id = sanitizeMermaidId(mod.name);
    const fileCount = (mod.files || []).length;
    const symbolCount = (mod.files || []).reduce((sum, f) => sum + (f.symbols || []).length, 0);
    const label = `${mod.name}\\n${fileCount} files, ${symbolCount} symbols`;

    if (diff) {
      if (diff.added.includes(mod.path)) addedIds.push(id);
      else if (diff.modified.includes(mod.path)) modifiedIds.push(id);
    }

    // Entry point modules get a different shape (stadium)
    const hasEntry = (mod.files || []).some(f =>
      (analysis.entryPoints || []).includes(f.filePath)
    );

    if (hasEntry) {
      lines.push(`    ${id}([${escapeLabel(label)}])`);
    } else {
      lines.push(`    ${id}[${escapeLabel(label)}]`);
    }
  }

  if (modules.length > MAX_NODES - 1) {
    lines.push(`    _more[...and ${modules.length - (MAX_NODES - 1)} more modules]`);
  }

  // Add dependency edges
  const addedEdges = new Set<string>();
  for (const mod of modules.slice(0, MAX_NODES - 1)) {
    const srcId = sanitizeMermaidId(mod.name);
    for (const dep of mod.dependencies) {
      const targetMod = modules.find(m => m.name === dep);
      if (!targetMod) continue;
      const targetIdx = modules.indexOf(targetMod);
      if (targetIdx >= MAX_NODES - 1) continue;
      const tgtId = sanitizeMermaidId(dep);
      const edgeKey = `${srcId}->${tgtId}`;
      if (!addedEdges.has(edgeKey)) {
        lines.push(`    ${srcId} --> ${tgtId}`);
        addedEdges.add(edgeKey);
      }
    }
  }

  // Styling
  if (diff) {
    if (addedIds.length > 0) lines.push(`    style ${addedIds.join(',')} fill:#d4edda,stroke:#28a745,stroke-width:2px`);
    if (removedIds.length > 0) lines.push(`    style ${removedIds.join(',')} fill:#f8d7da,stroke:#dc3545,stroke-dasharray: 5 5`);
    if (modifiedIds.length > 0) lines.push(`    style ${modifiedIds.join(',')} stroke:#fd7e14,stroke-width:4px`);
  } else {
    // Default entry point styling if no diff
    const entryModuleIds = modules
      .filter(m => (m.files || []).some(f => (analysis.entryPoints || []).includes(f.filePath)))
      .map(m => sanitizeMermaidId(m.name));

    if (entryModuleIds.length > 0) {
      lines.push(`    style ${entryModuleIds.join(',')} fill:#4a9eff,color:#fff`);
    }
  }

  return {
    id: generateId(),
    name: diff ? 'System Comparison' : 'System Overview',
    code: lines.join('\n'),
    level: 1,
  };
}

/** L2: Module Detail — files as nodes, internal import edges */
function generateModuleDetail(module: CodebaseModule, analysis: CodebaseAnalysis, diff?: DiffResult): DiagramSpec {
  const lines: string[] = ['flowchart TD'];
  const files = module.files || [];

  const addedIds: string[] = [];
  const removedIds: string[] = [];
  const modifiedIds: string[] = [];

  // Filter out trivial files (no symbols and no exports)
  const significantFiles = files.filter(f =>
    (f.symbols || []).length > 0 || (f.exportedSymbols || []).length > 0
  );

  const filesToShow = significantFiles.slice(0, MAX_NODES - 1);

  // If we have a diff, add removed files that belong to this module
  if (diff) {
    for (const path of diff.removed) {
      if (path.startsWith(module.path + '/') || (module.path === '' && !path.includes('/'))) {
        const name = path.split('/').pop() || path;
        const id = sanitizeMermaidId(path) + '_REMOVED';
        lines.push(`    ${id}["${escapeLabel(name)}\\n(REMOVED)"]`);
        removedIds.push(id);
      }
    }
  }

  // Render files
  for (const file of filesToShow) {
    const fileName = file.filePath.split('/').pop() || file.filePath;
    const id = sanitizeMermaidId(file.filePath);

    if (diff) {
      if (diff.added.includes(file.filePath)) addedIds.push(id);
      else if (diff.modified.includes(file.filePath)) modifiedIds.push(id);
    }

    const symbols = file.symbols || [];
    const classes = symbols.filter(s => s.kind === 'class');
    const funcs = symbols.filter(s => s.kind === 'function');
    const ifaces = symbols.filter(s => s.kind === 'interface');

    let details = '';
    if (classes.length > 0) details += `\\n${classes.length} class${classes.length > 1 ? 'es' : ''}`;
    if (funcs.length > 0) details += `\\n${funcs.length} fn${funcs.length > 1 ? 's' : ''}`;
    if (ifaces.length > 0) details += `\\n${ifaces.length} interface${ifaces.length > 1 ? 's' : ''}`;

    const label = truncateLabel(fileName) + details;

    const isEntry = (analysis.entryPoints || []).includes(file.filePath);
    if (isEntry) {
      lines.push(`    ${id}([${escapeLabel(label)}])`);
    } else if (classes.length > 0) {
      lines.push(`    ${id}[[${escapeLabel(label)}]]`);
    } else {
      lines.push(`    ${id}[${escapeLabel(label)}]`);
    }
  }

  if (significantFiles.length > MAX_NODES - 1) {
    lines.push(`    _more[...and ${significantFiles.length - (MAX_NODES - 1)} more files]`);
  }

  // Add import edges between files in this module
  const addedEdges = new Set<string>();
  for (const file of filesToShow) {
    const srcId = sanitizeMermaidId(file.filePath);
    const fileImports = file.imports || [];
    for (const imp of fileImports) {
      if (imp.isExternal) continue;
      for (const targetFile of filesToShow) {
        const targetName = targetFile.filePath.split('/').pop()?.replace(/\.[^.]+$/, '') || '';
        const importName = imp.source.split('/').pop() || '';

        if (importName === targetName || targetFile.filePath.endsWith(imp.source.replace(/^\.\//, '') + '.ts') ||
          targetFile.filePath.endsWith(imp.source.replace(/^\.\//, '') + '.tsx') ||
          targetFile.filePath.endsWith(imp.source.replace(/^\.\//, '') + '.js') ||
          targetFile.filePath.endsWith(imp.source.replace(/^\.\//, ''))) {
          const tgtId = sanitizeMermaidId(targetFile.filePath);
          if (srcId !== tgtId) {
            const edgeKey = `${srcId}->${tgtId}`;
            if (!addedEdges.has(edgeKey)) {
              lines.push(`    ${srcId} --> ${tgtId}`);
              addedEdges.add(edgeKey);
            }
          }
        }
      }
    }
  }

  // Styling
  if (diff) {
    if (addedIds.length > 0) lines.push(`    style ${addedIds.join(',')} fill:#d4edda,stroke:#28a745,stroke-width:2px`);
    if (removedIds.length > 0) lines.push(`    style ${removedIds.join(',')} fill:#f8d7da,stroke:#dc3545,stroke-dasharray: 5 5`);
    if (modifiedIds.length > 0) lines.push(`    style ${modifiedIds.join(',')} stroke:#fd7e14,stroke-width:4px`);
  } else {
    const exportedIds = filesToShow.filter(f => (analysis.entryPoints || []).includes(f.filePath)).map(f => sanitizeMermaidId(f.filePath));
    if (exportedIds.length > 0) {
      lines.push(`    style ${exportedIds.join(',')} fill:#4a9eff,color:#fff`);
    }
  }

  return {
    id: generateId(),
    name: `Module: ${module.name}`,
    code: lines.join('\n'),
    level: 2,
    moduleRef: module.name,
  };
}

/** L3: File Detail — classes/functions as nodes */
function generateFileDetail(file: AnalyzedFile): DiagramSpec {
  const fileName = file.filePath.split('/').pop() || file.filePath;
  const hasClasses = file.symbols.some(s => s.kind === 'class');
  if (hasClasses) {
    return generateClassDiagram(file, fileName);
  }
  return generateFunctionFlowchart(file, fileName);
}

function generateClassDiagram(file: AnalyzedFile, fileName: string): DiagramSpec {
  const lines: string[] = ['classDiagram'];
  const symbols = file.symbols || [];
  const classes = symbols.filter(s => s.kind === 'class');
  const functions = symbols.filter(s => s.kind === 'function');
  const interfaces = symbols.filter(s => s.kind === 'interface');

  let nodeCount = 0;
  for (const cls of classes) {
    if (nodeCount >= MAX_NODES) break;
    lines.push(`    class ${sanitizeMermaidId(cls.name)} {`);
    const methods = functions.filter(f => f.lineStart > cls.lineStart && f.lineEnd <= cls.lineEnd);
    for (const method of methods.slice(0, 10)) {
      lines.push(`        +${method.name}()`);
    }
    lines.push('    }');
    nodeCount++;
  }

  const standaloneFns = functions.filter(f => !classes.some(c => f.lineStart > c.lineStart && f.lineEnd <= c.lineEnd));
  if (standaloneFns.length > 0 && nodeCount < MAX_NODES) {
    lines.push(`    class ${sanitizeMermaidId(fileName.replace(/\.[^.]+$/, '') + '_functions')} { <<module>> }`);
    for (const fn of standaloneFns.slice(0, 10)) lines.push(`    ${sanitizeMermaidId(fileName.replace(/\.[^.]+$/, '') + '_functions')} : +${fn.name}()`);
    nodeCount++;
  }

  for (const iface of interfaces) {
    if (nodeCount >= MAX_NODES) break;
    lines.push(`    class ${sanitizeMermaidId(iface.name)} { <<interface>> }`);
    nodeCount++;
  }

  return { id: generateId(), name: `File: ${fileName}`, code: lines.join('\n'), level: 3, fileRef: file.filePath };
}

function generateFunctionFlowchart(file: AnalyzedFile, fileName: string): DiagramSpec {
  const lines: string[] = ['flowchart TD'];
  const symbols = (file.symbols || []).slice(0, MAX_NODES - 1);
  const exported = new Set(file.exportedSymbols || []);

  for (const sym of symbols) {
    const id = sanitizeMermaidId(sym.name);
    const kindLabel = sym.kind === 'function' ? 'fn' : sym.kind;
    const label = `${sym.name}\\n(${kindLabel})`;
    if (exported.has(sym.name)) lines.push(`    ${id}([${escapeLabel(label)}])`);
    else lines.push(`    ${id}[${escapeLabel(label)}]`);
  }

  const exportedSyms = symbols.filter(s => exported.has(s.name));
  const internalSyms = symbols.filter(s => !exported.has(s.name));
  for (const exp of exportedSyms) {
    for (const internal of internalSyms) {
      if (internal.lineStart < exp.lineStart && internal.lineEnd <= exp.lineEnd) {
        lines.push(`    ${sanitizeMermaidId(exp.name)} --> ${sanitizeMermaidId(internal.name)}`);
      }
    }
  }

  const exportedIds = symbols.filter(s => exported.has(s.name)).map(s => sanitizeMermaidId(s.name));
  if (exportedIds.length > 0) lines.push(`    style ${exportedIds.join(',')} fill:#4a9eff,color:#fff`);

  return { id: generateId(), name: `File: ${fileName}`, code: lines.join('\n'), level: 3, fileRef: file.filePath };
}

export const diagramGeneratorService = {
  generateAllDiagrams(analysis: CodebaseAnalysis, diff?: DiffResult): DiagramGenerationResult {
    const diagrams: DiagramSpec[] = [];
    const nodeLinks: DiagramGenerationResult['nodeLinks'] = [];

    const l1 = generateSystemOverview(analysis, diff);
    diagrams.push(l1);

    const l2Map = new Map<string, DiagramSpec>();
    for (const module of (analysis.modules || [])) {
      const significantFiles = (module.files || []).filter(f => (f.symbols || []).length > 0 || (f.exportedSymbols || []).length > 0);

      // If we have a diff, we might want to show empty modules if they are modified or added
      const isModified = diff && (diff.modified.includes(module.path) || diff.added.includes(module.path));
      if (module.files.length < 2 && !isModified) continue;
      if (significantFiles.length === 0 && !isModified) continue;

      const l2 = generateModuleDetail(module, analysis, diff);
      diagrams.push(l2);
      l2Map.set(module.name, l2);

      nodeLinks.push({
        sourceDiagramId: l1.id,
        nodeId: sanitizeMermaidId(module.name),
        targetDiagramId: l2.id,
        label: `View ${module.name} details`,
      });
    }

    for (const module of (analysis.modules || [])) {
      const l2 = l2Map.get(module.name);
      for (const file of (module.files || [])) {
        if ((file.symbols || []).length < 3) continue;
        const l3 = generateFileDetail(file);
        diagrams.push(l3);
        if (l2) {
          nodeLinks.push({
            sourceDiagramId: l2.id,
            nodeId: sanitizeMermaidId(file.filePath),
            targetDiagramId: l3.id,
            label: `View ${file.filePath.split('/').pop()} details`,
          });
        }
      }
    }

    return { diagrams, nodeLinks };
  },
};
