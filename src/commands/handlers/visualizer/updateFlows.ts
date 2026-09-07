import * as vscode from 'vscode';
import type { Logger } from '../../../utils/logger.js';
import type { PackageScanner, ScannedPackage } from '../../../modules/packageScanner.js';
import type { ImportScanner } from '../../../modules/importScanner.js';
import type { VersionChecker, VersionCheckResult } from '../../../services/versionChecker.js';
import type { VersionHistoryCache } from '../../../services/versionHistoryCache.js';
import type { WebviewPanel, PackageEnrichment } from '../../../ui/webviewPanel.js';
import type { SidebarProvider } from '../../../ui/sidebarProvider.js';
import type { GraphPackageInfo } from '../../../ui/webviewTypes.js';
import {
  buildEnrichedDisplayData,
  buildConfidenceContext,
  buildGraphPackages,
} from './displayCompiler.js';
import {
  applyDriftStatus,
  dedupeScannedPackages,
  getActionableUpdates,
  mergeWorkspaceScans,
} from './scanHelpers.js';
import { UsageReferenceSearch } from '../../../modules/import/usageReferenceSearch.js';

const referenceSearch = new UsageReferenceSearch();

export interface VisualizerUpdateContext {
  logger: Logger;
  scanner: PackageScanner;
  checker: VersionChecker;
  history: VersionHistoryCache;
  panel: WebviewPanel;
  importScanner: ImportScanner;
  sidebar?: SidebarProvider;
  getWorkspaceRoot(): string | null;
  getAllWorkspaceRoots(): string[];
  packageEnrichment(root: string): PackageEnrichment;
  updateStatusBar(checkResults: VersionCheckResult[], scanned?: ScannedPackage[]): void;
  showVisualizer(): Promise<void>;
  setLastGraphPackages(packages: GraphPackageInfo[]): void;
  getLastGraphPackages(): GraphPackageInfo[];
  setLastPackages(packages: ScannedPackage[]): void;
}

/** Scans dependencies and notifies the user when updates are available. */
export async function runCheckUpdates(ctx: VisualizerUpdateContext): Promise<void> {
  const root = ctx.getWorkspaceRoot();
  if (!root) {
    return;
  }

  ctx.logger.info('Checking for package updates...');

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Python Packages: Checking for updates...',
      cancellable: false,
    },
    async () => {
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

        const checkResults = await ctx.checker.checkAll(
          scanned.map(p => ({
            name: p.name,
            installedVersion: p.installedVersion,
          }))
        );

        applyDriftStatus(scanned, checkResults);
        ctx.updateStatusBar(checkResults, scanned);

        const mergedImportedModules = new Set<string>();
        for (const res of importResults) {
          for (const mod of res.importedModules) {
            mergedImportedModules.add(mod);
          }
        }

        const confidenceContext = buildConfidenceContext(scanned, checkResults);
        const evidence = ctx.importScanner.evidenceEngine.collectEvidence(roots);

        const preliminaryUnused = ctx.importScanner.getUnusedPackagesWithConfidence(
          scanned.map(p => p.name),
          mergedImportedModules,
          confidenceContext,
          evidence
        );

        const refHits = referenceSearch.search(root, [...preliminaryUnused.keys()]);
        const unusedPackages = ctx.importScanner.evidenceEngine.analyzeUnused(
          scanned.map(p => p.name),
          mergedImportedModules,
          confidenceContext,
          evidence,
          refHits
        );

        const conflicts = await ctx.scanner.checkConflicts(root);
        const scannedWithConflicts = ctx.scanner.detectConflicts(scanned, conflicts);
        ctx.setLastPackages(scannedWithConflicts);

        if (ctx.panel.isVisible()) {
          ctx.panel.updatePackages(
            scannedWithConflicts,
            checkResults,
            unusedPackages,
            undefined,
            ctx.packageEnrichment(root),
            graphPackages
          );
          ctx.panel.sendConflicts(conflicts);
        }

        if (ctx.sidebar?.isVisible()) {
          const enrich = ctx.packageEnrichment(root);
          const displayData = buildEnrichedDisplayData(
            scannedWithConflicts,
            checkResults,
            root,
            ctx.history,
            unusedPackages,
            enrich.manualUsedPackages,
            enrich.ignoredUpdates,
            enrich.pinnedPackages
          );
          ctx.sidebar.sendPackages(displayData, undefined, 'update');
        }

        const enrich = ctx.packageEnrichment(root);
        const outdated = getActionableUpdates(
          scannedWithConflicts,
          checkResults,
          enrich.ignoredUpdates
        );

        if (outdated.length === 0) {
          void vscode.window.showInformationMessage(
            'Python Packages: All packages are up to date! ✅'
          );
        } else {
          const msg = `${outdated.length} package(s) have updates available.`;
          const choice = await vscode.window.showInformationMessage(
            `Python Packages: ${msg}`,
            'Show Visualizer'
          );
          if (choice === 'Show Visualizer') {
            await ctx.showVisualizer();
          }
        }
      } catch (err) {
        ctx.logger.error(`checkUpdates failed: ${String(err)}`);
      }
    }
  );
}

/** Silently checks for outdated packages on workspace open. */
export async function runTriggerAutoCheck(ctx: VisualizerUpdateContext): Promise<void> {
  const root = ctx.getWorkspaceRoot();
  if (!root) {
    return;
  }

  const config = vscode.workspace.getConfiguration('pythonPackageVisualizer');
  if (!config.get<boolean>('notifyOnOutdated', true)) {
    return;
  }

  try {
    const roots = ctx.getAllWorkspaceRoots();
    const scanMerged = mergeWorkspaceScans(
      await Promise.all(roots.map(r => ctx.scanner.scanWorkspace(r)))
    );

    const scanned = dedupeScannedPackages(scanMerged.packages);
    ctx.setLastGraphPackages(buildGraphPackages(scanMerged.transitivePackages));

    if (scanned.length === 0) {
      return;
    }

    const checkResults = await ctx.checker.checkAll(
      scanned.map(p => ({ name: p.name, installedVersion: p.installedVersion }))
    );

    applyDriftStatus(scanned, checkResults);
    ctx.updateStatusBar(checkResults, scanned);

    const enrich = ctx.packageEnrichment(root);
    const outdated = getActionableUpdates(scanned, checkResults, enrich.ignoredUpdates);

    if (outdated.length > 0) {
      const names = outdated
        .slice(0, 3)
        .map(r => r.packageName)
        .join(', ');
      const more = outdated.length > 3 ? ` and ${outdated.length - 3} more` : '';

      const choice = await vscode.window.showInformationMessage(
        `Python Packages: ${outdated.length} update(s) available — ${names}${more}`,
        'Show Visualizer',
        'Dismiss'
      );

      if (choice === 'Show Visualizer') {
        ctx.panel.show();
        ctx.panel.sendPackages(
          scanned,
          checkResults,
          undefined,
          undefined,
          ctx.packageEnrichment(root),
          undefined,
          ctx.getLastGraphPackages()
        );
      }
    }
  } catch (err) {
    ctx.logger.warn(`Auto-check failed: ${String(err)}`);
  }
}
