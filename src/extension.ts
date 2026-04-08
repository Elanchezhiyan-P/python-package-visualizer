import * as vscode from 'vscode';
import { Logger } from './utils/logger.js';
import { PackageScanner } from './modules/packageScanner.js';
import { VersionChecker } from './services/versionChecker.js';
import { VersionHistoryCache } from './services/versionHistoryCache.js';
import { WebviewPanel } from './ui/webviewPanel.js';
import { SidebarProvider } from './ui/sidebarProvider.js';
import { StatusBarManager } from './ui/statusBarManager.js';
import { CommandController } from './commands/commandController.js';
import { ImportCodeLensProvider } from './providers/importCodeLens.js';
import { ImportHoverProvider } from './providers/importHover.js';
import { FunctionMetricsCodeLensProvider } from './providers/functionCodeLens.js';
import { FunctionHoverProvider } from './providers/functionHover.js';
import { registerFunctionQuickFixes } from './providers/functionQuickFixes.js';
import { ImportScanner } from './modules/importScanner.js';

let _panel: WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const logger = Logger.getInstance(context);
  logger.info('Python Package Visualizer activating...');

  try {
    const scanner      = new PackageScanner(logger);
    const checker      = new VersionChecker(logger, context);
    const historyCache = new VersionHistoryCache(context, logger);
    const panel        = new WebviewPanel(context, logger);
    const sidebar      = new SidebarProvider(context, logger);
    const statusBar    = new StatusBarManager();

    _panel = panel;

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

    // CodeLens + Hover for Python imports
    const importScanner = new ImportScanner(logger);
    const codeLensProvider = new ImportCodeLensProvider(logger, checker, importScanner, scanner);
    const hoverProvider = new ImportHoverProvider(checker, importScanner);

    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(
        { language: 'python', scheme: 'file' },
        codeLensProvider
      ),
      vscode.languages.registerHoverProvider(
        { language: 'python', scheme: 'file' },
        hoverProvider
      ),
    );

    // Refresh CodeLens on config change
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('pythonPackageVisualizer.showImportCodeLens')) {
          codeLensProvider.refresh();
        }
      })
    );

    // Function metrics CodeLens + Hover
    const fnCodeLensProvider = new FunctionMetricsCodeLensProvider(logger);
    const fnHoverProvider    = new FunctionHoverProvider();
    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(
        { language: 'python', scheme: 'file' },
        fnCodeLensProvider
      ),
      vscode.languages.registerHoverProvider(
        { language: 'python', scheme: 'file' },
        fnHoverProvider
      ),
    );

    // Register quick-fix commands (insert docstring, add type hints, etc.)
    registerFunctionQuickFixes(context);

    // Refresh function CodeLens on relevant config changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('pythonPackageVisualizer.showFunctionMetrics') ||
            e.affectsConfiguration('pythonPackageVisualizer.showComplexityWarnings') ||
            e.affectsConfiguration('pythonPackageVisualizer.showTypeHintCoverage') ||
            e.affectsConfiguration('pythonPackageVisualizer.showDocstringWarnings')) {
          fnCodeLensProvider.refresh();
        }
      })
    );

    // Auto-check on open if configured
    const config = vscode.workspace.getConfiguration('pythonPackageVisualizer');
    if (config.get<boolean>('autoCheckOnOpen', true)) {
      setImmediate(() => {
        void controller.triggerAutoCheck();
      });
    }

    // Schedule periodic update checks
    const schedule = config.get<string>('updateCheckSchedule', 'off');
    if (schedule !== 'off') {
      const intervals: Record<string, number> = {
        daily:   24 * 60 * 60 * 1000,
        weekly:  7 * 24 * 60 * 60 * 1000,
        monthly: 30 * 24 * 60 * 60 * 1000,
      };
      const interval = intervals[schedule];
      if (interval) {
        const timer = setInterval(() => {
          void controller.triggerAutoCheck();
        }, interval);
        context.subscriptions.push({ dispose: () => clearInterval(timer) });
      }
    }

    logger.info('Python Package Visualizer activated.');
  } catch (err) {
    logger.error(`Activation failed: ${String(err)}`);
    void vscode.window.showErrorMessage(
      `Python Package Visualizer failed to activate: ${String(err)}. Check the Output panel for details.`
    );
  }
}

export function deactivate(): void {
  _panel?.dispose();
  _panel = undefined;
  Logger.resetInstance();
}
