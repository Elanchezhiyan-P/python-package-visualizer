/**
 * WebviewPanel lifecycle and messaging coordinator.
 * Manages the VS Code webview panel creation, disposal, and bidirectional
 * message passing between the extension host and the webview frontend.
 *
 * WHY types are re-exported: Downstream modules import types from this file path.
 * Re-exporting from the dedicated webviewTypes module preserves backward compatibility
 * without requiring a mass import rewrite across the codebase.
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/logger.js';
import type { VersionCheckResult } from '../services/versionChecker.js';
import type { ScannedPackage, ConflictInfo } from '../modules/packageScanner.js';
import { sanitizeRequiresList } from '../modules/packageScanner.js';
import type { UnusedPackageInfo } from '../modules/importScanner.js';
import { buildDisplayData, buildEnrichedDisplayData } from '../commands/handlers/visualizer/displayCompiler.js';
import { compileWebviewHtml, getWebviewCacheBust } from './webviewHtmlCompiler.js';

// Re-export types for backward compatibility with existing importers
export type {
  HistoryDisplayEntry,
  WebviewMessage,
  ScanStats,
  PackageDisplayData,
  GraphPackageInfo,
} from './webviewTypes.js';

import type {
  WebviewMessage,
  ScanStats,
  PackageDisplayData,
  GraphPackageInfo,
  VenvHealthPayload,
  DepFilesEmptyState,
} from './webviewTypes.js';
import type { VersionHistoryCache } from '../services/versionHistoryCache.js';
import type { PinnedPackageEntry } from '../services/pinnedPackages.js';

export type PackageEnrichment = {
  workspaceRoot: string;
  history: VersionHistoryCache;
  /** Packages the user manually confirmed as used (normalized names). */
  manualUsedPackages?: Set<string>;
  /** Ignored PyPI latest versions (normalized name → version). */
  ignoredUpdates?: Map<string, string>;
  /** User-chosen pins (normalized name → entry). */
  pinnedPackages?: Map<string, PinnedPackageEntry>;
};

