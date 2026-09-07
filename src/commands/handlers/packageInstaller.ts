import * as vscode from 'vscode';
import { isExactPin, versionsEquivalent } from '../../utils/version.js';
import { PackageScanner } from '../../modules/packageScanner.js';
import { VersionHistoryCache } from '../../services/versionHistoryCache.js';
import { RequirementsSync } from '../../modules/requirementsSync.js';
import { WebviewPanel } from '../../ui/webviewPanel.js';
import { Logger } from '../../utils/logger.js';
import {
  buildInstallCmd as buildInstallCmdFn,
  buildInstallSpawnArgs as buildInstallSpawnArgsFn,
  buildUninstallSpawnArgs as buildUninstallSpawnArgsFn,
  confirmInstallTarget,
  runInstallTracked as runInstallTrackedFn,
  runNewPackageInstall,
  runPip as runPipFn,
  updatePip as updatePipFn,
  type PackageInstallerProcessContext,
} from './packageInstaller/pipProcess.js';
import {
  bulkUninstallPackages as bulkUninstallPackagesFn,
  installAllPackages as installAllPackagesFn,
  updateAllPackages as updateAllPackagesFn,
} from './packageInstaller/bulkOperations.js';

export {
  packagesEligibleForPostBulkReconcile,
  type PostBulkReconcilePackage,
} from './packageInstaller/postBulkReconcile.js';

/**
 * Handles package installation, rollback, bulk upgrade, and execution tracking
 * for pip and uv commands in the extension.
 */
export class PackageInstaller {
  constructor(
    private readonly scanner: PackageScanner,
    readonly history: VersionHistoryCache,
    private readonly reqSync: RequirementsSync,
    private readonly panel: WebviewPanel,
    private readonly logger: Logger,
    private readonly getWorkspaceRoot: () => string | null,
    private readonly refreshCallback: () => Promise<void>
  ) {}

  private getProcessCtx(): PackageInstallerProcessContext {
    return {
      scanner: this.scanner,
      history: this.history,
      reqSync: this.reqSync,
      panel: this.panel,
      logger: this.logger,
      getWorkspaceRoot: this.getWorkspaceRoot,
      refreshCallback: this.refreshCallback,
      syncExactPinOnly: (
        root,
        packageName,
        version,
        source,
        specifiedVersion,
        contextLabel
      ) => this.syncExactPinOnly(root, packageName, version, source, specifiedVersion, contextLabel),
    };
  }

  /**
   * Syncs the dependency file only when the current specifier is an exact pin (`==`).
   * Flexible constraints (`>=`, `^`, `~=`, …) are left untouched to avoid silent tighten.
   */
  private async syncExactPinOnly(
    root: string,
    packageName: string,
    version: string,
    source: string | undefined,
    specifiedVersion: string | undefined,
    contextLabel: string
  ): Promise<void> {
    if (!source || !version) {
      return;
    }
    if (!isExactPin(specifiedVersion ?? '')) {
      this.logger.info(
        `${contextLabel}: skip file sync for ${packageName} (flexible constraint: ${specifiedVersion || 'none'})`
      );
      return;
    }
    const syncResult = await this.reqSync.syncVersionWithFallback(
      root,
      packageName,
      version,
      source
    );
    if (syncResult.outcome !== 'synced') {
      this.logger.warn(`${contextLabel} sync skipped for ${packageName}: ${syncResult.outcome}`);
    }
  }

