import * as vscode from 'vscode';
import { Logger } from '../../utils/logger.js';
import { hasDrift } from '../../utils/version.js';
import { RequirementsSync, SyncResult } from '../../modules/requirementsSync.js';
import { RequirementsGenerator } from '../../modules/requirementsGenerator.js';
import { ScannedPackage } from '../../modules/packageScanner.js';

/**
 * Coordinates dependency file syncing, alignment, creation, removal,
 * and manual file selection.
 */
export class RequirementsHandler {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly reqSync: RequirementsSync,
    private readonly reqGen: RequirementsGenerator,
    private readonly logger: Logger,
    private readonly getWorkspaceRoot: () => string | null,
    private readonly refreshCallback: () => Promise<void>
  ) {}

  /**
   * Legacy: writes an exact pin (`==version`) into the dependency file.
   * Prefer syncRequirementsToInstalled (Align) from the UI — file ← installed.
   * Kept for the webview message protocol / programmatic callers.
   */
  async pinVersion(packageName: string, version: string, sourceFile: string): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root || !version) {
      return;
    }
    try {
      const result = await this.reqSync.syncVersionWithFallback(root, packageName, version, sourceFile);
      this.showSyncOutcome(result, packageName, sourceFile, `📌 Pinned ${packageName} to ==${version} in ${sourceFile}`);
      if (result.outcome === 'synced') {
        await this.refreshCallback();
      }
    } catch (err) {
      void vscode.window.showErrorMessage(`Failed to pin ${packageName}: ${String(err)}`);
    }
  }

  /**
   * Aligns the requirement file with the currently installed version (file ← env).
   * Rewrites the line to `name==installedVersion` (may tighten a range to an exact pin).
   */
  async syncRequirementsToInstalled(
    packageName: string,
    sourceFile: string,
    lastPackages: ScannedPackage[]
  ): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      return;
    }

    const scanned = lastPackages.find(
      p => p.name.toLowerCase() === packageName.toLowerCase()
    );
    const installedVersion = scanned?.installedVersion;
    if (!installedVersion) {
      void vscode.window.showWarningMessage(
        `Cannot sync "${packageName}": installed version not found. Try refreshing first.`
      );
      return;
    }

    try {
      const result = await this.reqSync.syncVersionWithFallback(root, packageName, installedVersion, sourceFile);
      this.showSyncOutcome(
        result,
        packageName,
        sourceFile,
        `🔗 Synced ${packageName}==${installedVersion} in ${sourceFile}`
      );
      // WHY: always refresh to reset the webview sync button state,
      // even when sync fails (not-found, unsupported).
      await this.refreshCallback();
    } catch (err) {
      void vscode.window.showErrorMessage(`Failed to sync ${packageName}: ${String(err)}`);
      await this.refreshCallback();
    }
  }

  /**
   * Aligns requirement files to installed versions for multiple packages (bulk Align).
   * Only syncs packages whose exact pin (`==`) diverges from the installed version.
   */
  async bulkSyncRequirementsToInstalled(
    packages: Array<{ name: string; source: string }>,
    lastPackages: ScannedPackage[]
  ): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root || packages.length === 0) {
      return;
    }

    const lang = vscode.workspace
      .getConfiguration('pythonPackageVisualizer')
      .get<string>('language', 'en');
    const isIt = lang === 'it';

    try {
      let syncedCount = 0;
      const failedNames: string[] = [];
      const unsupportedNames: string[] = [];

      for (const p of packages) {
        const scanned = lastPackages.find(
          lp => lp.name.toLowerCase() === p.name.toLowerCase()
        );
        const installedVersion = scanned?.installedVersion;
        if (!installedVersion) {
          failedNames.push(p.name);
          continue;
        }

        // Verify drift before syncing — skip packages already aligned
        if (!scanned.specifiedVersion || !hasDrift(scanned.specifiedVersion, installedVersion)) {
          continue;
        }

        const result = await this.reqSync.syncVersionWithFallback(root, p.name, installedVersion, p.source);
        if (result.outcome === 'synced') {
          syncedCount++;
        } else if (result.outcome === 'unsupported') {
          unsupportedNames.push(p.name);
        } else {
          failedNames.push(p.name);
        }
      }

      // Build the result message with per-package failure details
      if (syncedCount > 0) {
        let msg = isIt
          ? `🔗 Allineati ${syncedCount} pacchetto/i con le versioni installate.`
          : `🔗 Aligned ${syncedCount} package(s) with installed versions.`;

        if (failedNames.length > 0) {
          msg += isIt
            ? ` Non trovati: ${failedNames.join(', ')}.`
            : ` Not found: ${failedNames.join(', ')}.`;
        }
        if (unsupportedNames.length > 0) {
          msg += isIt
            ? ` Non supportati (modifica manuale): ${unsupportedNames.join(', ')}.`
            : ` Unsupported format (edit manually): ${unsupportedNames.join(', ')}.`;
        }

        void vscode.window.showInformationMessage(msg);
        await this.refreshCallback();
      } else {
        let msg = isIt
          ? 'Nessun pacchetto da allineare.'
          : 'No packages could be aligned.';

        if (unsupportedNames.length > 0) {
          msg = isIt
            ? `Formato non supportato per: ${unsupportedNames.join(', ')}. Modifica il file manualmente.`
            : `Unsupported file format for: ${unsupportedNames.join(', ')}. Edit the file manually.`;
        }
        if (failedNames.length > 0) {
          msg += isIt
            ? ` Non trovati nel file: ${failedNames.join(', ')}.`
            : ` Not found in file: ${failedNames.join(', ')}.`;
        }

        void vscode.window.showWarningMessage(msg);
        await this.refreshCallback();
      }
    } catch (err) {
      const msg = isIt
        ? `Errore nell'allineamento dei pacchetti: ${String(err)}`
        : `Failed to align packages: ${String(err)}`;
      void vscode.window.showErrorMessage(msg);
      await this.refreshCallback();
    }
  }

  /**
   * Bootstraps a default requirements.txt file at the workspace root.
   */
  async createRequirementsFile(): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      return;
    }
    const filePath = vscode.Uri.file(root + '/requirements.txt');
    const content = '# Requirements\n# Add your dependencies here\n# Example: requests==2.31.0\n';
    await vscode.workspace.fs.writeFile(filePath, Buffer.from(content, 'utf-8'));
    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc);
    void vscode.window.showInformationMessage('Created requirements.txt — add your packages and refresh.');
  }

  /**
   * Removes multiple packages from dependency files without per-package prompts.
   * Caller must confirm with the user before invoking.
   */
  async bulkRemovePackagesWithoutConfirm(
    packages: Array<{ name: string; source: string }>
  ): Promise<{ removed: number; failed: string[] }> {
    const root = this.getWorkspaceRoot();
    if (!root || packages.length === 0) {
      return { removed: 0, failed: [] };
    }

    let removed = 0;
    const failed: string[] = [];

    for (const pkg of packages) {
      try {
        const result = await this.reqSync.removePackageWithFallback(root, pkg.name, pkg.source);
        if (result.outcome === 'synced') {
          removed++;
        } else {
          failed.push(pkg.name);
        }
      } catch {
        failed.push(pkg.name);
      }
    }

    await this.refreshCallback();
    return { removed, failed };
  }

  /**
   * Prompts for confirmation and deletes a package declaration from the specified dependency file.
   */
  async removeFromRequirements(packageName: string, sourceFile: string): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Remove "${packageName}" from ${sourceFile}?`,
      { modal: true },
      'Remove'
    );
    if (confirm !== 'Remove') {
      return;
    }

    try {
      const result = await this.reqSync.removePackageWithFallback(root, packageName, sourceFile);
      this.showSyncOutcome(
        result,
        packageName,
        sourceFile,
        `Removed "${packageName}" from ${sourceFile}.`,
        'remove'
      );
      if (result.outcome === 'synced') {
        await this.refreshCallback();
      }
    } catch (err) {
      void vscode.window.showErrorMessage(`Failed to remove package: ${String(err)}`);
    }
  }

  /**
   * Scans all import statements in the workspace source files and generates a requirements.txt file
   * mapping only the actually-imported modules.
   */
  async generateRequirements(): Promise<void> {
    try {
      const root = this.getWorkspaceRoot();
      if (!root) {
        void vscode.window.showErrorMessage('No workspace folder open.');
        return;
      }
      const content = await this.reqGen.generate(root);
      const doc = await vscode.workspace.openTextDocument({ content, language: 'pip-requirements' });
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
      void vscode.window.showInformationMessage('✅ requirements.txt generated from imports. Remember to save it!');
    } catch (err) {
      void vscode.window.showErrorMessage(`Failed to generate requirements: ${String(err)}`);
    }
  }

  /**
   * Prompts the user to manually select a requirements.txt file.
   */
  async selectManualRequirements(): Promise<void> {
    const root = this.getWorkspaceRoot();
    const defaultUri = root ? vscode.Uri.file(root) : undefined;
    const selectedFiles = await vscode.window.showOpenDialog({
      defaultUri,
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      openLabel: 'Select requirements.txt',
      filters: {
        'Python Dependencies': ['txt', 'in', 'toml', 'py', 'cfg', 'Pipfile']
      }
    });

    if (selectedFiles && selectedFiles.length > 0) {
      const selectedPath = selectedFiles[0].fsPath;
      await this.context.workspaceState.update('pythonPackageVisualizer.manualRequirementsPath', selectedPath);
      this.logger.info(`Manually selected requirements file path updated: ${selectedPath}`);
      void vscode.window.showInformationMessage(`Selected manual requirements file: ${selectedPath}`);
      await this.refreshCallback();
    }
  }

  /**
   * Clears the manually selected requirements.txt file path from the workspace state.
   */
  async clearManualRequirements(): Promise<void> {
    await this.context.workspaceState.update('pythonPackageVisualizer.manualRequirementsPath', undefined);
    this.logger.info('Cleared manually selected requirements path');
    void vscode.window.showInformationMessage('Cleared manually selected requirements file.');
    await this.refreshCallback();
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  /**
   * Displays the appropriate VS Code notification based on a SyncResult.
   * Why: Centralizes the outcome→notification mapping so all sync callers behave consistently.
   */
  private showSyncOutcome(
    result: SyncResult,
    packageName: string,
    sourceFile: string,
    successMessage: string,
    action: 'sync' | 'remove' = 'sync'
  ): void {
    switch (result.outcome) {
      case 'synced':
        void vscode.window.showInformationMessage(successMessage);
        break;
      case 'not-found':
        void vscode.window.showWarningMessage(
          action === 'remove'
            ? `Could not find "${packageName}" in ${sourceFile} to remove.`
            : `Could not find "${packageName}" in ${sourceFile} to sync.`
        );
        break;
      case 'unsupported':
        void vscode.window.showWarningMessage(result.reason);
        break;
    }
  }
}
