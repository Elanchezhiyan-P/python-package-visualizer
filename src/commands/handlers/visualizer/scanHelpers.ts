import * as fs from 'fs';
import { hasDrift, isUpdateSuppressedByIgnore } from '../../../utils/version.js';
import { discoverDepFiles } from '../../../modules/depFileDiscovery.js';
import type { ScannedPackage, WorkspaceScanResult } from '../../../modules/packageScanner.js';
import type { VersionCheckResult } from '../../../services/versionChecker.js';
import type { ScanStats } from '../../../ui/webviewPanel.js';
import type * as vscode from 'vscode';

function normalizePackageName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

/** Deduplicates scanned packages by normalized name and source path. */
export function dedupeScannedPackages(packages: ScannedPackage[]): ScannedPackage[] {
  const unique: ScannedPackage[] = [];
  const seen = new Set<string>();
  for (const p of packages) {
    const key = `${p.name.toLowerCase()}::${p.source}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(p);
    }
  }
  return unique;
}

export function mergeWorkspaceScans(results: WorkspaceScanResult[]): {
  packages: ScannedPackage[];
  transitivePackages: ScannedPackage[];
} {
  const packages: ScannedPackage[] = [];
  const transitivePackages: ScannedPackage[] = [];
  const seenDeclared = new Set<string>();
  const seenTransitive = new Set<string>();

  for (const result of results) {
    for (const pkg of result.packages) {
      const key = `${pkg.name.toLowerCase()}::${pkg.source}`;
      if (!seenDeclared.has(key)) {
        seenDeclared.add(key);
        packages.push(pkg);
      }
    }
    for (const pkg of result.transitivePackages) {
      const key = pkg.name.toLowerCase();
      if (!seenTransitive.has(key)) {
        seenTransitive.add(key);
        transitivePackages.push(pkg);
      }
    }
  }

  return { packages, transitivePackages };
}

export function applyDriftStatus(
  scanned: ScannedPackage[],
  checkResults: VersionCheckResult[]
): void {
  const scannedMap = new Map(scanned.map(p => [p.name.toLowerCase(), p]));
  for (const r of checkResults) {
    const pkg = scannedMap.get(r.packageName.toLowerCase());
    if (
      !pkg?.specifiedVersion ||
      !pkg.installedVersion ||
      !hasDrift(pkg.specifiedVersion, pkg.installedVersion)
    ) {
      continue;
    }
    // Preserve update-available / conflict-blocked; only promote up-to-date → drift
    // for the status badge. hasVersionDrift on display data covers the rest.
    if (r.status === 'up-to-date') {
      r.status = 'drift';
    }
  }
}

export function getActionableUpdates(
  scanned: ScannedPackage[],
  checkResults: VersionCheckResult[],
  ignoredUpdates?: Map<string, string>
): VersionCheckResult[] {
  const conflicted = new Set(
    scanned.filter(p => p.hasConflict).map(p => normalizePackageName(p.name))
  );
  return checkResults.filter(r => {
    if (r.status !== 'update-available') {
      return false;
    }
    const norm = normalizePackageName(r.packageName);
    if (conflicted.has(norm)) {
      return false;
    }
    const ignored = ignoredUpdates?.get(norm);
    if (ignored && isUpdateSuppressedByIgnore(ignored, r.latestVersion)) {
      return false;
    }
    return true;
  });
}

export function countActionableUpdates(
  scanned: ScannedPackage[],
  checkResults: VersionCheckResult[],
  ignoredUpdates?: Map<string, string>
): number {
  return getActionableUpdates(scanned, checkResults, ignoredUpdates).length;
}

/** Same rules as countActionableUpdates for a single check result. */
export function isActionableUpdate(
  result: VersionCheckResult,
  hasConflict: boolean,
  ignoredVersion?: string
): boolean {
  if (result.status !== 'update-available' || hasConflict) {
    return false;
  }
  if (ignoredVersion && isUpdateSuppressedByIgnore(ignoredVersion, result.latestVersion)) {
    return false;
  }
  return true;
}

export function resolveDetectedDepFilePaths(
  context: vscode.ExtensionContext,
  roots: string[]
): string[] {
  const manualPath = context.workspaceState.get<string>(
    'pythonPackageVisualizer.manualRequirementsPath'
  );
  const manual = manualPath && fs.existsSync(manualPath) ? manualPath : undefined;
  return [...new Set(
    roots.flatMap(r => discoverDepFiles(r, { manualPath: manual }))
  )].sort();
}

export function buildScanStats(params: {
  totalFilesScanned: number;
  mergedImportedModules: Set<string>;
  root: string;
  checkResults: VersionCheckResult[];
  manualRequirementsPath?: string;
  detectedDepFilePaths: string[];
}): ScanStats {
  const {
    totalFilesScanned,
    mergedImportedModules,
    root,
    checkResults,
    manualRequirementsPath,
    detectedDepFilePaths,
  } = params;

  const totalSize = checkResults.reduce((sum, r) => sum + (r.installSize ?? 0), 0);
  const totalDl = checkResults.reduce((sum, r) => sum + (r.weeklyDownloads ?? 0), 0);
  const vulnPkgs = checkResults.filter(r => r.vulnerabilities && r.vulnerabilities.length > 0).length;
  const securityScore = checkResults.length > 0
    ? ((checkResults.length - vulnPkgs) / checkResults.length) * 100
    : 100;

  return {
    filesScanned: totalFilesScanned,
    modulesFound: mergedImportedModules.size,
    workspaceRoot: root,
    totalSize,
    totalDownloads: totalDl,
    securityScore,
    maintainerActivityScore: 75,
    slowestPackages: [],
    manualRequirementsPath,
    detectedDepFilePaths,
  };
}
