import * as vscode from 'vscode';
import { Logger } from '../utils/logger.js';

export type VersionStatus =
  | 'up-to-date'
  | 'update-available'
  | 'not-installed'
  | 'unknown';

export interface VulnerabilityInfo {
  id: string;
  aliases: string[];
  details: string;
  fixed_in: string[];
}

export interface PyPIPackageInfo {
  name: string;
  latestVersion: string;
  allVersions: string[];
  summary: string;
  homePage: string;
  fetchedAt: number;
  releaseFiles?: Record<string, Array<{ yanked: boolean; upload_time?: string }>>;
  license?: string;
  pythonRequires?: string;
  installSize?: number;
}

export interface VersionCheckResult {
  packageName: string;
  installedVersion: string;
  latestVersion: string;
  status: VersionStatus;
  allVersions: string[];
  summary: string;
  homePage: string;
  vulnerabilities: VulnerabilityInfo[];
  releaseDate?: string;
  license?: string;
  pythonRequires?: string;
  weeklyDownloads?: number;
  installSize?: number;
  pythonCompatible?: boolean;
  pythonWarning?: string;
}

interface PyPIAPIResponse {
  info: {
    name: string;
    version: string;
    summary: string;
    home_page: string;
    project_url: string;
    license?: string;
    requires_python?: string;
  };
  releases: Record<string, Array<{ yanked: boolean; upload_time?: string; size?: number }>>;
  vulnerabilities?: Array<{
    id: string;
    aliases: string[];
    details: string;
    fixed_in: string[];
  }>;
}

// Session-scoped in-memory cache (cleared on extension deactivation)
const pypiCache = new Map<string, PyPIPackageInfo>();

export class VersionChecker {
  private readonly PYPI_BASE = 'https://pypi.org/pypi';
  private readonly CONCURRENCY = 5;
  private currentPythonVersion: string | null = null;

  constructor(
    private readonly logger: Logger,
    _context: vscode.ExtensionContext
  ) {}

  async checkPackage(
    packageName: string,
    installedVersion: string
  ): Promise<VersionCheckResult> {
    const info = await this.fetchPyPIInfo(packageName);

    if (!info) {
      return {
        packageName,
        installedVersion,
        latestVersion: 'unknown',
        status: installedVersion ? 'unknown' : 'not-installed',
        allVersions: [],
        summary: '',
        homePage: '',
        vulnerabilities: [],
      };
    }

    // Fetch vulnerabilities for the installed version if available
    let vulnerabilities: VulnerabilityInfo[] = [];
    if (installedVersion) {
      vulnerabilities = await this.fetchVulnerabilities(packageName, installedVersion);
    }

    // Extract release date for the latest version
    let releaseDate: string | undefined;
    const latestVer = info.latestVersion;
    const releases = info.releaseFiles?.[latestVer];
    if (releases && releases.length > 0) {
      releaseDate = releases[releases.length - 1].upload_time?.split('T')[0] ?? '';
    }

    // Check Python compatibility
    const pythonRequires = info.pythonRequires ?? '';
    let pythonCompatible: boolean | undefined;
    let pythonWarning: string | undefined;

    if (pythonRequires && installedVersion) {
      const currentPython = await this.getPythonVersion();
      if (currentPython) {
        pythonCompatible = this.checkPythonCompatibility(pythonRequires, currentPython);
        if (!pythonCompatible) {
          pythonWarning = `Requires Python ${pythonRequires}, but you have ${currentPython}`;
        }
      }
    }

    return {
      packageName,
      installedVersion,
      latestVersion: info.latestVersion,
      status: this.computeStatus(installedVersion, info.latestVersion),
      allVersions: info.allVersions,
      summary: info.summary,
      homePage: info.homePage,
      vulnerabilities,
      releaseDate,
      license: info.license ?? '',
      pythonRequires: info.pythonRequires ?? '',
      installSize: info.installSize,
      pythonCompatible,
      pythonWarning,
    };
  }

  async checkAll(
    packages: Array<{ name: string; installedVersion: string }>
  ): Promise<VersionCheckResult[]> {
    const results: VersionCheckResult[] = [];

    for (let i = 0; i < packages.length; i += this.CONCURRENCY) {
      const batch = packages.slice(i, i + this.CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(p => this.checkPackage(p.name, p.installedVersion))
      );
      results.push(...batchResults);
    }

    return results;
  }

  clearCache(): void {
    pypiCache.clear();
    this.logger.info('PyPI cache cleared');
  }