export class WebviewPanel {
  private panel: vscode.WebviewPanel | undefined;
  private messageHandlers: Array<(msg: WebviewMessage) => void> = [];
  private pendingMessage: {
    type: 'init' | 'update';
    packages: PackageDisplayData[];
    graphPackages?: GraphPackageInfo[];
    scanStats?: ScanStats;
    language?: string;
    depFilesEmpty?: DepFilesEmptyState;
  } | undefined;
  private isReady = false;
  private loadedHtmlVersion: string | undefined;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: Logger
  ) {}

  /** Whether the webview has sent its ready handshake and can receive postMessage. */
  isWebviewReady(): boolean {
    return this.isReady;
  }

  /** Open or reveal the webview panel */
  show(): void {
    const htmlVersion = getWebviewCacheBust(this.context.extensionUri);
    if (this.panel && this.loadedHtmlVersion !== htmlVersion) {
      this.logger.debug(
        `Webview HTML version changed (${this.loadedHtmlVersion} → ${htmlVersion}), recreating panel`
      );
      this.dispose();
    }

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'pythonPackageVisualizer',
      'Python Package Visualizer',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'media', 'webview'),
        ],
        retainContextWhenHidden: true,
      }
    );

    this.loadedHtmlVersion = htmlVersion;
    this.panel.webview.html = compileWebviewHtml(
      this.panel.webview,
      this.context.extensionUri,
      htmlVersion
    );

    // Forward inbound messages to registered handlers
    this.panel.webview.onDidReceiveMessage(
      (msg: WebviewMessage) => {
        this.logger.debug(`Webview message: ${msg.type}`);
        if (msg.type === 'ready') {
          this.isReady = true;
          if (this.pendingMessage) {
            void this.panel?.webview.postMessage(this.pendingMessage);
            this.pendingMessage = undefined;
          }
          this.messageHandlers.forEach(h => h(msg));
          return;
        }
        // Handle settings updates directly (e.g., language change)
        if ((msg as { type: string; key?: string; value?: unknown }).type === 'updateSetting') {
          const settingsMsg = msg as { type: string; key: string; value: unknown };
          const config = vscode.workspace.getConfiguration('pythonPackageVisualizer');
          void config.update(settingsMsg.key, settingsMsg.value, vscode.ConfigurationTarget.Global);
          return;
        }
        this.messageHandlers.forEach(h => h(msg));
      },
      undefined,
      this.context.subscriptions
    );

    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
        this.isReady = false;
        this.loadedHtmlVersion = undefined;
        this.pendingMessage = undefined;
        this.logger.debug('Webview panel disposed');
      },
      undefined,
      this.context.subscriptions
    );
  }

  /** Register a handler for messages sent from the webview */
  onMessage(handler: (msg: WebviewMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  /** Send initial package data to the webview */
  sendPackages(
    scanned: ScannedPackage[],
    checkResults: VersionCheckResult[],
    unusedPackages?: Set<string> | Map<string, UnusedPackageInfo>,
    scanStats?: ScanStats,
    enrich?: PackageEnrichment,
    depFilesEmpty?: DepFilesEmptyState,
    graphPackages?: GraphPackageInfo[]
  ): void {
    if (!this.panel) {
      return;
    }
    const language = vscode.workspace.getConfiguration('pythonPackageVisualizer').get<string>('language', 'en');
    const packages = enrich
      ? buildEnrichedDisplayData(
          scanned,
          checkResults,
          enrich.workspaceRoot,
          enrich.history,
          unusedPackages,
          enrich.manualUsedPackages,
          enrich.ignoredUpdates,
          enrich.pinnedPackages
        )
      : buildDisplayData(scanned, checkResults, unusedPackages);
    const sanitizedPackages = packages.map(p => ({
      ...p,
      requires: sanitizeRequiresList(p.requires),
    }));
    const sanitizedGraph = graphPackages?.map(p => ({
      ...p,
      requires: sanitizeRequiresList(p.requires),
    }));
    const msg = {
      type: 'init' as const,
      packages: sanitizedPackages,
      graphPackages: sanitizedGraph,
      scanStats,
      language,
      depFilesEmpty,
    };
    if (this.isReady) {
      void this.panel.webview.postMessage(msg);
    } else {
      this.pendingMessage = msg;
    }
  }

  /** Push an updated package list (after update/rollback) */
  updatePackages(
    scanned: ScannedPackage[],
    checkResults: VersionCheckResult[],
    unusedPackages?: Set<string> | Map<string, UnusedPackageInfo>,
    scanStats?: ScanStats,
    enrich?: PackageEnrichment,
    graphPackages?: GraphPackageInfo[]
  ): void {
    if (!this.panel) {
      return;
    }
    const language = vscode.workspace.getConfiguration('pythonPackageVisualizer').get<string>('language', 'en');
    const packages = enrich
      ? buildEnrichedDisplayData(
          scanned,
          checkResults,
          enrich.workspaceRoot,
          enrich.history,
          unusedPackages,
          enrich.manualUsedPackages,
          enrich.ignoredUpdates,
          enrich.pinnedPackages
        )
      : buildDisplayData(scanned, checkResults, unusedPackages);
    const sanitizedPackages = packages.map(p => ({
      ...p,
      requires: sanitizeRequiresList(p.requires),
    }));
    const sanitizedGraph = graphPackages?.map(p => ({
      ...p,
      requires: sanitizeRequiresList(p.requires),
    }));
    const msg = {
      type: 'update' as const,
      packages: sanitizedPackages,
      graphPackages: sanitizedGraph,
      scanStats,
      language,
    };
    if (this.isReady) {
      void this.panel.webview.postMessage(msg);
    } else {
      this.pendingMessage = msg;
    }
  }

  /** Show a loading/progress message in the webview */
  sendProgress(message: string): void {
    if (!this.panel) {
      return;
    }
    void this.panel.webview.postMessage({ type: 'progress', message });
  }

  isVisible(): boolean {
    return this.panel !== undefined;
  }

  /** Expose the underlying vscode.Webview for direct postMessage calls */
  get webview(): vscode.Webview | undefined {
    return this.panel?.webview;
  }

  /** Send dependency conflict results to the webview */
  sendConflicts(conflicts: ConflictInfo[]): void {
    if (!this.panel) { return; }
    void this.panel.webview.postMessage({ type: 'conflicts', conflicts });
  }

  /** Send version history entries to the webview */
  sendHistory(entries: import('./webviewTypes.js').HistoryDisplayEntry[]): void {
    if (!this.panel) {
      return;
    }
    void this.panel.webview.postMessage({ type: 'history', entries });
  }

  /** Send virtual environment health report to the webview */
  sendVenvHealth(payload: VenvHealthPayload): void {
    if (!this.panel) {
      return;
    }
    void this.panel.webview.postMessage({
      type: 'venvHealth',
      report: payload.report,
      activeProject: payload.activeProject,
      availableProjects: payload.availableProjects,
    });
  }

  /** Send IDE / Cursor AI capability info to the webview */
  sendIdeCapabilities(caps: {
    isCursor: boolean;
    ideName: string;
    canOpenChat: boolean;
    enabled: boolean;
    useAutoModel?: boolean;
  }): void {
    if (!this.panel) {
      return;
    }
    void this.panel.webview.postMessage({ type: 'ideCapabilities', ...caps });
  }

  /** Notify webview that Cursor AI analysis was started */
  sendUnusedAiResult(result: {
    analyzed: number;
    referenceHits: Record<string, Array<{ file: string; line: number; snippet: string }>>;
    candidates?: Array<{
      name: string;
      source: string;
      confidence: number;
      hasReferenceHits: boolean;
      suggestedRemove: boolean;
    }>;
  }): void {
    if (!this.panel) {
      return;
    }
    void this.panel.webview.postMessage({ type: 'unusedAiResult', ...result });
  }

  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
    this.isReady = false;
    this.loadedHtmlVersion = undefined;
    this.pendingMessage = undefined;
  }
}
