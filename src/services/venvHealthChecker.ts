import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { detectVenvType, findDuplicates, normalizePackageName } from './venvLayout.js';

/** Individual installed package entry from pip list. */
export interface InstalledPackageEntry {
  name: string;
  version: string;
  /** Latest version available on PyPI, set only when it differs from installed. */
  latestVersion?: string;
  /** On-disk footprint in bytes (site-packages files belonging to this distribution). */
  diskSizeBytes?: number;
}

/** Diagnostic report describing the virtual environment health. */
export interface VenvHealthReport {
  pythonVersion: string;
  pipVersion: string;
  pipUpToDate: boolean;
  pipLatestVersion: string;
  venvType: 'venv' | 'virtualenv' | 'conda' | 'system' | 'unknown';
  venvPath: string;
  isVenvActive: boolean;
  totalInstalled: number;
  /** Total bytes used under site-packages (real disk footprint). */
  sitePackagesSizeBytes: number;
  /** Full list of installed packages with their versions. */
  installedPackages: InstalledPackageEntry[];
  duplicatePackages: Array<{ name: string; versions: string[] }>;
  sitePackagesPath: string;
}

/**
 * Runs shell diagnostics against the active Python environment to produce
 * a health report covering interpreter version, pip status, duplicates, and venv type.
 */
export class VenvHealthChecker {
  constructor(
    private readonly resolvePythonPath: () => string) { }

  /** Executes all diagnostic checks and returns a consolidated report. */
  async checkHealth(cwd: string): Promise<VenvHealthReport> {
    const [
      pythonInfo,
      pipInfo,
      installedPackages,
      outdatedMap,
    ] = await Promise.all([
      this.getPythonInfo(cwd),
      this.getPipInfo(cwd),
      this.getInstalledPackages(cwd),
      this.getOutdatedPackages(cwd),
    ]);

    // Merge latest version info into installed packages
    for (const pkg of installedPackages) {
      const latest = outdatedMap.get(pkg.name.toLowerCase());
      if (latest && latest !== pkg.version) {
        pkg.latestVersion = latest;
      }
    }

    const duplicatePackages = findDuplicates(installedPackages);
    const venvInfo = detectVenvType(cwd, pythonInfo.sysPrefix, pythonInfo.basePrefix);

    const sitePackagesPath = await this.getSitePackagesPath(cwd, pipInfo.location);
    const [sitePackagesSizeBytes, packageDiskSizes] = await Promise.all([
      this.computeDirectorySize(sitePackagesPath),
      this.getPackageDiskSizes(cwd),
    ]);

    for (const pkg of installedPackages) {
      const diskSize = packageDiskSizes.get(normalizePackageName(pkg.name));
      if (diskSize !== undefined && diskSize > 0) {
        pkg.diskSizeBytes = diskSize;
      }
    }

    // Check if pip is up-to-date by comparing versions
    const pipUpToDate = pipInfo.latestVersion
      ? pipInfo.version === pipInfo.latestVersion
      : true; // Assume up-to-date if we can't check

    return {
      pythonVersion: pythonInfo.version,
      pipVersion: pipInfo.version,
      pipUpToDate,
      pipLatestVersion: pipInfo.latestVersion,
      venvType: venvInfo.type,
      venvPath: venvInfo.path,
      isVenvActive: venvInfo.isActive,
      totalInstalled: installedPackages.length,
      sitePackagesSizeBytes,
      installedPackages,
      duplicatePackages,
      sitePackagesPath,
    };
  }

  /** Resolves the site-packages root via sysconfig, falling back to pip's install path. */
  private getSitePackagesPath(cwd: string, pipLocation: string): Promise<string> {
    const pythonPath = this.resolvePythonPath();
    const script = 'import sysconfig; print(sysconfig.get_path("purelib"))';

    return new Promise(resolve => {
      const child = cp.spawn(pythonPath, ['-c', script], { cwd });
      let stdout = '';
      const timer = setTimeout(() => {
        child.kill();
        resolve(this.fallbackSitePackagesPath(pipLocation));
      }, 10_000);

      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.on('close', () => {
        clearTimeout(timer);
        const resolved = stdout.trim();
        resolve(resolved && fs.existsSync(resolved)
          ? resolved
          : this.fallbackSitePackagesPath(pipLocation));
      });
      child.on('error', () => {
        clearTimeout(timer);
        resolve(this.fallbackSitePackagesPath(pipLocation));
      });
    });
  }

