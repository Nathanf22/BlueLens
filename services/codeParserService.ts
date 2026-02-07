/**
 * Regex-based symbol extraction for code files.
 * Used to help users pick line ranges when creating code links.
 */

import { CodeSymbol } from '../types';

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

export const codeParserService = {
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
