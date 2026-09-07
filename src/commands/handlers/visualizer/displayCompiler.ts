import { ScannedPackage, sanitizeRequiresList } from '../../../modules/packageScanner.js';
import { UnusedPackageInfo, UnusedConfidenceContext } from '../../../modules/importScanner.js';
import { VersionCheckResult } from '../../../services/versionChecker.js';
import type { PackageDisplayData, HistoryDisplayEntry, GraphPackageInfo } from '../../../ui/webviewPanel.js';
import type { VersionHistoryEntry } from '../../../services/versionHistoryCache.js';
import type { VersionHistoryCache } from '../../../services/versionHistoryCache.js';
import { getAlternatives } from '../../../data/alternativesMap.js';
import { hasDrift } from '../../../utils/version.js';
import { isUpdateIgnoredForDisplay } from '../../../services/ignoredUpdates.js';
import type { PinnedPackageEntry } from '../../../services/pinnedPackages.js';

const normalize = (name: string) => name.toLowerCase().replace(/[-_.]+/g, '-');

/** Flattened history row shape returned by VersionHistoryCache.getFullHistory() */
type FlatHistoryEntry = { packageName: string } & VersionHistoryEntry;

/**
 * Builds display payload and attaches rollback version history when available.
 */
export function buildEnrichedDisplayData(
  scanned: ScannedPackage[],
  checkResults: VersionCheckResult[],
  workspaceRoot: string,
  history: VersionHistoryCache,
  unusedPackages?: Set<string> | Map<string, UnusedPackageInfo>,
  manualUsedPackages?: Set<string>,
  ignoredUpdates?: Map<string, string>,
  pinnedPackages?: Map<string, PinnedPackageEntry>
): PackageDisplayData[] {
  return buildDisplayData(
    scanned,
    checkResults,
    unusedPackages,
    manualUsedPackages,
    ignoredUpdates,
    pinnedPackages
  ).map(pkg => ({
    ...pkg,
    previousVersion: history.getPreviousVersion(workspaceRoot, pkg.name),
    installTime: history.getLatestInstallTime(workspaceRoot, pkg.name),
  }));
}

/**
 * Builds history entries payload from raw cache database models.
 * Separates internal entity definitions from visual timeline layouts.
 * 
 * @param {FlatHistoryEntry[]} allEntries - Flattened history rows from cached storage.
 * @returns {HistoryDisplayEntry[]} Transformed entries for the timeline display.
 */
export function buildHistoryEntries(allEntries: FlatHistoryEntry[]): HistoryDisplayEntry[] {
  return allEntries.map(e => ({
    packageName: e.packageName,
    version: e.version,
    installedAt: e.installedAt,
    source: e.source,
  }));
}

/**
 * Aggregates package scan results and PyPI online checker metrics into a unified payload for UI display.
 * Resolves local directories, group tags, copyleft check results, weekly downloads, and suggests alternatives.
 * 
 * @param {ScannedPackage[]} scanned - Package list fetched locally from requirement files.
 * @param {VersionCheckResult[]} checkResults - Check results queried online from PyPI.
 * @param {Set<string> | Map<string, UnusedPackageInfo>} [unusedPackages] - Scanned unused modules map.
 * @returns {PackageDisplayData[]} The unified layout payload.
 */
