/**
 * Regex-based symbol extraction for code files.
 * Used to help users pick line ranges when creating code links.
 */

import { CodeSymbol, FileImport } from '../types';

type PatternDef = {
  regex: RegExp;
  kind: CodeSymbol['kind'];
};

const TS_JS_PATTERNS: PatternDef[] = [
  { regex: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm, kind: 'class' },
  { regex: /^(?:export\s+)?interface\s+(\w+)/gm, kind: 'interface' },
  { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm, kind: 'function' },
  { regex: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/gm, kind: 'function' },
  { regex: /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[a-zA-Z_]\w*)\s*=>/gm, kind: 'function' },
];

const PYTHON_PATTERNS: PatternDef[] = [
  { regex: /^class\s+(\w+)/gm, kind: 'class' },
  { regex: /^(?:async\s+)?def\s+(\w+)/gm, kind: 'function' },
];

function getPatterns(language: string): PatternDef[] {
  switch (language) {
    case 'typescript':
    case 'javascript':
      return TS_JS_PATTERNS;
    case 'python':
      return PYTHON_PATTERNS;
    default:
      return [];
  }
}

/**
 * Estimate where a symbol ends by scanning for the next symbol at the same
 * indentation level or end-of-file.
 */
function estimateEnd(lines: string[], startLine: number): number {
  const startIndent = lines[startLine]?.search(/\S/) ?? 0;

  for (let i = startLine + 1; i < lines.length; i++) {
    const line = lines[i];
    // Skip blank lines
    if (line.trim() === '') continue;
    const indent = line.search(/\S/);
    // A non-blank line at the same or lower indent signals end of block
    if (indent <= startIndent && i > startLine + 1) {
      return i; // exclusive — the line *before* this is the last line of the symbol
    }
  }
  return lines.length;
}

function isExternalImport(source: string): boolean {
  return !source.startsWith('.') && !source.startsWith('/');
}

function extractTSJSImports(code: string): FileImport[] {
  const imports: FileImport[] = [];

  // import X from 'Y'  (default)
  const defaultRe = /import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = defaultRe.exec(code)) !== null) {
    imports.push({ name: m[1], source: m[2], isDefault: true, isExternal: isExternalImport(m[2]) });
  }

  // import { X, Y as Z } from 'W'
  const namedRe = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  while ((m = namedRe.exec(code)) !== null) {
    const names = m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
    for (const name of names) {
      imports.push({ name, source: m[2], isDefault: false, isExternal: isExternalImport(m[2]) });
    }
  }

  // import * as X from 'Y'
  const starRe = /import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g;
  while ((m = starRe.exec(code)) !== null) {
    imports.push({ name: m[1], source: m[2], isDefault: true, isExternal: isExternalImport(m[2]) });
  }

  // require('X')
  const requireRe = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = requireRe.exec(code)) !== null) {
    imports.push({ name: m[1].split('/').pop() || m[1], source: m[1], isDefault: true, isExternal: isExternalImport(m[1]) });
  }

  return imports;
}

function extractPythonImports(code: string): FileImport[] {
  const imports: FileImport[] = [];
  let m: RegExpExecArray | null;

  // from X import Y, Z
  const fromRe = /^from\s+([\w.]+)\s+import\s+(.+)$/gm;
  while ((m = fromRe.exec(code)) !== null) {
    const source = m[1];
    const names = m[2].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
    for (const name of names) {
      imports.push({ name, source, isDefault: false, isExternal: !source.startsWith('.') });
    }
  }

  // import X, Y
  const importRe = /^import\s+([\w.]+(?:\s*,\s*[\w.]+)*)/gm;
  while ((m = importRe.exec(code)) !== null) {
    const names = m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
    for (const name of names) {
      imports.push({ name: name.split('.').pop() || name, source: name, isDefault: true, isExternal: !name.startsWith('.') });
    }
  }

  return imports;
}

export const codeParserService = {
  extractImports(code: string, language: string): FileImport[] {
    switch (language) {
      case 'typescript':
      case 'javascript':
        return extractTSJSImports(code);
      case 'python':
        return extractPythonImports(code);
      default:
        return [];
    }
  },

  extractExports(code: string, language: string): string[] {
    const exports: string[] = [];
    let m: RegExpExecArray | null;

    if (language === 'typescript' || language === 'javascript') {
      // export const/let/var/function/class X
      const namedRe = /^export\s+(?:default\s+)?(?:const|let|var|function|class|interface|type|enum|abstract\s+class)\s+(\w+)/gm;
      while ((m = namedRe.exec(code)) !== null) {
        exports.push(m[1]);
      }
      // export default X (identifier)
      const defaultRe = /^export\s+default\s+(\w+)\s*;/gm;
      while ((m = defaultRe.exec(code)) !== null) {
        if (!['function', 'class', 'const', 'let', 'var', 'interface', 'type', 'enum', 'abstract'].includes(m[1])) {
          exports.push(m[1]);
        }
      }
      // export { X, Y }
      const braceRe = /^export\s*\{([^}]+)\}/gm;
      while ((m = braceRe.exec(code)) !== null) {
        const names = m[1].split(',').map(s => {
          const parts = s.trim().split(/\s+as\s+/);
          return (parts[1] || parts[0]).trim();
        }).filter(Boolean);
        exports.push(...names);
      }
    } else if (language === 'python') {
      // __all__ = ['X', 'Y']
      const allRe = /__all__\s*=\s*\[([^\]]+)\]/;
      const allMatch = allRe.exec(code);
      if (allMatch) {
        const names = allMatch[1].match(/['"](\w+)['"]/g);
        if (names) {
          exports.push(...names.map(n => n.replace(/['"]/g, '')));
        }
      }
    }

    return exports;
  },

  extractSymbols(code: string, language: string): CodeSymbol[] {
    const patterns = getPatterns(language);
    if (patterns.length === 0) return [];

    const lines = code.split('\n');
    const symbols: CodeSymbol[] = [];

    for (const { regex, kind } of patterns) {
      // Reset regex state
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(code)) !== null) {
        const name = match[1];
        // Convert character offset to line number (1-based)
        const charsBefore = code.substring(0, match.index);
        const lineStart = charsBefore.split('\n').length;
        const lineEnd = estimateEnd(lines, lineStart - 1); // 0-based for array

        symbols.push({ name, kind, lineStart, lineEnd });
      }
    }

    // Sort by line number
    symbols.sort((a, b) => a.lineStart - b.lineStart);
    return symbols;
  },
};