  /**
   * Installs a pip package spec (e.g. "contourpy>=1.0.1") to resolve dependency conflicts.
   */
  async installPackageSpec(spec: string, packageName: string): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root || !spec.trim()) {
      return;
    }
    if (!(await confirmInstallTarget(this.getProcessCtx(), root))) {
      return;
    }

    const { exe, args } = await this.buildInstallSpawnArgs([spec], root);
    this.logger.info(`Installing conflict fix: ${exe} ${args.join(' ')}`);

    try {
      const installTime = await this.runInstallTracked(exe, args, root, packageName);

      const scanned = (await this.scanner.scanWorkspace(root)).packages;
      const pkg = scanned.find(p => p.name === packageName);
      if (pkg?.installedVersion) {
        this.history.recordVersion(root, packageName, pkg.installedVersion, 'pip-install', installTime);
        await this.syncExactPinOnly(
          root,
          packageName,
          pkg.installedVersion,
          pkg.source,
          pkg.specifiedVersion,
          'Post-fix'
        );
      }

      void vscode.window.showInformationMessage(
        `Python Packages: ${packageName} updated to satisfy dependency requirement ✅`
      );

      await this.refreshCallback();
    } catch (err) {
      this.logger.error(`Conflict fix failed for ${packageName}: ${String(err)}`);
      void vscode.window.showErrorMessage(
        `Python Packages: Failed to install ${spec}. See Output panel for details.`
      );
      this.logger.show();
    }
  }

  /**
   * Spawns an upgrade command for a single package and synchronizes the pinned
   * version inside the project requirements declarations.
   */
  async updatePackage(packageName: string): Promise<boolean> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      return false;
    }
    if (!(await confirmInstallTarget(this.getProcessCtx(), root))) {
      return false;
    }

    const { exe, args } = await this.buildInstallSpawnArgs([packageName, '--upgrade'], root);
    this.logger.info(`Updating: ${exe} ${args.join(' ')}`);

    try {
      const installTime = await this.runInstallTracked(exe, args, root, packageName);

      const scanned = (await this.scanner.scanWorkspace(root)).packages;
      const pkg = scanned.find(p => p.name === packageName);
      if (pkg?.installedVersion) {
        this.history.recordVersion(root, packageName, pkg.installedVersion, 'pip-install', installTime);
        await this.syncExactPinOnly(
          root,
          packageName,
          pkg.installedVersion,
          pkg.source,
          pkg.specifiedVersion,
          'Post-update'
        );
      }

      void vscode.window.showInformationMessage(
        `Python Packages: ${packageName} updated successfully ✅`
      );

      await this.refreshCallback();
      return true;
    } catch (err) {
      this.logger.error(`Update failed for ${packageName}: ${String(err)}`);
      void vscode.window.showErrorMessage(
        `Python Packages: Failed to update ${packageName}. See Output panel for details.`
      );
      this.logger.show();
      return false;
    }
  }

  /**
   * Reverts a package to a previously recorded version or specific version target,
   * updating both the virtual environment and requirements lists.
   */
  async rollbackPackage(packageName: string, version: string): Promise<boolean> {
    const root = this.getWorkspaceRoot();
    if (!root) {
      return false;
    }
    if (!(await confirmInstallTarget(this.getProcessCtx(), root))) {
      return false;
    }

    let finalVersion = version;
    if (!finalVersion) {
      const prev = this.history.getPreviousVersion(root, packageName);
      if (!prev) {
        void vscode.window.showWarningMessage(
          `Python Packages: No previous version recorded for ${packageName}.`
        );
        return false;
      }
      finalVersion = prev;
    }

    const { exe, args } = await this.buildInstallSpawnArgs([`${packageName}==${finalVersion}`], root);
    this.logger.info(`Rolling back: ${exe} ${args.join(' ')}`);

    try {
      const installTime = await this.runInstallTracked(exe, args, root, packageName);
      this.history.recordVersion(root, packageName, finalVersion, 'pip-rollback', installTime);

      const scanned = (await this.scanner.scanWorkspace(root)).packages;
      const pkg = scanned.find(p => p.name === packageName);
      if (pkg) {
        await this.syncExactPinOnly(
          root,
          packageName,
          finalVersion,
          pkg.source,
          pkg.specifiedVersion,
          'Post-rollback'
        );
      }

      void vscode.window.showInformationMessage(
        `Python Packages: ${packageName} rolled back to ${finalVersion} ✅`
      );

      await this.refreshCallback();
      return true;
    } catch (err) {
      this.logger.error(`Rollback failed for ${packageName}: ${String(err)}`);
      void vscode.window.showErrorMessage(
        `Python Packages: Failed to rollback ${packageName}. See Output panel for details.`
      );
      this.logger.show();
      return false;
    }
  }

  /**
   * Pins a package to an explicit version: install if needed, always rewrite
   * the dependency file to ==version. Persistence of Ignore/Pinned tag is
   * handled by the caller (no ExtensionContext here).
   */
  async pinPackageToVersion(
    packageName: string,
    version: string,
    sourceFile: string
  ): Promise<boolean> {
    const root = this.getWorkspaceRoot();
    if (!root || !packageName.trim() || !version.trim()) {
      return false;
    }

    const scannedBefore = (await this.scanner.scanWorkspace(root)).packages;
    const existing = scannedBefore.find(
      p => p.name.toLowerCase() === packageName.toLowerCase()
    );
    const needsInstall = !existing?.installedVersion
      || !versionsEquivalent(existing.installedVersion, version);

    if (needsInstall) {
      if (!(await confirmInstallTarget(this.getProcessCtx(), root))) {
        return false;
      }
      const { exe, args } = await this.buildInstallSpawnArgs(
        [`${packageName}==${version}`],
        root
      );
      this.logger.info(`Pinning: ${exe} ${args.join(' ')}`);
      try {
        const installTime = await this.runInstallTracked(exe, args, root, packageName);
        this.history.recordVersion(root, packageName, version, 'pip-install', installTime);
      } catch (err) {
        this.logger.error(`Pin install failed for ${packageName}: ${String(err)}`);
        void vscode.window.showErrorMessage(
          `Python Packages: Failed to pin ${packageName} to ${version}. See Output panel for details.`
        );
        this.logger.show();
        return false;
      }
    }

    const source = sourceFile || existing?.source || '';
    const syncResult = await this.reqSync.syncVersionWithFallback(
      root,
      packageName,
      version,
      source
    );
    if (syncResult.outcome !== 'synced') {
      this.logger.warn(`Pin file sync for ${packageName}: ${syncResult.outcome}`);
      void vscode.window.showWarningMessage(
        `Python Packages: ${packageName} is at ${version} but the dependency file could not be updated (${syncResult.outcome}).`
      );
    } else {
      void vscode.window.showInformationMessage(
        `Python Packages: ${packageName} pinned to ==${version} ✅`
      );
    }
    return true;
  }

  async updateAllPackages(names: string[]): Promise<string[]> {
    return updateAllPackagesFn(this.getProcessCtx(), names);
  }

  async installAllPackages(names: string[]): Promise<void> {
    return installAllPackagesFn(this.getProcessCtx(), names);
  }

  async installNewPackage(packageName: string, version?: string): Promise<void> {
    const root = this.getWorkspaceRoot();
    if (!root || !packageName.trim()) {
      return;
    }
    if (!(await confirmInstallTarget(this.getProcessCtx(), root))) {
      return;
    }

    try {
      await runNewPackageInstall(this.getProcessCtx(), packageName, version, root);
      void vscode.window.showInformationMessage(`Python Packages: ${packageName} installed ✅`);
      await this.refreshCallback();
    } catch (err) {
      this.logger.error(`Install failed: ${String(err)}`);
      void vscode.window.showErrorMessage(`Python Packages: Failed to install ${packageName}`);
    }
  }

  async buildInstallCmd(packageSpec: string, root: string): Promise<string> {
    return buildInstallCmdFn(this.getProcessCtx(), packageSpec, root);
  }

  async buildInstallSpawnArgs(packageArgs: string[], root: string): Promise<{ exe: string; args: string[] }> {
    return buildInstallSpawnArgsFn(this.getProcessCtx(), packageArgs, root);
  }

  async buildUninstallSpawnArgs(
    packageNames: string[],
    root: string
  ): Promise<{ exe: string; args: string[] }> {
    return buildUninstallSpawnArgsFn(this.getProcessCtx(), packageNames, root);
  }

  async updatePip(): Promise<boolean> {
    return updatePipFn(this.getProcessCtx());
  }

  async bulkUninstallPackages(
    packageNames: string[]
  ): Promise<{ uninstalled: number; failed: string[] }> {
    return bulkUninstallPackagesFn(this.getProcessCtx(), packageNames);
  }

  runInstallTracked(exe: string, args: string[], cwd: string, packageName: string): Promise<number> {
    return runInstallTrackedFn(this.getProcessCtx(), exe, args, cwd, packageName);
  }

  runPip(cmd: string, cwd: string): Promise<void> {
    return runPipFn(this.getProcessCtx(), cmd, cwd);
  }
}
