import * as fs from 'fs';
import * as path from 'path';
import { isDependencyDeclarationFile } from '../depFileDiscovery.js';
import { normalizeName } from './normalize.js';
import { buildImportCandidates } from './packageMatcher.js';

export interface UsageReferenceHit {
  package: string;
  file: string;
  line: number;
  snippet: string;
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.venv', 'venv',
  'env', 'dist', 'build', 'site-packages', '.tox',
  '.mypy_cache', '.pytest_cache', '.eggs', '.ruff_cache',
]);

const SCAN_EXTENSIONS = new Set([
  '.py', '.toml', '.yaml', '.yml', '.json', '.ini', '.cfg',
  '.sh', '.bash', '.zsh', '.ps1', '.md', '.txt', '.env',
]);

const SCAN_DOT_DIRS = new Set(['.github', 'scripts', '.vscode']);

/**
 * Searches non-import contexts (configs, Dockerfiles, scripts) for package references.
 * Helps catch CLI tools, pytest plugins, and runtime deps missed by static import scan.
 */
export class UsageReferenceSearch {
  search(workspaceRoot: string, packageNames: string[]): Map<string, UsageReferenceHit[]> {
    const results = new Map<string, UsageReferenceHit[]>();
    const patterns = this.buildSearchPatterns(packageNames);
    if (patterns.length === 0) {
      return results;
    }

    const files = this.findFiles(workspaceRoot);
    for (const file of files) {
      let content: string;
      try {
        content = fs.readFileSync(file, 'utf-8');
      } catch {
        continue;
      }

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lower = line.toLowerCase();
        for (const { pkg, terms } of patterns) {
          if (terms.some(term => lower.includes(term))) {
            const hits = results.get(pkg) ?? [];
            if (hits.length < 5) {
              hits.push({
                package: pkg,
                file: path.relative(workspaceRoot, file).replace(/\\/g, '/'),
                line: i + 1,
                snippet: line.trim().slice(0, 120),
              });
            }
            results.set(pkg, hits);
          }
        }
      }
    }

    return results;
  }

  private buildSearchPatterns(
    packageNames: string[]
  ): Array<{ pkg: string; terms: string[] }> {
    return packageNames.map(pkg => {
      const norm = normalizeName(pkg);
      const terms = new Set<string>([norm, norm.replace(/-/g, '_'), norm.replace(/-/g, '')]);
      for (const candidate of buildImportCandidates(norm)) {
        terms.add(candidate);
        terms.add(candidate.replace(/\./g, '_'));
      }
      return { pkg: norm, terms: [...terms].filter(t => t.length >= 3) };
    });
  }

  private findFiles(root: string): string[] {
    const results: string[] = [];

    const walk = (dir: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (SKIP_DIRS.has(entry.name)) {
            continue;
          }
          if (entry.name.startsWith('.') && !SCAN_DOT_DIRS.has(entry.name)) {
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
        if (
          SCAN_EXTENSIONS.has(ext) ||
          lowerName === 'dockerfile' ||
          lowerName.startsWith('dockerfile.')
        ) {
          const absPath = path.join(dir, entry.name);
          if (!isDependencyDeclarationFile(absPath)) {
            results.push(absPath);
          }
        }
      }
    };

    walk(root);
    return results;
  }
}
