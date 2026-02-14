/**
 * Generates Mermaid diagrams from a CodebaseAnalysis.
 * Pure code generation — no LLM required.
 */

import { CodebaseAnalysis, CodebaseModule, AnalyzedFile, DiagramGenerationResult } from '../types';

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
function generateSystemOverview(analysis: CodebaseAnalysis): DiagramSpec {
  const lines: string[] = ['flowchart TD'];
  const modules = analysis.modules;

  // Add module nodes
  for (let i = 0; i < Math.min(modules.length, MAX_NODES - 1); i++) {
    const mod = modules[i];
    const id = sanitizeMermaidId(mod.name);
    const fileCount = mod.files.length;
    const symbolCount = mod.files.reduce((sum, f) => sum + f.symbols.length, 0);
    const label = `${mod.name}\\n${fileCount} files, ${symbolCount} symbols`;

    // Entry point modules get a different shape (stadium)
    const hasEntry = mod.files.some(f =>
      analysis.entryPoints.includes(f.filePath)
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

  // Add external deps summary (if any)
  if (analysis.externalDeps.length > 0) {
    if (analysis.externalDeps.length <= 8) {
      const depList = analysis.externalDeps.join('\\n');
      lines.push(`    _ext_deps{{${escapeLabel('External Deps\\n' + depList)}}}`);
    } else {
      lines.push(`    _ext_deps{{External Dependencies\\n${analysis.externalDeps.length} packages}}`);
    }
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

  // Style entry point nodes
  const entryModuleIds = modules
    .filter(m => m.files.some(f => analysis.entryPoints.includes(f.filePath)))
    .map(m => sanitizeMermaidId(m.name));

  if (entryModuleIds.length > 0) {
    lines.push(`    style ${entryModuleIds.join(',')} fill:#4a9eff,color:#fff`);
  }

  return {
    id: generateId(),
    name: 'System Overview',
    code: lines.join('\n'),
    level: 1,
  };
}

/** L2: Module Detail — files as nodes, internal import edges */
function generateModuleDetail(module: CodebaseModule, analysis: CodebaseAnalysis): DiagramSpec {
  const lines: string[] = ['flowchart TD'];
  const files = module.files;

  // Filter out trivial files (no symbols and no exports)
  const significantFiles = files.filter(f =>
    f.symbols.length > 0 || f.exportedSymbols.length > 0
  );

  const filesToShow = significantFiles.slice(0, MAX_NODES - 1);
  const filePathSet = new Set(filesToShow.map(f => f.filePath));

  // Group files by subdirectory for subgraphs
  const subDirs = new Map<string, AnalyzedFile[]>();
  for (const file of filesToShow) {
    const relativePath = module.path
      ? file.filePath.substring(module.path.length + 1)
      : file.filePath;
    const parts = relativePath.split('/');
    const subDir = parts.length > 1 ? parts[0] : '';
    if (!subDirs.has(subDir)) subDirs.set(subDir, []);
    subDirs.get(subDir)!.push(file);
  }

  // Render files, using subgraphs for subdirectories
  for (const [subDir, subFiles] of subDirs) {
    if (subDir && subFiles.length > 1) {
      lines.push(`    subgraph ${sanitizeMermaidId(subDir)}[${subDir}]`);
    }

    for (const file of subFiles) {
      const fileName = file.filePath.split('/').pop() || file.filePath;
      const id = sanitizeMermaidId(file.filePath);

      // Build label with symbols summary
      const classes = file.symbols.filter(s => s.kind === 'class');
      const funcs = file.symbols.filter(s => s.kind === 'function');
      const ifaces = file.symbols.filter(s => s.kind === 'interface');

      let details = '';
      if (classes.length > 0) details += `\\n${classes.length} class${classes.length > 1 ? 'es' : ''}`;
      if (funcs.length > 0) details += `\\n${funcs.length} fn${funcs.length > 1 ? 's' : ''}`;
      if (ifaces.length > 0) details += `\\n${ifaces.length} interface${ifaces.length > 1 ? 's' : ''}`;

      const label = truncateLabel(fileName) + details;

      // Entry point files get stadium shape
      const isEntry = analysis.entryPoints.includes(file.filePath);
      if (isEntry) {
        lines.push(`        ${id}([${escapeLabel(label)}])`);
      } else if (classes.length > 0) {
        lines.push(`        ${id}[[${escapeLabel(label)}]]`);
      } else {
        lines.push(`        ${id}[${escapeLabel(label)}]`);
      }
    }

    if (subDir && subFiles.length > 1) {
      lines.push('    end');
    }
  }

  if (significantFiles.length > MAX_NODES - 1) {
    lines.push(`    _more[...and ${significantFiles.length - (MAX_NODES - 1)} more files]`);
  }

  // Add import edges between files in this module
  const addedEdges = new Set<string>();
  for (const file of filesToShow) {
    const srcId = sanitizeMermaidId(file.filePath);
    for (const imp of file.imports) {
      if (imp.isExternal) continue;

      // Try to resolve import to a file in this module
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

  // Use classDiagram for files with classes, flowchart otherwise
  if (hasClasses) {
    return generateClassDiagram(file, fileName);
  }
  return generateFunctionFlowchart(file, fileName);
}

function generateClassDiagram(file: AnalyzedFile, fileName: string): DiagramSpec {
  const lines: string[] = ['classDiagram'];
  const classes = file.symbols.filter(s => s.kind === 'class');
  const functions = file.symbols.filter(s => s.kind === 'function');
  const interfaces = file.symbols.filter(s => s.kind === 'interface');

  let nodeCount = 0;

  for (const cls of classes) {
    if (nodeCount >= MAX_NODES) break;
    lines.push(`    class ${sanitizeMermaidId(cls.name)} {`);

    // Find methods that belong to this class (between class start and end)
    const methods = functions.filter(f =>
      f.lineStart > cls.lineStart && f.lineEnd <= cls.lineEnd
    );

    for (const method of methods.slice(0, 10)) {
      lines.push(`        +${method.name}()`);
    }
    if (methods.length > 10) {
      lines.push(`        ... ${methods.length - 10} more`);
    }

    lines.push('    }');
    nodeCount++;
  }

  // Standalone functions (not inside a class)
  const standaloneFns = functions.filter(f =>
    !classes.some(c => f.lineStart > c.lineStart && f.lineEnd <= c.lineEnd)
  );

  if (standaloneFns.length > 0 && nodeCount < MAX_NODES) {
    lines.push(`    class ${sanitizeMermaidId(fileName.replace(/\.[^.]+$/, '') + '_functions')} {`);
    lines.push(`        <<module>>`);
    for (const fn of standaloneFns.slice(0, 10)) {
      lines.push(`        +${fn.name}()`);
    }
    if (standaloneFns.length > 10) {
      lines.push(`        ... ${standaloneFns.length - 10} more`);
    }
    lines.push('    }');
    nodeCount++;
  }

  // Interfaces
  for (const iface of interfaces) {
    if (nodeCount >= MAX_NODES) break;
    lines.push(`    class ${sanitizeMermaidId(iface.name)} {`);
    lines.push('        <<interface>>');
    lines.push('    }');
    nodeCount++;
  }

  return {
    id: generateId(),
    name: `File: ${fileName}`,
    code: lines.join('\n'),
    level: 3,
    fileRef: file.filePath,
  };
}

function generateFunctionFlowchart(file: AnalyzedFile, fileName: string): DiagramSpec {
  const lines: string[] = ['flowchart TD'];
  const symbols = file.symbols.slice(0, MAX_NODES - 1);

  // Group by kind
  const exported = new Set(file.exportedSymbols);

  for (const sym of symbols) {
    const id = sanitizeMermaidId(sym.name);
    const kindLabel = sym.kind === 'function' ? 'fn' : sym.kind;
    const label = `${sym.name}\\n(${kindLabel})`;

    if (exported.has(sym.name)) {
      lines.push(`    ${id}([${escapeLabel(label)}])`);
    } else {
      lines.push(`    ${id}[${escapeLabel(label)}]`);
    }
  }

  if (file.symbols.length > MAX_NODES - 1) {
    lines.push(`    _more[...and ${file.symbols.length - (MAX_NODES - 1)} more]`);
  }

  // Add edges from imports that reference symbols in this file
  // (rough heuristic: internal functions called from exported ones)
  const exportedSyms = symbols.filter(s => exported.has(s.name));
  const internalSyms = symbols.filter(s => !exported.has(s.name));

  // Simple heuristic: exported functions may call internal ones defined before them
  for (const exp of exportedSyms) {
    for (const internal of internalSyms) {
      if (internal.lineStart < exp.lineStart && internal.lineEnd <= exp.lineEnd) {
        const srcId = sanitizeMermaidId(exp.name);
        const tgtId = sanitizeMermaidId(internal.name);
        lines.push(`    ${srcId} --> ${tgtId}`);
      }
    }
  }

  // Style exported nodes
  const exportedIds = symbols.filter(s => exported.has(s.name)).map(s => sanitizeMermaidId(s.name));
  if (exportedIds.length > 0) {
    lines.push(`    style ${exportedIds.join(',')} fill:#4a9eff,color:#fff`);
  }

  return {
    id: generateId(),
    name: `File: ${fileName}`,
    code: lines.join('\n'),
    level: 3,
    fileRef: file.filePath,
  };
}

export const diagramGeneratorService = {
  generateAllDiagrams(analysis: CodebaseAnalysis): DiagramGenerationResult {
    const diagrams: DiagramSpec[] = [];
    const nodeLinks: DiagramGenerationResult['nodeLinks'] = [];

    // 1. Generate L1 (System Overview)
    const l1 = generateSystemOverview(analysis);
    diagrams.push(l1);

    // 2. Generate L2 for each module with >1 file
    const l2Map = new Map<string, DiagramSpec>(); // moduleName → diagram

    for (const module of analysis.modules) {
      if (module.files.length < 2) continue;
      const significantFiles = module.files.filter(f =>
        f.symbols.length > 0 || f.exportedSymbols.length > 0
      );
      if (significantFiles.length === 0) continue;

      const l2 = generateModuleDetail(module, analysis);
      diagrams.push(l2);
      l2Map.set(module.name, l2);

      // NodeLink: L1 module node → L2 diagram
      nodeLinks.push({
        sourceDiagramId: l1.id,
        nodeId: sanitizeMermaidId(module.name),
        targetDiagramId: l2.id,
        label: `View ${module.name} details`,
      });
    }

    // 3. Generate L3 for each file with >3 symbols
    for (const module of analysis.modules) {
      const l2 = l2Map.get(module.name);

      for (const file of module.files) {
        if (file.symbols.length < 3) continue;

        const l3 = generateFileDetail(file);
        diagrams.push(l3);

        // NodeLink: L2 file node → L3 diagram (if L2 exists)
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
