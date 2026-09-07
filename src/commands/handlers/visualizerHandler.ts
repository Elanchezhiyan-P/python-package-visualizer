import * as vscode from 'vscode';
import { Logger } from '../../utils/logger.js';
import { PackageScanner, ScannedPackage } from '../../modules/packageScanner.js';
import { ImportScanner, UnusedPackageInfo } from '../../modules/importScanner.js';
import { VersionChecker, VersionCheckResult } from '../../services/versionChecker.js';
import { VersionHistoryCache } from '../../services/versionHistoryCache.js';
import { WebviewPanel, type ScanStats, type PackageEnrichment } from '../../ui/webviewPanel.js';
import { SidebarProvider } from '../../ui/sidebarProvider.js';
import { StatusBarManager } from '../../ui/statusBarManager.js';
import { buildEnrichedDisplayData } from './visualizer/displayCompiler.js';
import { countActionableUpdates } from './visualizer/scanHelpers.js';
import { runCheckUpdates, runTriggerAutoCheck } from './visualizer/updateFlows.js';
import { runWorkspaceScan, type VisualizerScanContext } from './visualizer/workspaceScan.js';
import { UsageReferenceSearch } from '../../modules/import/usageReferenceSearch.js';
import { PypiTopLevelCache } from '../../modules/usageEvidence/pypiTopLevelCache.js';
import type { PackageDisplayData, DepFilesEmptyState, GraphPackageInfo } from '../../ui/webviewTypes.js';
import {
  getManualUsedPackages,
  markPackageManuallyUsed,
  unmarkPackageManuallyUsed,
} from '../../services/manualUsedPackages.js';
import {
  getIgnoredUpdates,
  ignorePackageUpdate as persistIgnoredUpdate,
  unignorePackageUpdate as persistUnignoredUpdate,
} from '../../services/ignoredUpdates.js';
import {
  getPinnedPackages,
  getPinnedVersion,
  pinPackage as persistPinnedPackage,
  unpinPackage as persistUnpinnedPackage,
} from '../../services/pinnedPackages.js';

/**
 * Handles core workspace package scanning, update checks, auto checks,
 * and compiles displays data for the main webview and sidebar.
 */
