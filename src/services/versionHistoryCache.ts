import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger.js';

export interface VersionHistoryEntry {
  version: string;
  installedAt: string;
  source: 'pip-install' | 'pip-rollback' | 'detected';
  installTime?: number;
}

export interface PackageHistory {
  packageName: string;
  entries: VersionHistoryEntry[];
}

type HistoryFileData = Record<string, PackageHistory>;

export class VersionHistoryCache {
  private readonly storageDir: string;

  constructor(
    context: vscode.ExtensionContext,
    private readonly logger: Logger
  ) {
    this.storageDir = context.globalStorageUri.fsPath;
    this.ensureDir();
  }

  recordVersion(
    workspaceRoot: string,
    packageName: string,
    version: string,
    source: VersionHistoryEntry['source'],
    installTime?: number
  ): void {
    const data = this.readFile(workspaceRoot);
    const normalized = this.normalizeName(packageName);

    if (!data[normalized]) {
      data[normalized] = { packageName: normalized, entries: [] };
    }

    // Avoid duplicate consecutive entries for the same version
    const entries = data[normalized].entries;
    if (
      entries.length > 0 &&
      entries[entries.length - 1].version === version
    ) {
      return;
    }

    entries.push({
      version,
      installedAt: new Date().toISOString(),
      source,
      installTime,
    });

    this.writeFile(workspaceRoot, data);
    this.logger.debug(`History: recorded ${normalized}@${version} (${source})`);
  }

  getHistory(workspaceRoot: string, packageName: string): VersionHistoryEntry[] {
    const normalized = this.normalizeName(packageName);
    return this.readFile(workspaceRoot)[normalized]?.entries ?? [];
  }

  getPreviousVersion(
    workspaceRoot: string,
    packageName: string
  ): string | null {
    const entries = this.getHistory(workspaceRoot, packageName);
    if (entries.length < 2) {
      return null;
    }
    return entries[entries.length - 2].version;
  }

  getAllHistory(workspaceRoot: string): HistoryFileData {
    return this.readFile(workspaceRoot);
  }

  /**
   * Returns all recorded history entries across all packages,
   * sorted by installedAt timestamp descending (newest first).
   */
  getFullHistory(workspaceRoot: string): Array<{ packageName: string } & VersionHistoryEntry> {
    const data = this.readFile(workspaceRoot);
    const all: Array<{ packageName: string } & VersionHistoryEntry> = [];
    for (const [, pkgHistory] of Object.entries(data)) {
      for (const entry of pkgHistory.entries) {
        all.push({ packageName: pkgHistory.packageName, ...entry });
      }
    }
    all.sort((a, b) => b.installedAt.localeCompare(a.installedAt));
    return all;
  }

  clearHistory(workspaceRoot: string): void {
    this.writeFile(workspaceRoot, {});
    this.logger.info('Version history cleared for workspace');
  }

  private getCacheFilePath(workspaceRoot: string): string {
    const hash = this.hashPath(workspaceRoot);
    return path.join(this.storageDir, `history-${hash}.json`);
  }

  private readFile(workspaceRoot: string): HistoryFileData {
    const filePath = this.getCacheFilePath(workspaceRoot);
    try {
      if (!fs.existsSync(filePath)) {
        return {};
      }
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as HistoryFileData;
    } catch (err) {
      this.logger.warn(`Failed to read history cache: ${String(err)}`);
      return {};
    }
  }

  private writeFile(workspaceRoot: string, data: HistoryFileData): void {
    const filePath = this.getCacheFilePath(workspaceRoot);
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      this.logger.error(`Failed to write history cache: ${String(err)}`);
    }
  }

  private ensureDir(): void {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
    } catch (err) {
      this.logger.error(`Failed to create storage dir: ${String(err)}`);
    }
  }

  private normalizeName(name: string): string {
    return name.toLowerCase().replace(/[-_.]+/g, '-');
  }

  /** djb2-based hash for workspace path → unique filename */
  private hashPath(str: string): string {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h) ^ str.charCodeAt(i);
      h = h >>> 0;
    }
    return h.toString(16);
  }
}
