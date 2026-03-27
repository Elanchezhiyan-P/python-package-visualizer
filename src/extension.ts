import * as vscode from 'vscode';
import { Logger } from './utils/logger.js';
import { PackageScanner } from './modules/packageScanner.js';
import { VersionChecker } from './services/versionChecker.js';
import { VersionHistoryCache } from './services/versionHistoryCache.js';
import { WebviewPanel } from './ui/webviewPanel.js';
import { SidebarProvider } from './ui/sidebarProvider.js';
import { StatusBarManager } from './ui/statusBarManager.js';
import { CommandController } from './commands/commandController.js';

export function activate(context: vscode.ExtensionContext): void {
  const logger = Logger.getInstance(context);
  logger.info('Python Package Visualizer activating...');

  const scanner      = new PackageScanner(logger);
  const checker      = new VersionChecker(logger, context);
  const historyCache = new VersionHistoryCache(context, logger);
  const panel        = new WebviewPanel(context, logger);
  const sidebar      = new SidebarProvider(context, logger);
  const statusBar    = new StatusBarManager();

  // Register the sidebar webview view provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'pythonPackageVisualizer.sidebar',
      sidebar
    )
  );

  // Dispose status bar when extension is deactivated
  context.subscriptions.push(statusBar);

  const controller = new CommandController(
    context,
    logger,
    scanner,
    checker,
    historyCache,
    panel,
    sidebar,
    statusBar
  );

  controller.registerAll();

  // Auto-check on open if configured
  const config = vscode.workspace.getConfiguration('pythonPackageVisualizer');
  if (config.get<boolean>('autoCheckOnOpen', true)) {
    setImmediate(() => {
      void controller.triggerAutoCheck();
    });
  }

  logger.info('Python Package Visualizer activated.');
}

export function deactivate(): void {
  Logger.resetInstance();
}