export class VisualizerHandler {
  private lastPackages: ScannedPackage[] = [];
  private lastGraphPackages: GraphPackageInfo[] = [];
  private lastCheckResults: VersionCheckResult[] = [];
  private lastImportedModules = new Set<string>();
  private lastFilesScanned = 0;
  private lastUnusedPackages: Map<string, UnusedPackageInfo> | undefined;
  private scanGeneration = 0;
  private codeLensRefresh?: () => void;
  private readonly importScanner: ImportScanner;
  private readonly referenceSearch = new UsageReferenceSearch();
  private readonly pypiTopLevelCache: PypiTopLevelCache;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: Logger,
    private readonly scanner: PackageScanner,
    private readonly checker: VersionChecker,
    private readonly history: VersionHistoryCache,
    private readonly panel: WebviewPanel,
    private readonly getWorkspaceRoot: () => string | null,
    private readonly getAllWorkspaceRoots: () => string[],
    private readonly sidebar?: SidebarProvider,
    private readonly statusBar?: StatusBarManager
  ) {
    this.importScanner = new ImportScanner(logger);
    this.pypiTopLevelCache = new PypiTopLevelCache(context);
  }

  setCodeLensRefresh(fn: () => void): void {
    this.codeLensRefresh = fn;
  }

  private refreshCodeLenses(): void {
    this.codeLensRefresh?.();
  }

  getLastPackages(): ScannedPackage[] {
    return this.lastPackages;
  }

  setLastPackages(packages: ScannedPackage[]): void {
    this.lastPackages = packages;
  }

  getLastCheckResults(): VersionCheckResult[] {
    return this.lastCheckResults;
  }

  /** Latest display payload for Cursor AI unused-package analysis. */
  getUnusedAiScanState(): {
    packages: PackageDisplayData[];
    importedModules: Set<string>;
    filesScanned: number;
    workspaceRoot: string;
  } | undefined {
    const root = this.getWorkspaceRoot();
    if (!root || this.lastPackages.length === 0) {
      return undefined;
    }
    const packages = buildEnrichedDisplayData(
      this.lastPackages,
      this.lastCheckResults,
      root,
      this.history,
      this.lastUnusedPackages,
      getManualUsedPackages(this.context, root),
      getIgnoredUpdates(this.context, root),
      getPinnedPackages(this.context, root)
    );
    return {
      packages,
      importedModules: new Set(this.lastImportedModules),
      filesScanned: this.lastFilesScanned,
      workspaceRoot: root,
    };
  }

  private packageEnrichment(root: string): PackageEnrichment {
    return {
      workspaceRoot: root,
      history: this.history,
      manualUsedPackages: getManualUsedPackages(this.context, root),
      ignoredUpdates: getIgnoredUpdates(this.context, root),
      pinnedPackages: getPinnedPackages(this.context, root),
    };
  }

  /** Persist a manual "this package is used" confirmation and refresh the panel. */
  async markPackageManuallyUsed(packageName: string): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root || !packageName) {
      return;
    }
    await markPackageManuallyUsed(this.context, root, packageName);
    await this.showVisualizer();
  }

  /** Ignore the current PyPI update for a package until a newer release appears. */
  async ignorePackageUpdate(packageName: string, latestVersion: string): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root || !packageName || !latestVersion) {
      return;
    }
    await persistIgnoredUpdate(this.context, root, packageName, latestVersion);
    this.refreshCodeLenses();
    await this.showVisualizer();
  }

  /** Clear an ignored update so the package shows as update-available again. */
  async unignorePackageUpdate(packageName: string): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root || !packageName) {
      return;
    }
    await persistUnignoredUpdate(this.context, root, packageName);
    this.refreshCodeLenses();
    await this.showVisualizer();
  }

  /**
   * After a successful env/file pin, persist Ignore hold + Pinned tag metadata.
   */
  async persistPin(packageName: string, version: string): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root || !packageName || !version) {
      return;
    }
    const ignoredLatest = await this.resolveLatestPypiVersion(packageName);
    if (ignoredLatest) {
      await persistIgnoredUpdate(this.context, root, packageName, ignoredLatest);
    }
    await persistPinnedPackage(this.context, root, packageName, {
      version,
      ignoredLatest: ignoredLatest ?? '',
    });
    this.refreshCodeLenses();
    await this.showVisualizer();
  }

  /** Clear pin hold and tag; leaves the == pin in the dependency file. */
  async unpinPackage(packageName: string): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root || !packageName) {
      return;
    }
    await persistUnignoredUpdate(this.context, root, packageName);
    await persistUnpinnedPackage(this.context, root, packageName);
    this.refreshCodeLenses();
    await this.showVisualizer();
  }

  /** Drop Pinned tag metadata after a successful Update (file/ignore unchanged). */
  async clearPinMetadata(packageName: string): Promise<boolean> {
    const root = this.getWorkspaceRoot();
    if (!root || !packageName) {
      return false;
    }
    if (!getPinnedVersion(this.context, root, packageName)) {
      return false;
    }
    await persistUnpinnedPackage(this.context, root, packageName);
    return true;
  }

  async clearPinMetadataFor(packageNames: string[]): Promise<boolean> {
    const root = this.getWorkspaceRoot();
    if (!root || packageNames.length === 0) {
      return false;
    }
    let cleared = false;
    for (const name of packageNames) {
      if (getPinnedVersion(this.context, root, name)) {
        await persistUnpinnedPackage(this.context, root, name);
        cleared = true;
      }
    }
    return cleared;
  }

  private async resolveLatestPypiVersion(packageName: string): Promise<string | undefined> {
    const installed =
      this.lastPackages.find(p => p.name.toLowerCase() === packageName.toLowerCase())?.installedVersion ??
      '';
    const cached = this.lastCheckResults.find(
      r => r.packageName.toLowerCase() === packageName.toLowerCase()
    );
    let latestVersion = cached?.latestVersion;

    if (!latestVersion || latestVersion === 'unknown') {
      try {
        const result = await this.checker.checkPackage(packageName, installed);
        latestVersion = result.latestVersion;
      } catch {
        return undefined;
      }
    }

    if (!latestVersion || latestVersion === 'unknown') {
      return undefined;
    }
    return latestVersion;
  }

  /**
   * After an incompatibility rollback, ignore the current PyPI latest so the
   * package does not reappear as update-available until a newer release ships.
   */
  async autoIgnoreLatestPypiUpdate(packageName: string): Promise<string | undefined> {
    const root = this.getWorkspaceRoot();
    if (!root || !packageName) {
      return undefined;
    }

    const latestVersion = await this.resolveLatestPypiVersion(packageName);
    if (!latestVersion) {
      return undefined;
    }

    await persistIgnoredUpdate(this.context, root, packageName, latestVersion);
    this.refreshCodeLenses();
    return latestVersion;
  }

  /** Clear a manual used confirmation so the package can reappear as unused. */
  async unmarkPackageManuallyUsed(packageName: string): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root || !packageName) {
      return;
    }
    await unmarkPackageManuallyUsed(this.context, root, packageName);
    await this.showVisualizer();
  }

  /**
   * Scans the active workspace dependencies and queries PyPI, loading results
   * into the primary webview panel and sidebar dashboards.
   */
  async showVisualizer(): Promise<void> {
    await runWorkspaceScan(this.getScanContext());
  }

  async checkUpdates(): Promise<void> {
    await runCheckUpdates(this.getUpdateContext());
  }

  async triggerAutoCheck(): Promise<void> {
    await runTriggerAutoCheck(this.getUpdateContext());
  }

  private getScanContext(): VisualizerScanContext {
    return {
      logger: this.logger,
      scanner: this.scanner,
      checker: this.checker,
      history: this.history,
      panel: this.panel,
      importScanner: this.importScanner,
      sidebar: this.sidebar,
      context: this.context,
      pypiTopLevelCache: this.pypiTopLevelCache,
      referenceSearch: this.referenceSearch,
      getWorkspaceRoot: () => this.getWorkspaceRoot(),
      getAllWorkspaceRoots: () => this.getAllWorkspaceRoots(),
      packageEnrichment: (root: string) => this.packageEnrichment(root),
      deliverPackagesToPanel: (scanned, checkResults, unusedPackages, scanStats, enrich, graphPackages) =>
        this.deliverPackagesToPanel(scanned, checkResults, unusedPackages, scanStats, enrich, graphPackages),
      sendEmptyDepFilesState: (state) => this.sendEmptyDepFilesState(state),
      updateStatusBar: (checkResults, scanned) => this.updateStatusBar(checkResults, scanned),
      getScanGeneration: () => this.scanGeneration,
      bumpScanGeneration: () => ++this.scanGeneration,
      setLastPackages: (packages) => { this.lastPackages = packages; },
      setLastCheckResults: (results) => { this.lastCheckResults = results; },
      setLastGraphPackages: (packages) => { this.lastGraphPackages = packages; },
      setLastUnusedPackages: (unused) => { this.lastUnusedPackages = unused; },
      setLastImportedModules: (modules) => { this.lastImportedModules = modules; },
      setLastFilesScanned: (count) => { this.lastFilesScanned = count; },
    };
  }

  private getUpdateContext() {
    return {
      logger: this.logger,
      scanner: this.scanner,
      checker: this.checker,
      history: this.history,
      panel: this.panel,
      importScanner: this.importScanner,
      sidebar: this.sidebar,
      getWorkspaceRoot: () => this.getWorkspaceRoot(),
      getAllWorkspaceRoots: () => this.getAllWorkspaceRoots(),
      packageEnrichment: (root: string) => this.packageEnrichment(root),
      updateStatusBar: (checkResults: VersionCheckResult[], scanned?: ScannedPackage[]) =>
        this.updateStatusBar(checkResults, scanned),
      showVisualizer: () => this.showVisualizer(),
      setLastGraphPackages: (packages: GraphPackageInfo[]) => { this.lastGraphPackages = packages; },
      getLastGraphPackages: () => this.lastGraphPackages,
      setLastPackages: (packages: ScannedPackage[]) => { this.lastPackages = packages; },
    };
  }

  private deliverPackagesToPanel(
    scanned: ScannedPackage[],
    checkResults: VersionCheckResult[],
    unusedPackages: Map<string, UnusedPackageInfo> | undefined,
    scanStats: ScanStats,
    enrich: PackageEnrichment,
    graphPackages: GraphPackageInfo[]
  ): void {
    if (this.panel.isWebviewReady()) {
      this.panel.updatePackages(
        scanned,
        checkResults,
        unusedPackages,
        scanStats,
        enrich,
        graphPackages
      );
      return;
    }
    this.panel.sendPackages(
      scanned,
      checkResults,
      unusedPackages,
      scanStats,
      enrich,
      undefined,
      graphPackages
    );
  }

  private updateStatusBar(checkResults: VersionCheckResult[], scanned?: ScannedPackage[]): void {
    if (!this.statusBar) {
      return;
    }
    const root = this.getWorkspaceRoot();
    const ignored = root ? getIgnoredUpdates(this.context, root) : undefined;
    const outdated = scanned
      ? countActionableUpdates(scanned, checkResults, ignored)
      : checkResults.filter(r => r.status === 'update-available').length;
    const vulnerable = checkResults.filter(r => r.vulnerabilities && r.vulnerabilities.length > 0).length;
    this.statusBar.update(outdated, vulnerable, checkResults.length);
  }

  private sendEmptyDepFilesState(state: DepFilesEmptyState): void {
    this.panel.sendPackages([], [], undefined, undefined, undefined, state);
    this.sidebar?.sendPackages([], undefined, 'init');
  }
}