export function buildDisplayData(
  scanned: ScannedPackage[],
  checkResults: VersionCheckResult[],
  unusedPackages?: Set<string> | Map<string, UnusedPackageInfo>,
  manualUsedPackages?: Set<string>,
  ignoredUpdates?: Map<string, string>,
  pinnedPackages?: Map<string, PinnedPackageEntry>
): PackageDisplayData[] {
  const resultMap = new Map(checkResults.map(r => [r.packageName, r]));
  const isEnriched = unusedPackages instanceof Map;
  
  return scanned.map(pkg => {
    const result = resultMap.get(pkg.name);
    const normName = normalize(pkg.name);

    let status: string = result?.status ?? 'unknown';
    const updateBlockedByConflict =
      Boolean(pkg.hasConflict) && status === 'update-available';
    if (updateBlockedByConflict) {
      status = 'conflict-blocked';
    }

    const ignoredVersion = ignoredUpdates?.get(normName);
    let ignoredUpdateVersion: string | undefined;
    if (
      status === 'update-available' &&
      isUpdateIgnoredForDisplay(ignoredVersion, result?.latestVersion ?? 'unknown')
    ) {
      ignoredUpdateVersion = ignoredVersion;
      status = 'update-ignored';
    }

    const hasVersionDrift = Boolean(
      pkg.specifiedVersion &&
      pkg.installedVersion &&
      hasDrift(pkg.specifiedVersion, pkg.installedVersion)
    );

    let isUsed = true;
    let unusedConfidence: number | undefined;
    let unusedReasons: string[] | undefined;
    let usageVerdict: PackageDisplayData['usageVerdict'];
    let usageEvidence: PackageDisplayData['usageEvidence'];
    let manuallyMarkedUsed = false;

    if (manualUsedPackages?.has(normName)) {
      isUsed = true;
      manuallyMarkedUsed = true;
    } else if (unusedPackages) {
      if (isEnriched) {
        const info = (unusedPackages as Map<string, UnusedPackageInfo>).get(normName);
        if (info) {
          isUsed = false;
          unusedConfidence = info.confidence;
          unusedReasons = info.reasons;
          usageVerdict = info.verdict;
          usageEvidence = info.usageEvidence;
        }
      } else {
        isUsed = !(unusedPackages as Set<string>).has(normName);
      }
    }

    return {
      name: pkg.name,
      installedVersion: pkg.installedVersion,
      latestVersion: result?.latestVersion ?? 'unknown',
      status,
      hasVersionDrift,
      allVersions: result?.allVersions ?? [],
      summary: result?.summary ?? '',
      homePage: result?.homePage ?? '',
      specifiedVersion: pkg.specifiedVersion,
      source: pkg.source,
      requires: sanitizeRequiresList(pkg.requires),
      isUsed,
      manuallyMarkedUsed,
      unusedConfidence,
      unusedReasons,
      usageVerdict,
      usageEvidence,
      vulnerabilities: result?.vulnerabilities ?? [],
      releaseDate: result?.releaseDate ?? '',
      group: pkg.group ?? 'main',
      license: result?.license ?? '',
      pythonRequires: result?.pythonRequires ?? '',
      weeklyDownloads: result?.weeklyDownloads ?? 0,
      environment: pkg.environment,
      hasConflict: pkg.hasConflict ?? false,
      updateBlockedByConflict,
      pythonCompatible: result?.pythonCompatible,
      pythonWarning: result?.pythonWarning,
      installSize: result?.installSize,
      alternatives: getAlternatives(pkg.name),
      ignoredUpdateVersion,
      pinnedVersion: pinnedPackages?.get(normName)?.version,
    };
  });
}

/**
 * Builds the context object required by the confidence scoring algorithm.
 * Aggregates requires/downloads/group data from scanned packages and check results.
 * 
 * @param {ScannedPackage[]} scanned - Package list fetched locally from requirement files.
 * @param {VersionCheckResult[]} checkResults - Check results queried online from PyPI.
 * @returns {UnusedConfidenceContext} Consolidated metadata mapping.
 */
export function buildConfidenceContext(
  scanned: ScannedPackage[],
  checkResults: VersionCheckResult[],
  extraImportCandidates?: Map<string, Set<string>>
): UnusedConfidenceContext {
  const requiresMap = new Map<string, string[]>();
  const groupMap = new Map<string, string>();
  for (const pkg of scanned) {
    const norm = normalize(pkg.name);
    requiresMap.set(norm, sanitizeRequiresList(pkg.requires));
    groupMap.set(norm, pkg.group ?? 'main');
  }

  const downloadsMap = new Map<string, number>();
  for (const r of checkResults) {
    if (r.weeklyDownloads && r.weeklyDownloads > 0) {
      downloadsMap.set(normalize(r.packageName), r.weeklyDownloads);
    }
  }

  return { requiresMap, downloadsMap, groupMap, extraImportCandidates };
}

/**
 * Builds minimal graph lookup entries for transitive installed packages.
 *
 * @param {ScannedPackage[]} transitive - Transitive packages from pip show BFS.
 * @returns {GraphPackageInfo[]} Payload for webview graph rendering.
 */
export function buildGraphPackages(transitive: ScannedPackage[]): GraphPackageInfo[] {
  return transitive.map(pkg => ({
    name: pkg.name,
    installedVersion: pkg.installedVersion,
    requires: sanitizeRequiresList(pkg.requires),
    status: pkg.installedVersion ? 'unknown' : 'not-installed',
    vulnerabilities: [],
  }));
}
