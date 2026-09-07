import * as vscode from 'vscode';
import type { Logger } from '../../../utils/logger.js';
import type { PackageScanner, ScannedPackage } from '../../../modules/packageScanner.js';
import type { ImportScanner, UnusedPackageInfo } from '../../../modules/importScanner.js';
import type { VersionChecker, VersionCheckResult } from '../../../services/versionChecker.js';
import type { VersionHistoryCache } from '../../../services/versionHistoryCache.js';
import type { WebviewPanel, ScanStats, PackageEnrichment } from '../../../ui/webviewPanel.js';
import type { SidebarProvider } from '../../../ui/sidebarProvider.js';
import type { GraphPackageInfo, DepFilesEmptyState } from '../../../ui/webviewTypes.js';
import type { PypiTopLevelCache } from '../../../modules/usageEvidence/pypiTopLevelCache.js';
import type { UsageReferenceSearch } from '../../../modules/import/usageReferenceSearch.js';
import {
  buildEnrichedDisplayData,
  buildConfidenceContext,
  buildHistoryEntries,
  buildGraphPackages,
} from './displayCompiler.js';
import {
  applyDriftStatus,
  buildScanStats,
  countActionableUpdates,
  dedupeScannedPackages,
  mergeWorkspaceScans,
  resolveDetectedDepFilePaths,
} from './scanHelpers.js';
import { getManualUsedPackages } from '../../../services/manualUsedPackages.js';
import { getIgnoredUpdates } from '../../../services/ignoredUpdates.js';
import { getPinnedPackages } from '../../../services/pinnedPackages.js';

/**
 * Collaborators for the workspace scan pipeline (`showVisualizer`).
 * Distinct from VisualizerUpdateContext: this includes scanGeneration,
 * workspaceState, PyPI top-level cache, and panel delivery helpers.
 */
export interface VisualizerScanContext {
  logger: Logger;
  scanner: PackageScanner;
  checker: VersionChecker;
  history: VersionHistoryCache;
  panel: WebviewPanel;
  importScanner: ImportScanner;
  sidebar?: SidebarProvider;
  context: vscode.ExtensionContext;
  pypiTopLevelCache: PypiTopLevelCache;
  referenceSearch: UsageReferenceSearch;
  getWorkspaceRoot(): string | null;
  getAllWorkspaceRoots(): string[];
  packageEnrichment(root: string): PackageEnrichment;
  deliverPackagesToPanel(
    scanned: ScannedPackage[],
    checkResults: VersionCheckResult[],
    unusedPackages: Map<string, UnusedPackageInfo> | undefined,
    scanStats: ScanStats,
    enrich: PackageEnrichment,
    graphPackages: GraphPackageInfo[]
  ): void;
  sendEmptyDepFilesState(state: DepFilesEmptyState): void;
  updateStatusBar(checkResults: VersionCheckResult[], scanned?: ScannedPackage[]): void;
  getScanGeneration(): number;
  bumpScanGeneration(): number;
  setLastPackages(packages: ScannedPackage[]): void;
  setLastCheckResults(results: VersionCheckResult[]): void;
  setLastGraphPackages(packages: GraphPackageInfo[]): void;
  setLastUnusedPackages(unused: Map<string, UnusedPackageInfo> | undefined): void;
  setLastImportedModules(modules: Set<string>): void;
  setLastFilesScanned(count: number): void;
}

/**
 * Scans the active workspace dependencies and queries PyPI, loading results
 * into the primary webview panel and sidebar dashboards.
 */
