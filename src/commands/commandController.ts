import * as vscode from 'vscode';
import * as cp from 'child_process';
import { Logger } from '../utils/logger.js';
import { PackageScanner } from '../modules/packageScanner.js';
import { ImportScanner } from '../modules/importScanner.js';
import { VersionChecker } from '../services/versionChecker.js';
import { VersionHistoryCache } from '../services/versionHistoryCache.js';
import { WebviewPanel } from '../ui/webviewPanel.js';
import { SidebarProvider } from '../ui/sidebarProvider.js';
import { StatusBarManager } from '../ui/statusBarManager.js';
import { RequirementsSync } from '../modules/requirementsSync.js';
import type { PackageDisplayData, ScanStats, HistoryDisplayEntry } from '../ui/webviewPanel.js';
import type { ScannedPackage } from '../modules/packageScanner.js';
import type { VersionCheckResult } from '../services/versionChecker.js';

export class CommandController {
  private readonly importScanner: ImportScanner;
  private readonly reqSync: RequirementsSync;
  private lastPackages: ScannedPackage[] = [];
  private lastCheckResults: VersionCheckResult[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly logger: Logger,
    private readonly scanner: PackageScanner,
    private readonly checker: VersionChecker,
    private readonly history: VersionHistoryCache,
    private readonly panel: WebviewPanel,
    private readonly sidebar?: SidebarProvider,
    private readonly statusBar?: StatusBarManager
  ) {
    this.importScanner = new ImportScanner(logger);
    this.reqSync = new RequirementsSync(logger);
  }

