import * as vscode from 'vscode';
import type { WebviewPanel } from '../../ui/webviewPanel.js';
import type { SidebarProvider } from '../../ui/sidebarProvider.js';
import type { VisualizerHandler } from '../handlers/visualizerHandler.js';
import type { UnusedAiHandler } from '../handlers/unusedAiHandler.js';
import type { SnapshotHandler } from '../handlers/snapshotHandler.js';
import type { UtilityHandler } from '../handlers/utilityHandler.js';
import { routeSidebarMessage, routeWebviewMessage, type MessageRouterDeps } from './messageRouter.js';

/**
 * Host surface for command registration and message-router wiring.
 * CommandController.toHost() casts the instance; extracts must not use `any`.
 */
export interface CommandControllerHost {
  context: vscode.ExtensionContext;
  panel: WebviewPanel;
  sidebar?: SidebarProvider;
  visualizerHandler: VisualizerHandler;
  unusedAiHandler: UnusedAiHandler;
  snapshotHandler: SnapshotHandler;
  utilityHandler: UtilityHandler;
  lastPackages: import('../../modules/packageScanner.js').ScannedPackage[];
  updatePackage(name: string): Promise<void>;
  fixConflict(requirement: string, packageName: string): Promise<void>;
  rollbackPackage(name: string, version: string, dueToIncompatibility?: boolean): Promise<void>;
  updateAllPackages(names: string[]): Promise<void>;
  installAllPackages(names: string[]): Promise<void>;
  installNewPackage(name: string, version?: string): Promise<void>;
  exportReport(format: 'markdown' | 'json'): Promise<void>;
  removeFromRequirements(name: string, source: string): Promise<void>;
  pinVersion(name: string, version: string, source: string): Promise<void>;
  createRequirementsFile(): Promise<void>;
  bulkSyncRequirementsToInstalled(packages: Array<{ name: string; source: string }>): Promise<void>;
  removeUnusedPackagesWithSnapshot(packages: Array<{ name: string; source: string }>): Promise<void>;
  generateRequirements(): Promise<void>;
  migrateToUv(mode: 'manual' | 'automatic'): Promise<void>;
  migrateToPoetry(): Promise<void>;
  selectManualRequirements(): Promise<void>;
  clearManualRequirements(): Promise<void>;
  syncRequirementsToInstalled(name: string, source: string): Promise<void>;
  handleVenvHealthRequest(): Promise<void>;
  handleUpdatePip(): Promise<void>;
  handleSelectActiveVenvProject(root: string): Promise<void>;
  pinPackageToVersion(name: string, version: string, source: string): Promise<void>;
}