  async fetchWeeklyDownloads(packageName: string): Promise<number> {
    const url = `https://pypistats.org/api/packages/${encodeURIComponent(packageName.toLowerCase())}/recent`;
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) { return 0; }
      const data = (await response.json()) as { data?: { last_week?: number } };
      return data.data?.last_week ?? 0;
    } catch {
      return 0;
    }
  }

  private async fetchPyPIInfo(
    packageName: string
  ): Promise<PyPIPackageInfo | null> {
    const config = vscode.workspace.getConfiguration(
      'pythonPackageVisualizer'
    );
    const cacheExpiryMs =
      config.get<number>('cacheExpiryMinutes', 60) * 60_000;

    const cached = pypiCache.get(packageName);
    if (cached && Date.now() - cached.fetchedAt < cacheExpiryMs) {
      this.logger.debug(`Cache hit: ${packageName}`);
      return cached;
    }

    const url = `${this.PYPI_BASE}/${encodeURIComponent(packageName)}/json`;
    this.logger.debug(`Fetching PyPI: ${url}`);

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });

      if (response.status === 404) {
        this.logger.warn(`Not found on PyPI: ${packageName}`);
        return null;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as PyPIAPIResponse;
      const info = this.transformResponse(packageName, data);
      pypiCache.set(packageName, info);
      return info;
    } catch (err) {
      this.logger.error(
        `PyPI fetch failed for ${packageName}: ${String(err)}`
      );
      return null;
    }
  }

  private async fetchVulnerabilities(
    packageName: string,
    version: string
  ): Promise<VulnerabilityInfo[]> {
    const url = `${this.PYPI_BASE}/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}/json`;
    this.logger.debug(`Fetching PyPI vulnerabilities: ${url}`);

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        // Non-fatal — version might not exist on PyPI
        return [];
      }

      const data = (await response.json()) as PyPIAPIResponse;
      if (!data.vulnerabilities || !Array.isArray(data.vulnerabilities)) {
        return [];
      }

      return data.vulnerabilities.map(v => ({
        id: v.id ?? '',
        aliases: Array.isArray(v.aliases) ? v.aliases : [],
        details: v.details ?? '',
        fixed_in: Array.isArray(v.fixed_in) ? v.fixed_in : [],
      }));
    } catch (err) {
      this.logger.warn(
        `Vulnerability fetch failed for ${packageName}@${version}: ${String(err)}`
      );
      return [];
    }
  }

  private transformResponse(
    _packageName: string,
    data: PyPIAPIResponse
  ): PyPIPackageInfo {
    // Filter out yanked releases and sort descending
    const allVersions = Object.keys(data.releases)
      .filter(v => {
        const files = data.releases[v];
        return files.length > 0 && !files.every(f => f.yanked);
      })
      .sort((a, b) => this.compareVersions(b, a));

    // Sum sizes of wheel/sdist files for the latest release
    const latestFiles = data.releases[data.info.version] ?? [];
    const installSize = latestFiles.reduce((sum, f) => sum + (f.size ?? 0), 0) || undefined;

    return {
      name: data.info.name,
      latestVersion: data.info.version,
      allVersions,
      summary: data.info.summary ?? '',
      homePage: data.info.home_page ?? data.info.project_url ?? '',
      fetchedAt: Date.now(),
      releaseFiles: data.releases,
      license: data.info.license ?? '',
      pythonRequires: data.info.requires_python ?? '',
      installSize,
    };
  }

  private computeStatus(
    installed: string,
    latest: string
  ): VersionStatus {
    if (!installed) {
      return 'not-installed';
    }
    if (installed === latest) {
      return 'up-to-date';
    }
    const cmp = this.compareVersions(installed, latest);
    // installed < latest → update available
    // installed >= latest → consider up-to-date (pre-release / local build)
    return cmp < 0 ? 'update-available' : 'up-to-date';
  }

  /**
   * Simplified PEP 440-aware version comparator.
   * Returns negative if a < b, 0 if equal, positive if a > b.
   */
  compareVersions(a: string, b: string): number {
    const normalize = (v: string): number[] =>
      v
        .replace(/[^0-9.]/g, '')
        .split('.')
        .map(Number);

    const pa = normalize(a);
    const pb = normalize(b);
    const len = Math.max(pa.length, pb.length);

    for (let i = 0; i < len; i++) {
      const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
      if (diff !== 0) {
        return diff;
      }
    }
    return 0;
  }

  async getPythonVersion(): Promise<string | null> {
    if (this.currentPythonVersion !== null) {
      return this.currentPythonVersion;
    }

    try {
      const pythonPath = process.platform === 'win32' ? 'python' : 'python3';
      const response = await fetch(`https://api.github.com/repos/python/cpython/releases/latest`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        return null;
      }

      // For now, use a hardcoded approach - try to get from pip show python
      // or return null if unable to detect
      return null;
    } catch {
      return null;
    }
  }

  checkPythonCompatibility(requiresPython: string, currentPython: string): boolean {
    // Parse version strings: e.g., "3.8", ">=3.8", ">=3.8,<4.0"
    const parseVersion = (v: string): [number, number] => {
      const match = v.match(/(\d+)\.(\d+)/);
      return match ? [parseInt(match[1], 10), parseInt(match[2], 10)] : [0, 0];
    };

    const [currentMajor, currentMinor] = parseVersion(currentPython);
    const current = currentMajor * 100 + currentMinor;

    // Parse requirement string
    const constraints = requiresPython.split(',').map(c => c.trim());
    for (const constraint of constraints) {
      // Handle >=X.Y, <=X.Y, ==X.Y, <X.Y, >X.Y, !=X.Y
      if (constraint.match(/^>=/)) {
        const [reqMajor, reqMinor] = parseVersion(constraint);
        const required = reqMajor * 100 + reqMinor;
        if (current < required) {
          return false;
        }
      } else if (constraint.match(/^<=/)) {
        const [reqMajor, reqMinor] = parseVersion(constraint);
        const required = reqMajor * 100 + reqMinor;
        if (current > required) {
          return false;
        }
      } else if (constraint.match(/^==/)) {
        const [reqMajor, reqMinor] = parseVersion(constraint);
        const required = reqMajor * 100 + reqMinor;
        if (current !== required) {
          return false;
        }
      } else if (constraint.match(/^</)) {
        const [reqMajor, reqMinor] = parseVersion(constraint);
        const required = reqMajor * 100 + reqMinor;
        if (current >= required) {
          return false;
        }
      } else if (constraint.match(/^>/)) {
        const [reqMajor, reqMinor] = parseVersion(constraint);
        const required = reqMajor * 100 + reqMinor;
        if (current <= required) {
          return false;
        }
      } else if (constraint.match(/^!=/)) {
        const [reqMajor, reqMinor] = parseVersion(constraint);
        const required = reqMajor * 100 + reqMinor;
        if (current === required) {
          return false;
        }
      }
    }

    return true;
  }
}
