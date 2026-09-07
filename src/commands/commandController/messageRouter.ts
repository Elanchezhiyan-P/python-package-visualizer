import * as vscode from 'vscode';
import type { WebviewMessage } from '../../ui/webviewTypes.js';

/** Dependencies required to route webview/sidebar messages. */
export interface MessageRouterDeps {
  showVisualizer(): Promise<void>;
  sendCapabilities(): void;
  updatePackage(name: string): Promise<void>;
  fixConflict(requirement: string, packageName: string): Promise<void>;
  rollbackPackage(name: string, version: string, dueToIncompatibility?: boolean): Promise<void>;
  updateAllPackages(names: string[]): Promise<void>;
  installAllPackages(names: string[]): Promise<void>;
  installNewPackage(name: string, version?: string): Promise<void>;
  searchPypi(query: string): Promise<void>;
  exportReport(format: 'markdown' | 'json'): Promise<void>;
  removeFromRequirements(name: string, source: string): Promise<void>;
  pinVersion(name: string, version: string, source: string): Promise<void>;
  createRequirementsFile(): Promise<void>;
  bulkSyncRequirementsToInstalled(packages: Array<{ name: string; source: string }>): Promise<void>;
  bulkRemoveFromRequirements(names: string[], sources: string[]): Promise<void>;
  removeUnusedPackagesWithSnapshot(packages: Array<{ name: string; source: string }>): Promise<void>;
  takeSnapshot(name: string): void;
  restoreSnapshot(id: string): Promise<void>;
  deleteSnapshot(id: string): Promise<void>;
  listSnapshots(): void;
  generateRequirements(): Promise<void>;
  migrateToUv(mode: 'manual' | 'automatic'): Promise<void>;
  migrateToPoetry(): Promise<void>;
  selectManualRequirements(): Promise<void>;
  clearManualRequirements(): Promise<void>;
  generateSetupScript(format: 'bash' | 'powershell' | 'markdown'): Promise<void>;
  syncRequirementsToInstalled(name: string, source: string): Promise<void>;
  handleVenvHealthRequest(): Promise<void>;
  handleUpdatePip(): Promise<void>;
  selectActiveVenvProject(root: string): Promise<void>;
  analyzeUnusedWithCursor(packageNames?: string[], userInitiated?: boolean): Promise<void>;
  markPackageManuallyUsed(name: string): Promise<void>;
  unmarkPackageManuallyUsed(name: string): Promise<void>;
  ignorePackageUpdate(name: string, latestVersion: string): Promise<void>;
  unignorePackageUpdate(name: string): Promise<void>;
  pinPackageToVersion(name: string, version: string, source: string): Promise<void>;
  unpinPackage(name: string): Promise<void>;
}

