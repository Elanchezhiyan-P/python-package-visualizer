import * as fs from 'fs';
import * as path from 'path';

export const EVIDENCE_SKIP_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.venv', 'venv',
  'env', 'dist', 'build', 'site-packages', '.tox',
  '.mypy_cache', '.pytest_cache', '.eggs', '.ruff_cache',
]);

export const EVIDENCE_SCAN_DOT_DIRS = new Set(['.github', 'scripts', '.vscode']);

export function walkWorkspaceFiles(
  root: string,
  options: {
    extensions?: Set<string>;
    basename?: (name: string) => boolean;
    dirname?: (name: string) => boolean;
  }
): string[] {
  const results: string[] = [];
  const extensions = options.extensions;
  const basename = options.basename;
  const dirname = options.dirname;

  const walk = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (EVIDENCE_SKIP_DIRS.has(entry.name)) {
          continue;
        }
        if (dirname && !dirname(entry.name)) {
          if (entry.name.startsWith('.') && !EVIDENCE_SCAN_DOT_DIRS.has(entry.name)) {
            continue;
          }
        }
        if (!dirname && entry.name.startsWith('.') && !EVIDENCE_SCAN_DOT_DIRS.has(entry.name)) {
          continue;
        }
        walk(path.join(dir, entry.name));
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const lowerName = entry.name.toLowerCase();
      const ext = path.extname(lowerName);
      const matchesExt = extensions ? extensions.has(ext) : true;
      const matchesBase = basename ? basename(lowerName) : true;
      if (matchesExt && matchesBase) {
        results.push(path.join(dir, entry.name));
      }
    }
  };

  walk(root);
  return results;
}

export function relPath(workspaceRoot: string, file: string): string {
  return path.relative(workspaceRoot, file).replace(/\\/g, '/');
}
