import * as vscode from 'vscode';
import { extractExactPinnedVersion } from '../../../utils/version.js';
import {
  buildInstallSpawnArgs,
  buildUninstallSpawnArgs,
  confirmInstallTarget,
  runInstallTracked,
  runNewPackageInstall,
  runPipSpawn,
  type PackageInstallerProcessContext,
} from './pipProcess.js';
import { packagesEligibleForPostBulkReconcile } from './postBulkReconcile.js';

/**
 * Installs and upgrades multiple selected packages sequentially, showing a unified
 * progress bar inside the editor notifications.
 */
export async function updateAllPackages(
  ctx: PackageInstallerProcessContext,
  names: string[]
): Promise<string[]> {
  const root = ctx.getWorkspaceRoot();
  if (!root || !names.length) {
    return [];
  }
  if (!(await confirmInstallTarget(ctx, root))) {
    return [];
  }

  const succeededNames: string[] = [];
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
          const { exe, args } = await buildInstallSpawnArgs(ctx, [name, '--upgrade'], root);
          const installTime = await runInstallTracked(ctx, exe, args, root, name);

          const scanned = (await ctx.scanner.scanWorkspace(root)).packages;
          const pkg = scanned.find(p => p.name === name);
          if (pkg?.installedVersion) {
            ctx.history.recordVersion(root, name, pkg.installedVersion, 'pip-install', installTime);
            await ctx.syncExactPinOnly(
              root,
              name,
              pkg.installedVersion,
              pkg.source,
              pkg.specifiedVersion,
              'Post-bulk-update'
            );
          }

          succeededNames.push(name);
        } catch (err) {
          failed++;
          ctx.logger.error(`Update failed for ${name}: ${String(err)}`);
        }
      }
    }
  );

  // Retry pin sync only for packages that actually upgraded (wrong source / -r includes).
  const finalScan = (await ctx.scanner.scanWorkspace(root)).packages;
  const eligible = packagesEligibleForPostBulkReconcile(succeededNames, finalScan);
  for (const pkg of eligible) {
    await ctx.syncExactPinOnly(
      root,
      pkg.name,
      pkg.installedVersion,
      pkg.source,
      pkg.specifiedVersion,
      'Post-bulk reconcile'
    );
  }

  const succeeded = succeededNames.length;
  const msg = failed === 0
    ? `✅ Updated ${succeeded} package${succeeded !== 1 ? 's' : ''} successfully.`
    : `⚠️ ${succeeded} updated, ${failed} failed. See Output panel for details.`;

  void vscode.window.showInformationMessage(`Python Packages: ${msg}`);
  await ctx.refreshCallback();
  return succeededNames;
}

/**
 * Installs multiple missing packages sequentially, using pinned versions from
 * dependency files when available.
 */
export async function installAllPackages(
  ctx: PackageInstallerProcessContext,
  names: string[]
): Promise<void> {
  const root = ctx.getWorkspaceRoot();
  if (!root || !names.length) {
    return;
  }
  if (!(await confirmInstallTarget(ctx, root))) {
    return;
  }

  const scanned = (await ctx.scanner.scanWorkspace(root)).packages;
  let succeeded = 0;
  let failed = 0;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Python Packages: Installing ${names.length} packages…`,
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
          const pkg = scanned.find(p => p.name === name);
          // Only honor exact pins (==) when installing; ranges stay flexible for the resolver.
          const version = pkg?.specifiedVersion
            ? extractExactPinnedVersion(pkg.specifiedVersion) ?? undefined
            : undefined;
          await runNewPackageInstall(ctx, name, version, root);
          succeeded++;
        } catch (err) {
          failed++;
          ctx.logger.error(`Install failed for ${name}: ${String(err)}`);
        }
      }
    }
  );

  const msg = failed === 0
    ? `✅ Installed ${succeeded} package${succeeded !== 1 ? 's' : ''} successfully.`
    : `⚠️ ${succeeded} installed, ${failed} failed. See Output panel for details.`;

  void vscode.window.showInformationMessage(`Python Packages: ${msg}`);
  await ctx.refreshCallback();
}

/** Uninstalls packages from the active environment without per-package prompts. */
export async function bulkUninstallPackages(
  ctx: PackageInstallerProcessContext,
  packageNames: string[]
): Promise<{ uninstalled: number; failed: string[] }> {
  const root = ctx.getWorkspaceRoot();
  const unique = [...new Set(packageNames.map(n => n.trim()).filter(Boolean))];
  if (!root || unique.length === 0) {
    return { uninstalled: 0, failed: [] };
  }
  if (!(await confirmInstallTarget(ctx, root))) {
    return { uninstalled: 0, failed: unique };
  }

  try {
    const { exe, args } = await buildUninstallSpawnArgs(ctx, unique, root);
    ctx.logger.info(`Bulk uninstall: ${exe} ${args.join(' ')}`);
    await runPipSpawn(ctx, exe, args, root);
    return { uninstalled: unique.length, failed: [] };
  } catch (err) {
    ctx.logger.warn(`Batch uninstall failed, trying individually: ${String(err)}`);
    let uninstalled = 0;
    const failed: string[] = [];
    for (const name of unique) {
      try {
        const { exe, args } = await buildUninstallSpawnArgs(ctx, [name], root);
        await runPipSpawn(ctx, exe, args, root);
        uninstalled++;
      } catch {
        failed.push(name);
      }
    }
    return { uninstalled, failed };
  }
}
