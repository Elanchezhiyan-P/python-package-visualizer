import * as vscode from 'vscode';
import { Logger } from '../utils/logger.js';
import { PackageScanner } from '../modules/packageScanner.js';
import type { ImportScanner } from '../modules/importScanner.js';
import { VersionChecker } from '../services/versionChecker.js';
import { VersionHistoryCache } from '../services/versionHistoryCache.js';
import { WebviewPanel } from '../ui/webviewPanel.js';
import { SidebarProvider } from '../ui/sidebarProvider.js';
import { StatusBarManager } from '../ui/statusBarManager.js';
import { RequirementsSync } from '../modules/requirementsSync.js';
import { SnapshotManager } from '../services/snapshotManager.js';
import { RequirementsGenerator } from '../modules/requirementsGenerator.js';
import { MigrationHelper } from '../modules/migrationHelper.js';
import { SetupScriptGenerator } from '../modules/setupScriptGenerator.js';
import { VenvHealthChecker } from '../services/venvHealthChecker.js';

// Import specialized domain handlers using ESM extensions
import { PackageInstaller } from './handlers/packageInstaller.js';
import { ReportExporter } from './handlers/reportExporter.js';
import { SnapshotHandler } from './handlers/snapshotHandler.js';
import { RequirementsHandler } from './handlers/requirementsHandler.js';
import { MigrationHandler } from './handlers/migrationHandler.js';
import { VisualizerHandler } from './handlers/visualizerHandler.js';
import { UtilityHandler } from './handlers/utilityHandler.js';
import { UnusedAiHandler } from './handlers/unusedAiHandler.js';
import { registerCommands, type CommandControllerHost } from './commandController/registerCommands.js';
import {
  removeUnusedPackagesWithSnapshot as removeUnusedPackagesWithSnapshotFn,
  snapshotBeforeUpdate as snapshotBeforeUpdateFn,
} from './commandController/unusedRemovalFlow.js';
import {
  handleSelectActiveVenvProject as handleSelectActiveVenvProjectFn,
  handleUpdatePip as handleUpdatePipFn,
  handleVenvHealthRequest as handleVenvHealthRequestFn,
} from './commandController/venvHealthActions.js';
import { rollbackPackage as rollbackPackageFn } from './commandController/incompatibilityRollback.js';

import type { ScannedPackage } from '../modules/packageScanner.js';
import type { VersionCheckResult } from '../services/versionChecker.js';
import { getConflictInstallSpec } from '../utils/conflictFix.js';

/**
 * Orchestrates extension commands, webview interactions, and background tasks.
 * Acting strictly as an action router/delegator, it maintains low coupling and high cohesion.
 */
export class CommandController {
  private readonly reqSync: RequirementsSync;
  private readonly snapshotMgr: SnapshotManager;
  private readonly reqGen: RequirementsGenerator;
  private readonly migrationHelper: MigrationHelper;
  private readonly setupGen: SetupScriptGenerator;
  private readonly venvHealthChecker: VenvHealthChecker;
  private readonly logger: Logger;
  private readonly scanner: PackageScanner;

  // Domain command handlers
  private readonly installerHandler: PackageInstaller;
  private readonly reportExporter: ReportExporter;
  private readonly snapshotHandler: SnapshotHandler;
  private readonly requirementsHandler: RequirementsHandler;
  private readonly migrationHandler: MigrationHandler;
  private readonly visualizerHandler: VisualizerHandler;
  private readonly utilityHandler: UtilityHandler;
  private readonly unusedAiHandler: UnusedAiHandler;

  /**
   * Getter to dynamically retrieve scanned packages from visualizer state cache.
   * Why: Keeps local cached states unified under VisualizerHandler while keeping backwards compatibility.
   */
  get lastPackages(): ScannedPackage[] {
    return this.visualizerHandler.getLastPackages();
  }

  /**
   * Getter to dynamically retrieve latest check results from visualizer state cache.
   * Why: Prevents synchronization discrepancies across other handlers depending on Pypi info.
   */
  get lastCheckResults(): VersionCheckResult[] {
    return this.visualizerHandler.getLastCheckResults();
  }