export function routeWebviewMessage(deps: MessageRouterDeps, msg: WebviewMessage): void {
  switch (msg.type) {
    case 'updatePackage':
    case 'forceUpdatePackage':
      void deps.updatePackage(msg.name);
      break;
    case 'fixConflict': {
      const m = msg as { type: string; requirement: string; packageName: string };
      void deps.fixConflict(m.requirement, m.packageName);
      break;
    }
    case 'rollbackPackage': {
      const m = msg as { type: string; name: string; version: string; dueToIncompatibility?: boolean };
      void deps.rollbackPackage(m.name, m.version, m.dueToIncompatibility);
      break;
    }
    case 'updateAllPackages':
      void deps.updateAllPackages(msg.names);
      break;
    case 'refresh':
      void deps.showVisualizer();
      break;
    case 'openUrl':
      void vscode.env.openExternal(vscode.Uri.parse((msg as { type: string; url: string }).url));
      break;
    case 'installNew':
      void deps.installNewPackage(
        (msg as { type: string; name: string; version?: string }).name,
        (msg as { type: string; name: string; version?: string }).version
      );
      break;
    case 'searchPypi':
      void deps.searchPypi((msg as { type: string; query: string }).query);
      break;
    case 'exportReport':
      void deps.exportReport((msg as { type: string; format: 'markdown' | 'json' }).format);
      break;
    case 'removeFromRequirements':
      void deps.removeFromRequirements(
        (msg as { type: string; name: string; source: string }).name,
        (msg as { type: string; name: string; source: string }).source
      );
      break;
    case 'pinVersion': {
      const m = msg as { type: string; name: string; version: string; source: string };
      void deps.pinVersion(m.name, m.version, m.source);
      break;
    }
    case 'createRequirements':
      void deps.createRequirementsFile();
      break;
    case 'bulkUpdate':
      void deps.updateAllPackages((msg as { type: string; names: string[] }).names);
      break;
    case 'bulkInstall':
      void deps.installAllPackages((msg as { type: string; names: string[] }).names);
      break;
    case 'bulkSync':
      void deps.bulkSyncRequirementsToInstalled(
        (msg as { type: string; packages: Array<{ name: string; source: string }> }).packages
      );
      break;
    case 'bulkRemove': {
      const m = msg as { type: string; names: string[]; sources: string[] };
      void deps.bulkRemoveFromRequirements(m.names, m.sources);
      break;
    }
    case 'bulkRemoveUnusedConfirmed': {
      const m = msg as {
        type: string;
        userInitiated?: boolean;
        packages: Array<{ name: string; source: string }>;
      };
      if (m.userInitiated !== true || !m.packages?.length) {
        return;
      }
      void deps.removeUnusedPackagesWithSnapshot(m.packages);
      break;
    }
    case 'takeSnapshot':
      deps.takeSnapshot((msg as { type: string; name: string }).name);
      break;
    case 'restoreSnapshot':
      void deps.restoreSnapshot((msg as { type: string; id: string }).id);
      break;
    case 'deleteSnapshot':
      void deps.deleteSnapshot((msg as { type: string; id: string }).id);
      break;
    case 'listSnapshots':
      deps.listSnapshots();
      break;
    case 'generateRequirements':
      void deps.generateRequirements();
      break;
    case 'migrateToUv':
      void deps.migrateToUv((msg as { type: string; mode?: 'manual' | 'automatic' }).mode ?? 'manual');
      break;
    case 'migrateToPoetry':
      void deps.migrateToPoetry();
      break;
    case 'selectManualRequirements':
      void deps.selectManualRequirements();
      break;
    case 'clearManualRequirements':
      void deps.clearManualRequirements();
      break;
    case 'generateSetupScript':
      void deps.generateSetupScript(
        (msg as { type: string; format: 'bash' | 'powershell' | 'markdown' }).format
      );
      break;
    case 'syncRequirementsToInstalled': {
      const m = msg as { type: string; name: string; source: string };
      void deps.syncRequirementsToInstalled(m.name, m.source);
      break;
    }
    case 'requestVenvHealth':
      void deps.handleVenvHealthRequest();
      break;
    case 'selectActiveVenvProject': {
      const m = msg as { type: string; root: string };
      if (m.root) {
        void deps.selectActiveVenvProject(m.root);
      }
      break;
    }
    case 'updatePip':
      void deps.handleUpdatePip();
      break;
    case 'cursorAnalyzeUnused': {
      const m = msg as { type: string; packageNames?: string[]; userInitiated?: boolean };
      if (m.userInitiated !== true) {
        return;
      }
      void deps.analyzeUnusedWithCursor(m.packageNames, true);
      break;
    }
    case 'markPackageManuallyUsed': {
      const m = msg as { type: string; name: string };
      if (m.name) {
        void deps.markPackageManuallyUsed(m.name);
      }
      break;
    }
    case 'unmarkPackageManuallyUsed': {
      const m = msg as { type: string; name: string };
      if (m.name) {
        void deps.unmarkPackageManuallyUsed(m.name);
      }
      break;
    }
    case 'ignorePackageUpdate': {
      const m = msg as { type: string; name: string; latestVersion: string };
      if (m.name && m.latestVersion) {
        void deps.ignorePackageUpdate(m.name, m.latestVersion);
      }
      break;
    }
    case 'unignorePackageUpdate': {
      const m = msg as { type: string; name: string };
      if (m.name) {
        void deps.unignorePackageUpdate(m.name);
      }
      break;
    }
    case 'pinPackageToVersion': {
      const m = msg as { type: string; name: string; version: string; source: string };
      if (m.name && m.version) {
        void deps.pinPackageToVersion(m.name, m.version, m.source ?? '');
      }
      break;
    }
    case 'unpinPackage': {
      const m = msg as { type: string; name: string };
      if (m.name) {
        void deps.unpinPackage(m.name);
      }
      break;
    }
  }
}

export function routeSidebarMessage(
  deps: MessageRouterDeps,
  msg: { type: string; url?: string; name?: string; version?: string; names?: string[] }
): void {
  switch (msg.type) {
    case 'openPanel':
      void deps.showVisualizer();
      break;
    case 'openUrl':
      if (msg.url) {
        void vscode.env.openExternal(vscode.Uri.parse(msg.url));
      }
      break;
    case 'updatePackage':
      void deps.updatePackage(msg.name ?? '');
      break;
    case 'rollbackPackage':
      void deps.rollbackPackage(msg.name ?? '', msg.version ?? '');
      break;
    case 'updateAllPackages':
      void deps.updateAllPackages(msg.names ?? []);
      break;
    case 'refresh':
      void deps.showVisualizer();
      break;
  }
}
