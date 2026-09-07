import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger.js';
import { discoverDepFiles } from './depFileDiscovery.js';
import { readDependencyFileContent } from './parsers/utils.js';
import { removeFromTxt, syncVersionInTxt } from './requirementsSync/txtRequirements.js';
import { removeFromToml, syncVersionInToml } from './requirementsSync/tomlRequirements.js';

/** Result type for sync operations, distinguishing success/not-found/unsupported */
export type SyncResult =
  | { outcome: 'synced' }
  | { outcome: 'not-found' }
  | { outcome: 'unsupported'; reason: string };

export class RequirementsSync {
  constructor(private readonly logger: Logger) {}

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Remove a package entry from its requirements file entirely.
   * Routes to the correct format-specific handler based on file extension.
   */
  async removePackage(
    workspaceRoot: string,
    packageName: string,
    sourceFile: string
  ): Promise<SyncResult> {
    const filePath = path.join(workspaceRoot, sourceFile);
    this.logger.info(`[sync] removePackage called: pkg="${packageName}", source="${sourceFile}", resolved="${filePath}", exists=${fs.existsSync(filePath)}`);
    if (!fs.existsSync(filePath)) { return { outcome: 'not-found' }; }

    const ext = this.classifyFile(sourceFile);

    if (ext === 'toml') {
      return removeFromToml(this.logger, filePath, packageName);
    }
    if (ext === 'txt') {
      return removeFromTxt(this.logger, filePath, packageName);
    }

    return {
      outcome: 'unsupported',
      reason: this.unsupportedMessage(sourceFile),
    };
  }

  /**
   * After updating/rolling back a package, update its version pin
   * in the requirements file it came from.
   * Routes to the correct format-specific handler based on file extension.
   */
  async syncVersion(
    workspaceRoot: string,
    packageName: string,
    newVersion: string,
    sourceFile: string
  ): Promise<SyncResult> {
    const filePath = path.join(workspaceRoot, sourceFile);
    this.logger.info(`[sync] syncVersion called: pkg="${packageName}", ver="${newVersion}", source="${sourceFile}", resolved="${filePath}", exists=${fs.existsSync(filePath)}`);
    if (!fs.existsSync(filePath)) { return { outcome: 'not-found' }; }

    const ext = this.classifyFile(sourceFile);

    if (ext === 'toml') {
      return syncVersionInToml(this.logger, filePath, packageName, newVersion);
    }
    if (ext === 'txt') {
      return syncVersionInTxt(this.logger, filePath, packageName, newVersion);
    }

    return {
      outcome: 'unsupported',
      reason: this.unsupportedMessage(sourceFile),
    };
  }

  /**
   * Syncs a package version, falling back to other dependency files when the
   * primary source does not contain a matching line (e.g. -r includes, monorepo paths).
   */
  async syncVersionWithFallback(
    workspaceRoot: string,
    packageName: string,
    newVersion: string,
    primarySource: string
  ): Promise<SyncResult> {
    const primary = await this.syncVersion(workspaceRoot, packageName, newVersion, primarySource);
    if (primary.outcome === 'synced') {
      return primary;
    }

    const tried = new Set<string>([
      path.normalize(primarySource).replace(/\\/g, '/'),
    ]);

    const candidates = discoverDepFiles(workspaceRoot);
    for (const absFile of candidates) {
      const rel = path.relative(workspaceRoot, absFile).replace(/\\/g, '/');
      if (tried.has(rel)) {
        continue;
      }
      tried.add(rel);

      const result = await this.syncVersion(workspaceRoot, packageName, newVersion, rel);
      if (result.outcome === 'synced') {
        this.logger.info(`[sync] fallback synced ${packageName} in ${rel}`);
        return result;
      }
    }

    for (const absFile of this.findIncludedRequirementFiles(workspaceRoot)) {
      const rel = path.relative(workspaceRoot, absFile).replace(/\\/g, '/');
      if (tried.has(rel)) {
        continue;
      }
      tried.add(rel);

      const result = await this.syncVersion(workspaceRoot, packageName, newVersion, rel);
      if (result.outcome === 'synced') {
        this.logger.info(`[sync] fallback synced ${packageName} in included file ${rel}`);
        return result;
      }
    }

    return primary;
  }

  /**
   * Removes a package entry, falling back to other dependency files when the
   * primary source does not contain a matching line (e.g. -r includes, monorepo paths).
   */
  async removePackageWithFallback(
    workspaceRoot: string,
    packageName: string,
    primarySource: string
  ): Promise<SyncResult> {
    const primary = await this.removePackage(workspaceRoot, packageName, primarySource);
    if (primary.outcome === 'synced') {
      return primary;
    }

    const tried = new Set<string>([
      path.normalize(primarySource).replace(/\\/g, '/'),
    ]);

    const candidates = discoverDepFiles(workspaceRoot);
    for (const absFile of candidates) {
      const rel = path.relative(workspaceRoot, absFile).replace(/\\/g, '/');
      if (tried.has(rel)) {
        continue;
      }
      tried.add(rel);

      const result = await this.removePackage(workspaceRoot, packageName, rel);
      if (result.outcome === 'synced') {
        this.logger.info(`[sync] fallback removed ${packageName} from ${rel}`);
        return result;
      }
    }

    for (const absFile of this.findIncludedRequirementFiles(workspaceRoot)) {
      const rel = path.relative(workspaceRoot, absFile).replace(/\\/g, '/');
      if (tried.has(rel)) {
        continue;
      }
      tried.add(rel);

      const result = await this.removePackage(workspaceRoot, packageName, rel);
      if (result.outcome === 'synced') {
        this.logger.info(`[sync] fallback removed ${packageName} from included file ${rel}`);
        return result;
      }
    }

    return primary;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Classifies a dependency file into a sync-strategy bucket.
   */
  private classifyFile(sourceFile: string): 'txt' | 'toml' | 'unsupported' {
    const base = path.basename(sourceFile).toLowerCase();
    if (base.endsWith('.txt') || base.endsWith('.in')) { return 'txt'; }
    if (base === 'pyproject.toml') { return 'toml'; }
    return 'unsupported';
  }

  /**
   * Produces a human-friendly message explaining why sync is not supported for this file type.
   */
  private unsupportedMessage(sourceFile: string): string {
    const base = path.basename(sourceFile);
    return `Automatic sync is not supported for ${base}. Please edit the file manually.`;
  }

  /**
   * Collects requirements.txt / .in files referenced via -r that may be skipped by discovery pruning.
   */
  private findIncludedRequirementFiles(workspaceRoot: string): string[] {
    const found = new Set<string>();

    const scanIncludes = (filePath: string, visited: Set<string>): void => {
      const resolved = path.resolve(filePath);
      if (visited.has(resolved) || !fs.existsSync(resolved)) {
        return;
      }
      visited.add(resolved);

      let content: string;
      try {
        content = readDependencyFileContent(resolved).content;
      } catch {
        return;
      }

      for (const rawLine of content.split('\n')) {
        const line = rawLine.split('#')[0].trim();
        const match = line.match(/^(?:-r|--requirement)\s+(.+)$/);
        if (!match) {
          continue;
        }
        const includeRef = match[1].trim().replace(/^['"]|['"]$/g, '');
        const included = path.resolve(path.dirname(resolved), includeRef);
        if (fs.existsSync(included)) {
          found.add(included);
          scanIncludes(included, visited);
        }
      }
    };

    for (const absFile of discoverDepFiles(workspaceRoot)) {
      scanIncludes(absFile, new Set());
    }

    return [...found];
  }
}
