import * as vscode from 'vscode';
import type { Logger } from '../../utils/logger.js';
import type { PackageScanner, ScannedPackage } from '../../modules/packageScanner.js';
import type { SnapshotHandler } from '../handlers/snapshotHandler.js';
import type { RequirementsHandler } from '../handlers/requirementsHandler.js';
import type { PackageInstaller } from '../handlers/packageInstaller.js';

/** Collaborators for pre-update snapshots. */
export interface PreUpdateSnapshotContext {
  getActiveProjectRoot(): string | null;
  scanner: PackageScanner;
  logger: Logger;
  lastPackages: ScannedPackage[];
  snapshotHandler: SnapshotHandler;
}

/** Collaborators for unused-package removal with snapshot. */
export interface UnusedRemovalContext {
  getWorkspaceRoot(): string | null;
  snapshotBeforeUpdate(label: string): Promise<void>;
  requirementsHandler: RequirementsHandler;
  installerHandler: PackageInstaller;
}

/** Captures the current environment before a manual package update. */
export async function snapshotBeforeUpdate(
  ctx: PreUpdateSnapshotContext,
  label: string
): Promise<void> {
  const root = ctx.getActiveProjectRoot();
  if (!root) {
    return;
  }

  let packages: ScannedPackage[];
  try {
    packages = (await ctx.scanner.scanWorkspace(root)).packages;
  } catch (err) {
    ctx.logger.warn(`Pre-update scan failed, using cached packages: ${String(err)}`);
    packages = ctx.lastPackages;
  }

  if (packages.length === 0) {
    ctx.logger.warn('Pre-update snapshot skipped: no packages to save');
    return;
  }

  await ctx.snapshotHandler.takePreUpdateSnapshot(label, packages);
}

export async function removeUnusedPackagesWithSnapshot(
  ctx: UnusedRemovalContext,
  packages: Array<{ name: string; source: string }>
): Promise<void> {
  const root = ctx.getWorkspaceRoot();
  if (!root || packages.length === 0) {
    return;
  }

  const lang = vscode.workspace
    .getConfiguration('pythonPackageVisualizer')
    .get<string>('language', 'en');
  const isIt = lang === 'it';
  const names = packages.map(p => p.name).join(', ');
  const preview = names.length > 120 ? `${names.slice(0, 117)}…` : names;

  const confirmLabel = isIt ? 'Rimuovi con snapshot' : 'Remove with snapshot';
  const cancelLabel = isIt ? 'Annulla' : 'Cancel';
  const message = isIt
    ? `Rimuovere ${packages.length} pacchetto/i dai file dipendenze e disinstallarli dal venv?\n\nVerrà creato uno snapshot automatico prima della rimozione.\n\n${preview}`
    : `Remove ${packages.length} package(s) from dependency files and uninstall from the venv?\n\nAn automatic snapshot will be saved before removal.\n\n${preview}`;

  const choice = await vscode.window.showWarningMessage(
    message,
    { modal: true },
    confirmLabel,
    cancelLabel
  );
  if (choice !== confirmLabel) {
    return;
  }

  const snapLabel = isIt
    ? `Pre-rimozione inutilizzati (${packages.length} pacchetti)`
    : `Pre-unused-removal (${packages.length} packages)`;
  await ctx.snapshotBeforeUpdate(snapLabel);

  const { removed, failed } = await ctx.requirementsHandler.bulkRemovePackagesWithoutConfirm(packages);

  const removedFromFiles = packages
    .filter(p => !failed.includes(p.name))
    .map(p => p.name);

  let uninstalled = 0;
  let uninstallFailed: string[] = [];
  if (removedFromFiles.length > 0) {
    const uninstallResult = await ctx.installerHandler.bulkUninstallPackages(removedFromFiles);
    uninstalled = uninstallResult.uninstalled;
    uninstallFailed = uninstallResult.failed;
  }

  if (failed.length === 0 && uninstallFailed.length === 0) {
    void vscode.window.showInformationMessage(
      isIt
        ? `Python Packages: Rimossi ${removed} da file dipendenze, ${uninstalled} disinstallati dal venv ✅`
        : `Python Packages: Removed ${removed} from dependency files, ${uninstalled} uninstalled from venv ✅`
    );
  } else {
    const parts: string[] = [];
    if (removed > 0) {
      parts.push(isIt ? `${removed} rimossi da file` : `${removed} removed from files`);
    }
    if (uninstalled > 0) {
      parts.push(isIt ? `${uninstalled} disinstallati` : `${uninstalled} uninstalled`);
    }
    const failedSummary = [...failed, ...uninstallFailed.filter(n => !failed.includes(n))];
    void vscode.window.showWarningMessage(
      isIt
        ? `Python Packages: ${parts.join(', ') || 'Nessuna operazione'}. Falliti: ${failedSummary.join(', ') || 'nessuno'}`
        : `Python Packages: ${parts.join(', ') || 'No changes'}. Failed: ${failedSummary.join(', ') || 'none'}`
    );
  }
}