export function buildMessageRouterDeps(host: CommandControllerHost): MessageRouterDeps {
  return {
    showVisualizer: async () => {
      await host.visualizerHandler.showVisualizer();
      void host.unusedAiHandler.sendCapabilities();
    },
    sendCapabilities: () => { void host.unusedAiHandler.sendCapabilities(); },
    updatePackage: (name: string) => host.updatePackage(name),
    fixConflict: (requirement: string, packageName: string) => host.fixConflict(requirement, packageName),
    rollbackPackage: (name: string, version: string, dueToIncompatibility?: boolean) =>
      host.rollbackPackage(name, version, dueToIncompatibility),
    updateAllPackages: (names: string[]) => host.updateAllPackages(names),
    installAllPackages: (names: string[]) => host.installAllPackages(names),
    installNewPackage: (name: string, version?: string) => host.installNewPackage(name, version),
    searchPypi: (query: string) => host.utilityHandler.searchPypi(query),
    exportReport: (format: 'markdown' | 'json') => host.exportReport(format),
    removeFromRequirements: (name: string, source: string) => host.removeFromRequirements(name, source),
    pinVersion: (name: string, version: string, source: string) => host.pinVersion(name, version, source),
    createRequirementsFile: () => host.createRequirementsFile(),
    bulkSyncRequirementsToInstalled: (packages: Array<{ name: string; source: string }>) =>
      host.bulkSyncRequirementsToInstalled(packages),
    bulkRemoveFromRequirements: async (names: string[], sources: string[]) => {
      for (let i = 0; i < names.length; i++) {
        await host.removeFromRequirements(names[i], sources[i] ?? '');
      }
    },
    removeUnusedPackagesWithSnapshot: (packages: Array<{ name: string; source: string }>) =>
      host.removeUnusedPackagesWithSnapshot(packages),
    takeSnapshot: (name: string) => host.snapshotHandler.takeSnapshot(name, host.lastPackages),
    restoreSnapshot: (id: string) => host.snapshotHandler.restoreSnapshot(id),
    deleteSnapshot: (id: string) => host.snapshotHandler.deleteSnapshot(id),
    listSnapshots: () => host.snapshotHandler.listSnapshots(),
    generateRequirements: () => host.generateRequirements(),
    migrateToUv: (mode: 'manual' | 'automatic') => host.migrateToUv(mode),
    migrateToPoetry: () => host.migrateToPoetry(),
    selectManualRequirements: () => host.selectManualRequirements(),
    clearManualRequirements: () => host.clearManualRequirements(),
    generateSetupScript: (format: 'bash' | 'powershell' | 'markdown') =>
      host.utilityHandler.generateSetupScript(format),
    syncRequirementsToInstalled: (name: string, source: string) =>
      host.syncRequirementsToInstalled(name, source),
    handleVenvHealthRequest: () => host.handleVenvHealthRequest(),
    handleUpdatePip: () => host.handleUpdatePip(),
    selectActiveVenvProject: (root: string) => host.handleSelectActiveVenvProject(root),
    analyzeUnusedWithCursor: async (packageNames?: string[], userInitiated?: boolean) => {
      if (userInitiated !== true) {
        return;
      }
      const state = host.visualizerHandler.getUnusedAiScanState();
      if (state) {
        host.unusedAiHandler.setScanState(state);
      }
      await host.unusedAiHandler.analyzeUnusedWithCursor(packageNames, true);
    },
    markPackageManuallyUsed: (name: string) => host.visualizerHandler.markPackageManuallyUsed(name),
    unmarkPackageManuallyUsed: (name: string) => host.visualizerHandler.unmarkPackageManuallyUsed(name),
    ignorePackageUpdate: (name: string, latestVersion: string) =>
      host.visualizerHandler.ignorePackageUpdate(name, latestVersion),
    unignorePackageUpdate: (name: string) => host.visualizerHandler.unignorePackageUpdate(name),
    pinPackageToVersion: (name: string, version: string, source: string) =>
      host.pinPackageToVersion(name, version, source),
    unpinPackage: (name: string) => host.visualizerHandler.unpinPackage(name),
  };
}

export function registerCommands(host: CommandControllerHost): void {
  host.context.subscriptions.push(
    vscode.commands.registerCommand(
      'extension.showPackageVisualizer',
      async () => {
        await host.visualizerHandler.showVisualizer();
        void host.unusedAiHandler.sendCapabilities();
      }
    ),
    vscode.commands.registerCommand(
      'extension.openPackageVisualizer',
      async () => {
        await host.visualizerHandler.showVisualizer();
        void host.unusedAiHandler.sendCapabilities();
      }
    ),
    vscode.commands.registerCommand(
      'extension.checkPackageUpdates',
      () => host.visualizerHandler.checkUpdates()
    ),
    vscode.commands.registerCommand(
      'extension.updatePackage',
      (name: string) => host.updatePackage(name)
    ),
    vscode.commands.registerCommand(
      'extension.rollbackPackage',
      (name: string, version: string) => host.rollbackPackage(name, version)
    ),
    vscode.commands.registerCommand(
      'extension.selectManualRequirements',
      () => host.selectManualRequirements()
    ),
    vscode.commands.registerCommand(
      'extension.clearManualRequirements',
      () => host.clearManualRequirements()
    ),
    vscode.commands.registerCommand(
      'extension.analyzeUnusedWithCursor',
      () => {
        const state = host.visualizerHandler.getUnusedAiScanState();
        if (state) {
          host.unusedAiHandler.setScanState(state);
        }
        void host.unusedAiHandler.analyzeUnusedWithCursor(undefined, true);
      }
    )
  );

  host.panel.onMessage(async msg => {
    if (msg.type === 'ready') {
      void host.unusedAiHandler.sendCapabilities();
      return;
    }
    routeWebviewMessage(buildMessageRouterDeps(host), msg);
  });

  if (host.sidebar) {
    host.sidebar.onMessage(msg => {
      routeSidebarMessage(buildMessageRouterDeps(host), msg as {
        type: string;
        url?: string;
        name?: string;
        version?: string;
        names?: string[];
      });
    });
  }
}
