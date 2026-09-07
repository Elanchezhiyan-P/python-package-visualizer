import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../../utils/logger.js';
import { ImportExtractor } from './extractor.js';

export interface ImportScanResult {
  /** Top-level module names AND dotted sub-names for namespace packages */
  importedModules: Set<string>;
  filesScanned: number;
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.venv', 'venv',
  'env', '.env', 'dist', 'build', 'site-packages', '.tox',
  '.mypy_cache', '.pytest_cache', '.eggs', '.ruff_cache',
]);

/** Dot-directories that may contain project Python scripts. */
const SCAN_DOT_DIRS = new Set(['.github', 'scripts']);

/**
 * Scans Python files in a workspace and extracts imported module names.
 */
export class FileImportScanner {
  private readonly extractor = new ImportExtractor();

  constructor(private readonly logger: Logger) {}

  async scan(workspaceRoot: string): Promise<ImportScanResult> {
    this.logger.info(`Scanning imports in: ${workspaceRoot}`);
    const pyFiles = this.findPyFiles(workspaceRoot);
    this.logger.info(`Found ${pyFiles.length} Python files to scan`);

    const importedModules = new Set<string>();

    for (const file of pyFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        for (const mod of this.extractor.extract(content)) {
          importedModules.add(mod);
        }
      } catch (err) {
        this.logger.warn(`Could not read ${file}: ${String(err)}`);
      }
    }

    this.logger.info(
      `Import scan complete: ${importedModules.size} unique modules found`
    );
    return { importedModules, filesScanned: pyFiles.length };
  }

  private findPyFiles(root: string): string[] {
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
        } else if (entry.isFile() && entry.name.endsWith('.py')) {
          results.push(path.join(dir, entry.name));
        }
      }
    };

    walk(root);
    return results;
  }
}
