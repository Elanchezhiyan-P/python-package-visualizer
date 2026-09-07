import { NAMESPACE_PREFIXES } from './maps.js';

const DYNAMIC_IMPORT_PATTERNS = [
  /importlib\.import_module\s*\(\s*['"]([^'"]+)['"]/g,
  /importlib\.__import__\s*\(\s*['"]([^'"]+)['"]/g,
  /__import__\s*\(\s*['"]([^'"]+)['"]/g,
];

/**
 * Extracts Python import module names from source text.
 * Handles multiline parenthesized imports and common dynamic import patterns.
 */
export class ImportExtractor {
  extract(source: string): Set<string> {
    const modules = new Set<string>();
    const unfolded = this.unfoldParenthesizedImports(this.stripCommentsAndDocstrings(source));

    for (const line of unfolded.split('\n')) {
      this.extractFromLine(line.trim(), modules);
    }

    this.extractDynamicImports(source, modules);
    return modules;
  }

  private stripCommentsAndDocstrings(source: string): string {
    return source
      .replace(/"""[\s\S]*?"""/g, '""')
      .replace(/'''[\s\S]*?'''/g, "''")
      .replace(/#.*/g, '');
  }

  /** `import (foo, bar)` and `from x import (a, b)` → single-line form */
  private unfoldParenthesizedImports(source: string): string {
    return source.replace(
      /^(import|from\s+[^\s]+\s+import)\s*\(([\s\S]*?)\)/gm,
      (_, header: string, body: string) => {
        const names = body
          .split(/[\n,]/)
          .map(part => part.trim())
          .filter(part => part && !part.startsWith('#'))
          .join(', ');
        return `${header} ${names}`;
      }
    );
  }

  private extractFromLine(trimmed: string, out: Set<string>): void {
    if (!trimmed) {
      return;
    }

    const importMatch = trimmed.match(/^import\s+(.+)/);
    if (importMatch) {
      for (const part of importMatch[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/i)[0].trim().toLowerCase();
        if (name && name !== '(') {
          this.addModuleName(name, out);
        }
      }
      return;
    }

    const fromMatch = trimmed.match(/^from\s+([^\s]+)\s+import/);
    if (fromMatch) {
      const name = fromMatch[1].trim().toLowerCase();
      if (!name.startsWith('.')) {
        this.addModuleName(name, out);
      }
    }
  }

  private extractDynamicImports(source: string, out: Set<string>): void {
    for (const pattern of DYNAMIC_IMPORT_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        this.addModuleName(match[1].toLowerCase(), out);
      }
    }
  }

  private addModuleName(name: string, out: Set<string>): void {
    const top = name.split('.')[0];
    if (!top || top.startsWith('_')) {
      return;
    }

    out.add(name);
    out.add(top);

    if (NAMESPACE_PREFIXES.has(top) && name.includes('.')) {
      const parts = name.split('.');
      if (parts.length >= 2) {
        out.add(`${parts[0]}.${parts[1]}`);
      }
      if (parts.length >= 3) {
        out.add(`${parts[0]}.${parts[1]}.${parts[2]}`);
      }
    }
  }
}