export async function runWorkspaceScan(ctx: VisualizerScanContext): Promise<void> {
  const root = ctx.getWorkspaceRoot();
  if (!root) {
    void vscode.window.showWarningMessage(
      'Python Package Visualizer: No workspace folder open.'
    );
    return;
  }

  ctx.panel.show();
  ctx.panel.sendProgress('Scanning workspace...');
  ctx.sidebar?.sendProgress('Scanning workspace...');

  const scanGeneration = ctx.bumpScanGeneration();

  try {
    const roots = ctx.getAllWorkspaceRoots();
    const [scanMerged, importResults] = await Promise.all([
      Promise.all(roots.map(r => ctx.scanner.scanWorkspace(r))).then(results =>
        mergeWorkspaceScans(results)
      ),
      Promise.all(roots.map(r => ctx.importScanner.scanImports(r))),
    ]);

    const scanned = dedupeScannedPackages(scanMerged.packages);
    const graphPackages = buildGraphPackages(scanMerged.transitivePackages);
    ctx.setLastGraphPackages(graphPackages);

    if (scanned.length === 0) {
      const existingManualPath = ctx.context.workspaceState.get<string>(
        'pythonPackageVisualizer.manualRequirementsPath'
      );

      // WHY: If a manual path is already stored but still yielded 0 packages,
      // the file is unparseable or empty. Clear it and show an error instead of
      // re-prompting — this prevents an infinite select→re-scan→prompt loop.
      if (existingManualPath) {
        ctx.logger.warn(
          `Manual requirements path "${existingManualPath}" produced 0 packages — clearing.`
        );
        await ctx.context.workspaceState.update(
          'pythonPackageVisualizer.manualRequirementsPath',
          undefined
        );
        ctx.sendEmptyDepFilesState({ reason: 'parse-failed', failedPath: existingManualPath });
        return;
      }

      ctx.sendEmptyDepFilesState({ reason: 'not-found' });
      return;
    }

    ctx.panel.sendProgress(`Checking ${scanned.length} packages on PyPI...`);
    ctx.sidebar?.sendProgress(`Checking ${scanned.length} packages on PyPI...`);

    const checkResults = await ctx.checker.checkAll(
      scanned.map(p => ({ name: p.name, installedVersion: p.installedVersion }))
    );

    applyDriftStatus(scanned, checkResults);

    // Fetch weekly downloads in batches (non-blocking) to prevent PyPI Stats API rate-limiting or timing out
    const downloadsMap = new Map<string, number>();
    const DOWNLOAD_CONCURRENCY = 5;
    for (let i = 0; i < checkResults.length; i += DOWNLOAD_CONCURRENCY) {
      const batch = checkResults.slice(i, i + DOWNLOAD_CONCURRENCY);
      await Promise.allSettled(
        batch.map(async r => {
          const dl = await ctx.checker.fetchWeeklyDownloads(r.packageName);
          if (dl > 0) {
            downloadsMap.set(r.packageName, dl);
          }
        })
      );
    }

    for (const r of checkResults) {
      if (downloadsMap.has(r.packageName)) {
        r.weeklyDownloads = downloadsMap.get(r.packageName);
      }
    }

    // Record installed versions in version history cache
    for (const pkg of scanned) {
      if (pkg.installedVersion) {
        ctx.history.recordVersion(root, pkg.name, pkg.installedVersion, 'detected');
      }
    }

    // Compile imports from all workspace folders
    const mergedImportedModules = new Set<string>();
    let totalFilesScanned = 0;
    for (const res of importResults) {
      totalFilesScanned += res.filesScanned;
      for (const mod of res.importedModules) {
        mergedImportedModules.add(mod);
      }
    }

    const extraCandidates = new Map<string, Set<string>>();
    await ctx.pypiTopLevelCache.enrichCandidates(scanned.map(p => p.name), extraCandidates);

    const evidence = ctx.importScanner.evidenceEngine.collectEvidence(roots);
    const confidenceContext = buildConfidenceContext(
      scanned,
      checkResults,
      extraCandidates
    );

    const preliminaryUnused = ctx.importScanner.getUnusedPackagesWithConfidence(
      scanned.map(p => p.name),
      mergedImportedModules,
      confidenceContext,
      evidence
    );

    const refHits = ctx.referenceSearch.search(root, [...preliminaryUnused.keys()]);
    const unusedPackages = ctx.importScanner.evidenceEngine.analyzeUnused(
      scanned.map(p => p.name),
      mergedImportedModules,
      confidenceContext,
      evidence,
      refHits
    );

    ctx.setLastImportedModules(mergedImportedModules);
    ctx.setLastFilesScanned(totalFilesScanned);
    ctx.setLastUnusedPackages(unusedPackages);

    ctx.logger.info(
      `Import scan: ${totalFilesScanned} files, ` +
      `${mergedImportedModules.size} modules, ` +
      `${unusedPackages.size} possibly unused packages`
    );

    const manualRequirementsPath = ctx.context.workspaceState.get<string>('pythonPackageVisualizer.manualRequirementsPath');
    const scanStats = buildScanStats({
      totalFilesScanned,
      mergedImportedModules,
      root,
      checkResults,
      manualRequirementsPath,
      detectedDepFilePaths: resolveDetectedDepFilePaths(ctx.context, roots),
    });

    ctx.setLastPackages(scanned);
    ctx.setLastCheckResults(checkResults);

    if (scanGeneration !== ctx.getScanGeneration()) {
      return;
    }

    ctx.deliverPackagesToPanel(
      scanned,
      checkResults,
      unusedPackages,
      scanStats,
      ctx.packageEnrichment(root),
      graphPackages
    );

    // Perform background conflict analysis across all workspace roots
    Promise.all(roots.map(r => ctx.scanner.checkConflicts(r))).then(results => {
      if (scanGeneration !== ctx.getScanGeneration()) {
        return;
      }
      const conflicts = results.flat();
      if (conflicts.length > 0) {
        ctx.logger.info(`Found ${conflicts.length} dependency conflict(s)`);
        const scannedWithConflicts = ctx.scanner.detectConflicts(scanned, conflicts);
        ctx.setLastPackages(scannedWithConflicts);
        ctx.panel.updatePackages(
          scannedWithConflicts,
          checkResults,
          unusedPackages,
          scanStats,
          ctx.packageEnrichment(root),
          graphPackages
        );
      }
      ctx.panel.sendConflicts(conflicts);
    }).catch(err => {
      ctx.logger.warn(`Conflict check failed: ${String(err)}`);
    });

    // Update history list and sidebar payload
    const historyEntries = buildHistoryEntries(ctx.history.getFullHistory(root));
    ctx.panel.sendHistory(historyEntries);

    if (ctx.sidebar) {
      const displayData = buildEnrichedDisplayData(
        scanned,
        checkResults,
        root,
        ctx.history,
        unusedPackages,
        getManualUsedPackages(ctx.context, root),
        getIgnoredUpdates(ctx.context, root),
        getPinnedPackages(ctx.context, root)
      );
      ctx.sidebar.sendPackages(displayData, scanStats, 'init');
    }

    ctx.updateStatusBar(checkResults, scanned);

    const ignored = root ? getIgnoredUpdates(ctx.context, root) : undefined;
    const outdated = countActionableUpdates(scanned, checkResults, ignored);
    if (outdated > 0) {
      ctx.logger.info(`${outdated} package(s) have updates available`);
    }
  } catch (err) {
    ctx.logger.error(`showVisualizer failed: ${String(err)}`);
    void vscode.window.showErrorMessage(
      `Python Package Visualizer: ${String(err)}`
    );
  }
}