  registerAll(): void {
    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        'extension.showPackageVisualizer',
        () => this.showVisualizer()
      ),
      vscode.commands.registerCommand(
        'extension.openPackageVisualizer',
        () => this.showVisualizer()
      ),
      vscode.commands.registerCommand(
        'extension.checkPackageUpdates',
        () => this.checkUpdates()
      ),
      vscode.commands.registerCommand(
        'extension.updatePackage',
        (name: string) => this.updatePackage(name)
      ),
      vscode.commands.registerCommand(
        'extension.rollbackPackage',
        (name: string, version: string) => this.rollbackPackage(name, version)
      )
    );

    // Handle messages from webview panel (update / rollback / refresh buttons)
    this.panel.onMessage(msg => {
      switch (msg.type) {
        case 'updatePackage':
          void this.updatePackage(msg.name);
          break;
        case 'rollbackPackage':
          void this.rollbackPackage(msg.name, msg.version);
          break;
        case 'updateAllPackages':
          void this.updateAllPackages(msg.names);
          break;
        case 'refresh':
          void this.showVisualizer();
          break;
        case 'openUrl':
          void vscode.env.openExternal(vscode.Uri.parse((msg as { type: string; url: string }).url));
          break;
        case 'installNew':
          void this.installNewPackage(
            (msg as { type: string; name: string; version?: string }).name,
            (msg as { type: string; name: string; version?: string }).version
          );
          break;
        case 'searchPypi':
          void this.searchPypi((msg as { type: string; query: string }).query);
          break;
        case 'exportReport':
          void this.exportReport((msg as { type: string; format: 'markdown' | 'json' }).format);
          break;
        case 'removeFromRequirements':
          void this.removeFromRequirements(
            (msg as { type: string; name: string; source: string }).name,
            (msg as { type: string; name: string; source: string }).source
          );
          break;
      }
    });

    // Handle messages from sidebar
    if (this.sidebar) {
      this.sidebar.onMessage(msg => {
        const m = msg as { type: string; url?: string; name?: string; version?: string; names?: string[] };
        switch (m.type) {
          case 'openPanel':
            void this.showVisualizer();
            break;
          case 'openUrl':
            if (m.url) {
              void vscode.env.openExternal(vscode.Uri.parse(m.url));
            }
            break;
          case 'updatePackage':
            void this.updatePackage(m.name ?? '');
            break;
          case 'rollbackPackage':
            void this.rollbackPackage(m.name ?? '', m.version ?? '');
            break;
          case 'updateAllPackages':
            void this.updateAllPackages(m.names ?? []);
            break;
          case 'refresh':
            void this.showVisualizer();
            break;
        }
      });
    }
  }

  /** extension.showPackageVisualizer */
  async showVisualizer(): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      void vscode.window.showWarningMessage(
        'Python Package Visualizer: No workspace folder open.'
      );
      return;
    }

    this.panel.show();
    this.panel.sendProgress('Scanning workspace...');
    this.sidebar?.sendProgress('Scanning workspace...');

    try {
      const [scanned, importResult] = await Promise.all([
        this.scanner.scanWorkspace(root),
        this.importScanner.scanImports(root),
      ]);

      if (scanned.length === 0) {
        this.panel.sendProgress(
          'No packages found. Add a requirements.txt, pyproject.toml, or setup.py.'
        );
        this.panel.sendPackages([], []);
        this.sidebar?.sendPackages([], undefined, 'init');
        return;
      }

      this.panel.sendProgress(`Checking ${scanned.length} packages on PyPI...`);
      this.sidebar?.sendProgress(`Checking ${scanned.length} packages on PyPI...`);

      const checkResults = await this.checker.checkAll(
        scanned.map(p => ({ name: p.name, installedVersion: p.installedVersion }))
      );

      // Record currently-installed versions in history (detected)
      for (const pkg of scanned) {
        if (pkg.installedVersion) {
          this.history.recordVersion(root, pkg.name, pkg.installedVersion, 'detected');
        }
      }

      const unusedPackages = this.importScanner.getUnusedPackages(
        scanned.map(p => p.name),
        importResult.importedModules
      );

      this.logger.info(
        `Import scan: ${importResult.filesScanned} files, ` +
        `${importResult.importedModules.size} modules, ` +
        `${unusedPackages.size} possibly unused packages`
      );

      const scanStats: ScanStats = {
        filesScanned: importResult.filesScanned,
        modulesFound: importResult.importedModules.size,
        workspaceRoot: root,
      };

      this.lastPackages = scanned;
      this.lastCheckResults = checkResults;

      this.panel.sendPackages(scanned, checkResults, unusedPackages, scanStats);

      // Send history to panel
      const historyEntries = this.buildHistoryEntries(root);
      this.panel.sendHistory(historyEntries);

      // Also send to sidebar
      if (this.sidebar) {
        const displayData = this.buildDisplayData(scanned, checkResults, unusedPackages);
        this.sidebar.sendPackages(displayData, scanStats, 'init');
      }

      // Update status bar
      this.updateStatusBar(checkResults);

      const outdated = checkResults.filter(r => r.status === 'update-available').length;
      if (outdated > 0) {
        this.logger.info(`${outdated} package(s) have updates available`);
      }
    } catch (err) {
      this.logger.error(`showVisualizer failed: ${String(err)}`);
      void vscode.window.showErrorMessage(
        `Python Package Visualizer: ${String(err)}`
      );
    }
  }

  /** Update all specified packages sequentially */
  async updateAllPackages(names: string[]): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root || !names.length) { return; }

    const python = this.scanner.resolvePythonPath();
    let succeeded = 0;
    let failed = 0;

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Python Packages: Updating ${names.length} packages…`,
        cancellable: false,
      },
      async progress => {
        for (let i = 0; i < names.length; i++) {
          const name = names[i];
          progress.report({
            message: `(${i + 1}/${names.length}) ${name}`,
            increment: 100 / names.length,
          });
          try {
            await this.runPip(
              `"${python}" -m pip install "${name}" --upgrade`,
              root
            );
            succeeded++;
          } catch (err) {
            failed++;
            this.logger.error(`Update failed for ${name}: ${String(err)}`);
          }
        }
      }
    );

    const msg = failed === 0
      ? `✅ Updated ${succeeded} package${succeeded !== 1 ? 's' : ''} successfully.`
      : `⚠️ ${succeeded} updated, ${failed} failed. See Output panel for details.`;

    void vscode.window.showInformationMessage(`Python Packages: ${msg}`);
    await this.refreshVisualizer();
  }

  /** extension.checkPackageUpdates */
  async checkUpdates(): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      return;
    }

    this.logger.info('Checking for package updates...');

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Python Packages: Checking for updates...',
        cancellable: false,
      },
      async () => {
        try {
          const scanned = await this.scanner.scanWorkspace(root);
          const checkResults = await this.checker.checkAll(
            scanned.map(p => ({
              name: p.name,
              installedVersion: p.installedVersion,
            }))
          );

          // Update status bar regardless of panel visibility
          this.updateStatusBar(checkResults);

          if (this.panel.isVisible()) {
            const importResult = await this.importScanner.scanImports(root);
            const unusedPackages = this.importScanner.getUnusedPackages(
              scanned.map(p => p.name),
              importResult.importedModules
            );
            this.panel.updatePackages(scanned, checkResults, unusedPackages);
          }

          // Also update sidebar if visible
          if (this.sidebar?.isVisible()) {
            const importResult = await this.importScanner.scanImports(root);
            const unusedPackages = this.importScanner.getUnusedPackages(
              scanned.map(p => p.name),
              importResult.importedModules
            );
            const displayData = this.buildDisplayData(scanned, checkResults, unusedPackages);
            this.sidebar.sendPackages(displayData, undefined, 'update');
          }

          const outdated = checkResults.filter(
            r => r.status === 'update-available'
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
              await this.showVisualizer();
            }
          }
        } catch (err) {
          this.logger.error(`checkUpdates failed: ${String(err)}`);
        }
      }
    );
  }

  /** extension.updatePackage */
  async updatePackage(packageName: string): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      return;
    }

    const python = this.scanner.resolvePythonPath();
    const cmd = `"${python}" -m pip install "${packageName}" --upgrade`;

    this.logger.info(`Updating: ${cmd}`);

    try {
      await this.runPip(cmd, root);

      // Record in history
      const scanned = await this.scanner.scanWorkspace(root);
      const pkg = scanned.find(p => p.name === packageName);
      if (pkg?.installedVersion) {
        this.history.recordVersion(root, packageName, pkg.installedVersion, 'pip-install');

        // Sync requirements file
        await this.reqSync.syncVersion(root, packageName, pkg.installedVersion, pkg.source);
      }

      void vscode.window.showInformationMessage(
        `Python Packages: ${packageName} updated successfully ✅`
      );

      await this.refreshVisualizer();
    } catch (err) {
      this.logger.error(`Update failed for ${packageName}: ${String(err)}`);
      void vscode.window.showErrorMessage(
        `Python Packages: Failed to update ${packageName}. See Output panel for details.`
      );
      this.logger.show();
    }
  }

  /** extension.rollbackPackage */
  async rollbackPackage(packageName: string, version: string): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      return;
    }

    if (!version) {
      const prev = this.history.getPreviousVersion(root, packageName);
      if (!prev) {
        void vscode.window.showWarningMessage(
          `Python Packages: No previous version recorded for ${packageName}.`
        );
        return;
      }
      version = prev;
    }

    const python = this.scanner.resolvePythonPath();
    const cmd = `"${python}" -m pip install "${packageName}==${version}"`;

    this.logger.info(`Rolling back: ${cmd}`);

    try {
      await this.runPip(cmd, root);
      this.history.recordVersion(root, packageName, version, 'pip-rollback');

      // Sync requirements file with new version
      const scanned = await this.scanner.scanWorkspace(root);
      const pkg = scanned.find(p => p.name === packageName);
      if (pkg) {
        await this.reqSync.syncVersion(root, packageName, version, pkg.source);
      }

      void vscode.window.showInformationMessage(
        `Python Packages: ${packageName} rolled back to ${version} ✅`
      );

      await this.refreshVisualizer();
    } catch (err) {
      this.logger.error(`Rollback failed for ${packageName}: ${String(err)}`);
      void vscode.window.showErrorMessage(
        `Python Packages: Failed to rollback ${packageName}. See Output panel for details.`
      );
      this.logger.show();
    }
  }

  /**
   * Silent auto-check on workspace open.
   * Shows a notification only if outdated packages are found.
   */
  async triggerAutoCheck(): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      return;
    }

    const config = vscode.workspace.getConfiguration('pythonPackageVisualizer');
    if (!config.get<boolean>('notifyOnOutdated', true)) {
      return;
    }

    try {
      const scanned = await this.scanner.scanWorkspace(root);
      if (scanned.length === 0) {
        return;
      }

      const checkResults = await this.checker.checkAll(
        scanned.map(p => ({ name: p.name, installedVersion: p.installedVersion }))
      );

      // Always update the status bar on auto-check
      this.updateStatusBar(checkResults);

      const outdated = checkResults.filter(r => r.status === 'update-available');

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
          this.panel.show();
          this.panel.sendPackages(scanned, checkResults);
        }
      }
    } catch (err) {
      // Silent — auto-check failures should not interrupt the user
      this.logger.warn(`Auto-check failed: ${String(err)}`);
    }
  }

  // ── New Feature Methods ───────────────────────────────────────────────────

  async installNewPackage(packageName: string, version?: string): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root || !packageName.trim()) { return; }
    const python = this.scanner.resolvePythonPath();
    const spec = version ? `"${packageName}==${version}"` : `"${packageName}"`;
    const cmd = `"${python}" -m pip install ${spec}`;
    this.logger.info(`Installing new package: ${cmd}`);
    try {
      await this.runPip(cmd, root);
      void vscode.window.showInformationMessage(`Python Packages: ${packageName} installed ✅`);
      await this.refreshVisualizer();
    } catch (err) {
      this.logger.error(`Install failed: ${String(err)}`);
      void vscode.window.showErrorMessage(`Python Packages: Failed to install ${packageName}`);
    }
  }

  async searchPypi(query: string): Promise<void> {
    if (!query.trim()) { return; }
    try {
      const url = `https://pypi.org/pypi/${encodeURIComponent(query.trim())}/json`;
      const https = await import('https');
      const data = await new Promise<string>((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'python-package-visualizer/0.1' } }, res => {
          let body = '';
          res.on('data', (chunk: Buffer) => { body += chunk; });
          res.on('end', () => resolve(body));
        }).on('error', reject);
      });
      const json = JSON.parse(data) as { info: { name: string; version: string; summary: string; home_page: string; project_url: string } };
      const info = json.info;
      void this.panel.webview?.postMessage({
        type: 'pypiSearchResult',
        found: true,
        name: info.name,
        version: info.version,
        summary: info.summary,
        homePage: info.home_page || info.project_url,
      });
      void this.sidebar?.view?.webview.postMessage({
        type: 'pypiSearchResult',
        found: true,
        name: info.name,
        version: info.version,
        summary: info.summary,
      });
    } catch {
      void this.panel.webview?.postMessage({ type: 'pypiSearchResult', found: false });
    }
  }

  async exportReport(format: 'markdown' | 'json'): Promise<void> {
    try {
      const root = this.getWorkspaceRoot();
      if (!root) {
        void vscode.window.showErrorMessage('Python Package Visualizer: No workspace folder found.');
        return;
      }

      if (this.lastCheckResults.length === 0) {
        void vscode.window.showWarningMessage(
          'No package data to export. Please open the Package Visualizer and wait for the scan to finish first.'
        );
        return;
      }

      const date = new Date().toISOString().split('T')[0];
      let content = '';
      let lang = '';

      if (format === 'json') {
        const scannedMap = new Map(this.lastPackages.map(p => [p.name, p]));
        const data = {
          generated: new Date().toISOString(),
          workspace: root,
          summary: {
            total: this.lastCheckResults.length,
            upToDate: this.lastCheckResults.filter(r => r.status === 'up-to-date').length,
            updateAvailable: this.lastCheckResults.filter(r => r.status === 'update-available').length,
            vulnerable: this.lastCheckResults.filter(r => (r.vulnerabilities?.length ?? 0) > 0).length,
          },
          packages: this.lastCheckResults.map(r => ({
            name: r.packageName,
            installed: r.installedVersion,
            latest: r.latestVersion,
            status: r.status,
            releaseDate: r.releaseDate,
            vulnerabilities: r.vulnerabilities?.length ?? 0,
            source: scannedMap.get(r.packageName)?.source ?? '',
            group: scannedMap.get(r.packageName)?.group ?? 'main',
          })),
        };
        content = JSON.stringify(data, null, 2);
        lang = 'json';
      } else {
        const total   = this.lastCheckResults.length;
        const ok      = this.lastCheckResults.filter(r => r.status === 'up-to-date').length;
        const updates = this.lastCheckResults.filter(r => r.status === 'update-available').length;
        const vulns   = this.lastCheckResults.filter(r => (r.vulnerabilities?.length ?? 0) > 0).length;

        const lines = [
          `# Python Package Report`,
          ``,
          `> **Generated:** ${date}  `,
          `> **Workspace:** \`${root}\`  `,
          `> **Total:** ${total} packages · ✅ ${ok} up-to-date · ⚠️ ${updates} updates · 🔴 ${vulns} vulnerable`,
          ``,
          '## Packages',
          '',
          '| Package | Installed | Latest | Status | Released | CVEs |',
          '|---------|-----------|--------|--------|----------|------|',
        ];
        for (const r of this.lastCheckResults) {
          const status = r.status === 'up-to-date' ? '✅ Up to date'
            : r.status === 'update-available' ? '⚠️ Update available'
            : r.status === 'not-installed'     ? '⬜ Not installed'
            : '❓ Unknown';
          const cves = r.vulnerabilities?.length ? `🔴 ${r.vulnerabilities.length}` : '—';
          lines.push(`| [${r.packageName}](https://pypi.org/project/${r.packageName}/) | \`${r.installedVersion || '—'}\` | \`${r.latestVersion || '—'}\` | ${status} | ${r.releaseDate || '—'} | ${cves} |`);
        }
        content = lines.join('\n');
        lang = 'markdown';
      }

      const doc = await vscode.workspace.openTextDocument({ content, language: lang });
      // Open in a new column beside the webview so the user can see it
      await vscode.window.showTextDocument(doc, {
        preview: false,
        viewColumn: vscode.ViewColumn.Beside,
      });

      void vscode.window.showInformationMessage(
        `Package report exported as ${format.toUpperCase()} (${this.lastCheckResults.length} packages).`
      );
    } catch (err) {
      void vscode.window.showErrorMessage(`Export failed: ${String(err)}`);
      this.logger.error(`exportReport error: ${String(err)}`);
    }
  }

  async removeFromRequirements(packageName: string, sourceFile: string): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) { return; }

    const confirm = await vscode.window.showWarningMessage(
      `Remove "${packageName}" from ${sourceFile}?`,
      { modal: true },
      'Remove'
    );
    if (confirm !== 'Remove') { return; }

    try {
      const removed = await this.requirementsSync.removePackage(root, packageName, sourceFile);
      if (removed) {
        void vscode.window.showInformationMessage(
          `Removed "${packageName}" from ${sourceFile}.`
        );
        // Refresh the view so the removed package disappears
        await this.showVisualizer();
      } else {
        void vscode.window.showWarningMessage(
          `Could not find "${packageName}" in ${sourceFile}. It may have already been removed.`
        );
      }
    } catch (err) {
      void vscode.window.showErrorMessage(`Failed to remove package: ${String(err)}`);
    }
  }

  private buildHistoryEntries(root: string): HistoryDisplayEntry[] {
    const allEntries = this.history.getFullHistory(root);
    return allEntries.map(e => ({
      packageName: e.packageName,
      version: e.version,
      installedAt: e.installedAt,
      source: e.source,
    }));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async refreshVisualizer(): Promise<void> {
    if (this.panel.isVisible() || this.sidebar?.isVisible()) {
      await this.showVisualizer();
    }
  }

  /**
   * Build the PackageDisplayData array (same logic as WebviewPanel.buildPayload,
   * but accessible here so we can send to the sidebar directly).
   */
  private buildDisplayData(
    scanned: ScannedPackage[],
    checkResults: VersionCheckResult[],
    unusedPackages?: Set<string>
  ): PackageDisplayData[] {
    const resultMap = new Map(checkResults.map(r => [r.packageName, r]));
    return scanned.map(pkg => {
      const result = resultMap.get(pkg.name);
      const normName = pkg.name.toLowerCase().replace(/[-_.]+/g, '-');
      return {
        name: pkg.name,
        installedVersion: pkg.installedVersion,
        latestVersion: result?.latestVersion ?? 'unknown',
        status: result?.status ?? 'unknown',
        allVersions: result?.allVersions ?? [],
        summary: result?.summary ?? '',
        homePage: result?.homePage ?? '',
        specifiedVersion: pkg.specifiedVersion,
        source: pkg.source,
        requires: pkg.requires,
        isUsed: unusedPackages ? !unusedPackages.has(normName) : true,
        vulnerabilities: result?.vulnerabilities ?? [],
        releaseDate: result?.releaseDate ?? '',
        group: pkg.group ?? 'main',
      };
    });
  }

  /** Update the status bar with current package stats */
  private updateStatusBar(checkResults: VersionCheckResult[]): void {
    if (!this.statusBar) { return; }
    const outdated = checkResults.filter(r => r.status === 'update-available').length;
    const vulnerable = checkResults.filter(r => r.vulnerabilities && r.vulnerabilities.length > 0).length;
    this.statusBar.update(outdated, vulnerable);
  }

  private runPip(cmd: string, cwd: string): Promise<void> {
    return new Promise((resolve, reject) => {
      cp.exec(cmd, { cwd, timeout: 120_000 }, (err, stdout, stderr) => {
        if (stdout) {
          this.logger.info(stdout.trim());
        }
        if (stderr) {
          this.logger.warn(stderr.trim());
        }
        if (err) {
          reject(new Error(stderr || err.message));
        } else {
          resolve();
        }
      });
    });
  }

  private getWorkspaceRoot(): string | null {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return null;
    }
    return folders[0].uri.fsPath;
  }
}