  constructor(
    private readonly context: vscode.ExtensionContext,
    logger: Logger,
    scanner: PackageScanner,
    checker: VersionChecker,
    history: VersionHistoryCache,
    private readonly panel: WebviewPanel,
    private readonly sidebar?: SidebarProvider,
    statusBar?: StatusBarManager
  ) {
    this.logger = logger;
    this.scanner = scanner;
    this.reqSync = new RequirementsSync(logger);
    this.snapshotMgr = new SnapshotManager(context.globalStorageUri.fsPath, logger);
    this.reqGen = new RequirementsGenerator(logger, new (class {
      scanImports() { return Promise.resolve({ filesScanned: 0, importedModules: new Set<string>() }); }
      getUnusedPackages() { return new Set<string>(); }
      mapToPackageName() { return null; }
    })() as Pick<ImportScanner, 'scanImports' | 'getUnusedPackages' | 'mapToPackageName'> as ImportScanner, scanner);
    this.migrationHelper = new MigrationHelper(logger, scanner);
    this.setupGen = new SetupScriptGenerator();
    this.venvHealthChecker = new VenvHealthChecker(
      () => scanner.resolvePythonPath()
    );

    const getRoot = () => this.getActiveProjectRoot();
    const getAllRoots = () => this.getAllWorkspaceRoots();
    const refreshView = () => this.refreshVisualizer();

    // Initialize specialized sub-handlers
    this.installerHandler = new PackageInstaller(
      scanner,
      history,
      this.reqSync,
      panel,
      logger,
      getRoot,
      refreshView
    );

    this.reportExporter = new ReportExporter(logger, getRoot);

    this.snapshotHandler = new SnapshotHandler(
      this.snapshotMgr,
      panel,
      this.installerHandler,
      logger,
      getRoot,
      refreshView
    );

    this.requirementsHandler = new RequirementsHandler(
      context,
      this.reqSync,
      this.reqGen,
      logger,
      getRoot,
      refreshView
    );

    this.migrationHandler = new MigrationHandler(
      this.migrationHelper,
      scanner,
      context,
      logger,
      getRoot,
      refreshView
    );

    this.visualizerHandler = new VisualizerHandler(
      context,
      logger,
      scanner,
      checker,
      history,
      panel,
      getRoot,
      getAllRoots,
      sidebar,
      statusBar
    );

    this.utilityHandler = new UtilityHandler(
      logger,
      panel,
      this.setupGen,
      getRoot,
      () => this.lastPackages,
      sidebar
    );

    this.unusedAiHandler = new UnusedAiHandler(panel, logger, getRoot);
  }

  private toHost(): CommandControllerHost {
    void this.utilityHandler;
    void this.unusedAiHandler;
    return this as unknown as CommandControllerHost;
  }

  /**
   * Registers all extension commands and registers the communication channel
   * with the visualizer sidebar and webview panel to establish the action router.
   * Why: Decouples VS Code UI layout and activation cycle from individual handler implementations.
   */
  registerAll(): void {
    registerCommands(this.toHost());
  }

  setImportCodeLensRefresh(fn: () => void): void {
    this.visualizerHandler.setCodeLensRefresh(fn);
  }

  /**
   * Delegates the periodic or startup auto check task to the visualizer handler.
   */
  async triggerAutoCheck(): Promise<void> {
    await this.visualizerHandler.triggerAutoCheck();
  }

  /** Refresh the panel/sidebar if either is visible (e.g. project config file changed). */
  async refreshIfOpen(): Promise<void> {
    await this.refreshVisualizer();
  }

  // --- Wrapper Delegates ---

  async updatePackage(packageName: string): Promise<void> {
    await this.snapshotBeforeUpdate(`Pre-update: ${packageName}`);
    const ok = await this.installerHandler.updatePackage(packageName);
    if (ok && await this.visualizerHandler.clearPinMetadata(packageName)) {
      await this.refreshVisualizer();
    }
  }

  async rollbackPackage(
    packageName: string,
    version: string,
    dueToIncompatibility?: boolean
  ): Promise<void> {
    await rollbackPackageFn({
      visualizerHandler: this.visualizerHandler,
      installerHandler: this.installerHandler,
      refreshVisualizer: () => this.refreshVisualizer(),
    }, packageName, version, dueToIncompatibility);
  }

  async updateAllPackages(names: string[]): Promise<void> {
    const lang = vscode.workspace
      .getConfiguration('pythonPackageVisualizer')
      .get<string>('language', 'en');
    const label = names.length === 1
      ? `Pre-update: ${names[0]}`
      : lang === 'it'
        ? `Pre-update: bulk (${names.length} pacchetti)`
        : `Pre-update: bulk (${names.length} packages)`;
    await this.snapshotBeforeUpdate(label);
    const succeeded = await this.installerHandler.updateAllPackages(names);
    if (succeeded.length > 0 && await this.visualizerHandler.clearPinMetadataFor(succeeded)) {
      await this.refreshVisualizer();
    }
  }

  async installNewPackage(packageName: string, version?: string): Promise<void> {
    await this.installerHandler.installNewPackage(packageName, version);
  }

  async installAllPackages(names: string[]): Promise<void> {
    await this.installerHandler.installAllPackages(names);
  }