  private fallbackSitePackagesPath(pipLocation: string): string {
    if (!pipLocation) {
      return '';
    }
    if (path.basename(pipLocation).toLowerCase() === 'pip') {
      const parent = path.dirname(pipLocation);
      if (fs.existsSync(parent)) {
        return parent;
      }
    }
    return fs.existsSync(pipLocation) ? pipLocation : '';
  }

  /** Recursively sums file sizes under a directory. */
  private async computeDirectorySize(dirPath: string): Promise<number> {
    if (!dirPath || !fs.existsSync(dirPath)) {
      return 0;
    }

    let total = 0;
    const stack = [dirPath];

    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) {
        continue;
      }

      let entries;
      try {
        entries = await fs.promises.readdir(current, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        try {
          if (entry.isDirectory()) {
            stack.push(fullPath);
          } else if (entry.isFile()) {
            total += (await fs.promises.stat(fullPath)).size;
          }
        } catch {
          // Skip unreadable paths (symlinks, permissions, race conditions).
        }
      }
    }

    return total;
  }

  /**
   * Computes per-distribution on-disk sizes using importlib.metadata
   * (RECORD / installed file list when available).
   */
  private getPackageDiskSizes(cwd: string): Promise<Map<string, number>> {
    const pythonPath = this.resolvePythonPath();
    const script = `
import json, os
from importlib.metadata import distributions

def size_of_path(path):
    try:
        if path.is_file():
            return path.stat().st_size
        if path.is_dir():
            total = 0
            for root, _, files in os.walk(path):
                for name in files:
                    try:
                        total += os.path.getsize(os.path.join(root, name))
                    except OSError:
                        pass
            return total
    except OSError:
        pass
    return 0

def dist_size(dist):
    total = 0
    try:
        files = dist.files
        if files is not None:
            for entry in files:
                total += size_of_path(dist.locate_file(entry))
            return total
    except Exception:
        pass

    try:
        record = dist.locate_file("RECORD")
        site_root = record.parent.parent
        for line in record.read_text(encoding="utf-8").splitlines():
            rel = line.split(",")[0]
            if rel:
                total += size_of_path(site_root / rel.replace("/", os.sep))
    except Exception:
        pass
    return total

result = []
for dist in distributions():
    name = (dist.metadata.get("Name") or getattr(dist, "name", "") or "").strip()
    if name:
        result.append({"name": name, "size": dist_size(dist)})
print(json.dumps(result))
`.trim();

    return new Promise(resolve => {
      const child = cp.spawn(pythonPath, ['-c', script], { cwd });
      let stdout = '';
      const timer = setTimeout(() => {
        child.kill();
        resolve(new Map());
      }, 45_000);

      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.on('close', () => {
        clearTimeout(timer);
        try {
          const entries = JSON.parse(stdout) as Array<{ name: string; size: number }>;
          const map = new Map<string, number>();
          for (const entry of entries) {
            if (entry.size > 0) {
              map.set(normalizePackageName(entry.name), entry.size);
            }
          }
          resolve(map);
        } catch {
          resolve(new Map());
        }
      });
      child.on('error', () => {
        clearTimeout(timer);
        resolve(new Map());
      });
    });
  }

  private getPythonInfo(cwd: string): Promise<{ version: string; sysPrefix: string; basePrefix: string }> {
    const pythonPath = this.resolvePythonPath();
    const script = 'import sys; print(sys.version.split()[0]); print(sys.prefix); print(getattr(sys, "base_prefix", sys.prefix))';

    return new Promise(resolve => {
      const child = cp.spawn(pythonPath, ['-c', script], { cwd });
      let stdout = '';
      const timer = setTimeout(() => { child.kill(); resolve({ version: 'unknown', sysPrefix: '', basePrefix: '' }); }, 10_000);

      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.on('close', () => {
        clearTimeout(timer);
        const lines = stdout.trim().split('\n').map(l => l.trim());
        resolve({
          version: lines[0] || 'unknown',
          sysPrefix: lines[1] || '',
          basePrefix: lines[2] || '',
        });
      });
      child.on('error', () => { clearTimeout(timer); resolve({ version: 'unknown', sysPrefix: '', basePrefix: '' }); });
    });
  }

  private getPipInfo(cwd: string): Promise<{ version: string; location: string; latestVersion: string }> {
    const pythonPath = this.resolvePythonPath();

    return new Promise(resolve => {
      const child = cp.spawn(pythonPath, ['-m', 'pip', '--version'], { cwd });
      let stdout = '';
      const timer = setTimeout(() => { child.kill(); resolve({ version: 'unknown', location: '', latestVersion: '' }); }, 10_000);

      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.on('close', () => {
        clearTimeout(timer);
        // Output: "pip 23.2.1 from /path/to/site-packages/pip (python 3.11)"
        const match = stdout.match(/^pip\s+(\S+)\s+from\s+(.+?)\s+\(python/i);
        const version = match ? match[1] : 'unknown';
        const location = match ? match[2].trim() : '';

        // Try to get the latest pip version via a lightweight check
        this.getLatestPipVersion(cwd).then(latestVersion => {
          resolve({ version, location, latestVersion });
        }).catch(() => {
          resolve({ version, location, latestVersion: '' });
        });
      });
      child.on('error', () => { clearTimeout(timer); resolve({ version: 'unknown', location: '', latestVersion: '' }); });
    });
  }

  private getLatestPipVersion(cwd: string): Promise<string> {
    const pythonPath = this.resolvePythonPath();

    return new Promise(resolve => {
      const child = cp.spawn(pythonPath, ['-m', 'pip', 'index', 'versions', 'pip'], { cwd });
      let stdout = '';
      const timer = setTimeout(() => { child.kill(); resolve(''); }, 10_000);

      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.on('close', () => {
        clearTimeout(timer);
        // Output: "pip (24.0)\n  Available versions: 24.0, 23.3.2, ..."
        const match = stdout.match(/^pip\s+\((\S+)\)/m);
        resolve(match ? match[1] : '');
      });
      child.on('error', () => { clearTimeout(timer); resolve(''); });
    });
  }

  private getInstalledPackages(cwd: string): Promise<InstalledPackageEntry[]> {
    const pythonPath = this.resolvePythonPath();

    return new Promise(resolve => {
      const child = cp.spawn(pythonPath, ['-m', 'pip', 'list', '--format=json'], { cwd });
      let stdout = '';
      const timer = setTimeout(() => { child.kill(); resolve([]); }, 15_000);

      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.on('close', () => {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(stdout) as InstalledPackageEntry[]);
        } catch {
          resolve([]);
        }
      });
      child.on('error', () => { clearTimeout(timer); resolve([]); });
    });
  }

  /**
   * Fetches outdated packages via `pip list --outdated`.
   * Returns a Map of normalized name → latest_version.
   */
  private getOutdatedPackages(cwd: string): Promise<Map<string, string>> {
    const pythonPath = this.resolvePythonPath();

    return new Promise(resolve => {
      const child = cp.spawn(pythonPath, ['-m', 'pip', 'list', '--outdated', '--format=json'], { cwd });
      let stdout = '';
      const timer = setTimeout(() => { child.kill(); resolve(new Map()); }, 30_000);

      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.on('close', () => {
        clearTimeout(timer);
        try {
          const entries = JSON.parse(stdout) as Array<{ name: string; version: string; latest_version: string }>;
          const map = new Map<string, string>();
          for (const e of entries) {
            map.set(e.name.toLowerCase(), e.latest_version);
          }
          resolve(map);
        } catch {
          resolve(new Map());
        }
      });
      child.on('error', () => { clearTimeout(timer); resolve(new Map()); });
    });
  }
}
