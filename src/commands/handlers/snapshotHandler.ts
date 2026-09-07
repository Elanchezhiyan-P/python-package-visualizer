import * as vscode from 'vscode';
import { Logger } from '../../utils/logger.js';
import { SnapshotManager } from '../../services/snapshotManager.js';
import { WebviewPanel } from '../../ui/webviewPanel.js';
import { PackageInstaller } from './packageInstaller.js';
import { ScannedPackage } from '../../modules/packageScanner.js';

/**
 * Handles environment snapshot activities (taking, restoring, deleting, listing)
 * within the extension.
 */
export class SnapshotHandler {
  constructor(
    private readonly snapshots: SnapshotManager,
    private readonly panel: WebviewPanel,
    private readonly installer: PackageInstaller,
    private readonly logger: Logger,
    private readonly getWorkspaceRoot: () => string | null,
    private readonly refreshCallback: () => Promise<void>
  ) {}

  /**
   * Saves a backup snapshot before package updates without prompting the user.
   */
  async takePreUpdateSnapshot(label: string, packages: ScannedPackage[]): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      return;
    }

    const name = `${label} @ ${new Date().toLocaleString()}`;
    const lang = vscode.workspace
      .getConfiguration('pythonPackageVisualizer')
      .get<string>('language', 'en');
    const isIt = lang === 'it';

    try {
      this.snapshots.takeSnapshot(root, name, packages);
      void this.panel.webview?.postMessage({
        type: 'snapshots',
        snapshots: this.snapshots.listSnapshots(root)
      });
      this.logger.info(`Pre-update snapshot "${name}" saved`);

      const message = isIt
        ? 'Python Packages: Snapshot di backup creato prima dell\'aggiornamento ✅'
        : 'Python Packages: Backup snapshot saved before update ✅';
      void vscode.window.showInformationMessage(message);
    } catch (err) {
      this.logger.error(`Failed to take pre-update snapshot: ${String(err)}`);
      void vscode.window.showWarningMessage(
        isIt
          ? 'Python Packages: Impossibile salvare lo snapshot di backup. L\'aggiornamento continuerà.'
          : 'Python Packages: Could not save backup snapshot. Update will continue.'
      );
    }
  }

  /**
   * Captures the currently installed package versions and persists them
   * in the snapshot history.
   */
  takeSnapshot(name: string, lastPackages: ScannedPackage[]): void {
    const root = this.getWorkspaceRoot();
    if (!root) {
      return;
    }

    try {
      this.snapshots.takeSnapshot(root, name, lastPackages);
      void this.panel.webview?.postMessage({
        type: 'snapshots',
        snapshots: this.snapshots.listSnapshots(root)
      });
      void vscode.window.showInformationMessage('Python Packages: Snapshot saved ✅');
    } catch (err) {
      this.logger.error(`Failed to take snapshot: ${String(err)}`);
      void vscode.window.showErrorMessage('Python Packages: Failed to save snapshot.');
    }
  }

  /**
   * Restores a previously saved snapshot by sequentially installing the exact
   * pinned versions using the package installer.
   */
  async restoreSnapshot(snapshotId: string): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      return;
    }

    const snap = this.snapshots.getSnapshot(root, snapshotId);
    if (!snap) {
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Restore snapshot "${snap.name}"? This will install pinned versions for ${Object.keys(snap.packages).length} packages.`,
      'Restore',
      'Cancel'
    );
    if (confirm !== 'Restore') {
      return;
    }

    for (const [name, version] of Object.entries(snap.packages)) {
      const { exe, args } = await this.installer.buildInstallSpawnArgs([`${name}==${version}`], root);
      try {
        const installTime = await this.installer.runInstallTracked(exe, args, root, name);
        this.installer.history.recordVersion(root, name, version, 'pip-install', installTime);
      } catch (err) {
        this.logger.warn(`Failed to install ${name}==${version} during snapshot restore: ${String(err)}`);
      }
    }

    void vscode.window.showInformationMessage(`Python Packages: Restored "${snap.name}" ✅`);
    await this.refreshCallback();
  }

  /**
   * Deletes a snapshot after confirming with the user.
   */
  async deleteSnapshot(snapshotId: string): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      return;
    }

    const snap = this.snapshots.getSnapshot(root, snapshotId);
    const snapName = snap?.name ?? 'this snapshot';
    const confirmDel = await vscode.window.showWarningMessage(
      `Delete snapshot "${snapName}"? This cannot be undone.`,
      { modal: true },
      'Delete'
    );
    if (confirmDel !== 'Delete') {
      return;
    }

    try {
      this.snapshots.deleteSnapshot(root, snapshotId);
      void this.panel.webview?.postMessage({
        type: 'snapshots',
        snapshots: this.snapshots.listSnapshots(root)
      });
      void vscode.window.showInformationMessage(`Snapshot "${snapName}" deleted.`);
    } catch (err) {
      this.logger.error(`Failed to delete snapshot: ${String(err)}`);
      void vscode.window.showErrorMessage(`Failed to delete snapshot "${snapName}".`);
    }
  }

  /**
   * Posts the list of all snapshots to the webview UI.
   */
  listSnapshots(): void {
    const root = this.getWorkspaceRoot();
    if (root) {
      void this.panel.webview?.postMessage({
        type: 'snapshots',
        snapshots: this.snapshots.listSnapshots(root)
      });
    }
  }
}