  async fixConflict(requirement: string, packageName: string): Promise<void> {
    const spec = getConflictInstallSpec({
      package: '',
      version: '',
      requirement,
      conflictingPackage: packageName,
      conflictingVersion: '',
    });
    if (!spec) {
      return;
    }
    await this.snapshotBeforeUpdate(`Pre-fix: ${packageName}`);
    await this.installerHandler.installPackageSpec(spec, packageName);
  }

  async exportReport(format: 'markdown' | 'json'): Promise<void> {
    await this.reportExporter.exportReport(format, this.lastPackages, this.lastCheckResults);
  }

  async pinVersion(packageName: string, version: string, sourceFile: string): Promise<void> {
    await this.requirementsHandler.pinVersion(packageName, version, sourceFile);
  }

  async pinPackageToVersion(packageName: string, version: string, sourceFile: string): Promise<void> {
    await this.snapshotBeforeUpdate(`Pre-pin: ${packageName}`);
    const ok = await this.installerHandler.pinPackageToVersion(packageName, version, sourceFile);
    if (!ok) {
      return;
    }
    await this.visualizerHandler.persistPin(packageName, version);
  }

  async syncRequirementsToInstalled(packageName: string, sourceFile: string): Promise<void> {
    await this.requirementsHandler.syncRequirementsToInstalled(packageName, sourceFile, this.lastPackages);
  }

  async bulkSyncRequirementsToInstalled(packages: Array<{ name: string; source: string }>): Promise<void> {
    await this.requirementsHandler.bulkSyncRequirementsToInstalled(packages, this.lastPackages);
  }

  async removeUnusedPackagesWithSnapshot(
    packages: Array<{ name: string; source: string }>
  ): Promise<void> {
    await removeUnusedPackagesWithSnapshotFn({
      getWorkspaceRoot: () => this.getWorkspaceRoot(),
      snapshotBeforeUpdate: label => this.snapshotBeforeUpdate(label),
      requirementsHandler: this.requirementsHandler,
      installerHandler: this.installerHandler,
    }, packages);
  }

  async selectManualRequirements(): Promise<void> {
    await this.requirementsHandler.selectManualRequirements();
  }

  async clearManualRequirements(): Promise<void> {
    await this.requirementsHandler.clearManualRequirements();
  }

  async createRequirementsFile(): Promise<void> {
    await this.requirementsHandler.createRequirementsFile();
  }

  async removeFromRequirements(packageName: string, sourceFile: string): Promise<void> {
    await this.requirementsHandler.removeFromRequirements(packageName, sourceFile);
  }

  async generateRequirements(): Promise<void> {
    await this.requirementsHandler.generateRequirements();
  }

  async migrateToUv(mode: 'manual' | 'automatic' = 'manual'): Promise<void> {
    if (mode === 'automatic') {
      await this.migrationHandler.migrateToUvAutomatic();
      return;
    }
    await this.migrationHandler.migrateToUvManual();
  }

  async migrateToPoetry(): Promise<void> {
    await this.migrationHandler.migrateToPoetry();
  }

  // --- Internal Helper Methods ---

  private async refreshVisualizer(): Promise<void> {
    if (this.panel.isVisible() || this.sidebar?.isVisible()) {
      await this.visualizerHandler.showVisualizer();
    }
  }

  /** Captures the current environment before a manual package update. */
  private async snapshotBeforeUpdate(label: string): Promise<void> {
    await snapshotBeforeUpdateFn({
      getActiveProjectRoot: () => this.getActiveProjectRoot(),
      scanner: this.scanner,
      logger: this.logger,
      lastPackages: this.lastPackages,
      snapshotHandler: this.snapshotHandler,
    }, label);
  }

  async handleVenvHealthRequest(): Promise<void> {
    await handleVenvHealthRequestFn(this.venvActionsCtx());
  }

  async handleSelectActiveVenvProject(root: string): Promise<void> {
    await handleSelectActiveVenvProjectFn(this.venvActionsCtx(), root);
  }

  async handleUpdatePip(): Promise<void> {
    await handleUpdatePipFn(this.venvActionsCtx());
  }

  private venvActionsCtx() {
    return {
      scanner: this.scanner,
      venvHealthChecker: this.venvHealthChecker,
      panel: this.panel,
      context: this.context,
      installerHandler: this.installerHandler,
      refreshVisualizer: () => this.refreshVisualizer(),
    };
  }

  private getActiveProjectRoot(): string | null {
    return this.scanner.getActiveProjectRoot();
  }

  private getWorkspaceRoot(): string | null {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return null;
    }
    return folders[0].uri.fsPath;
  }

  private getAllWorkspaceRoots(): string[] {
    return (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath);
  }
}
