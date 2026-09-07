import * as vscode from 'vscode';
import type { VisualizerHandler } from '../handlers/visualizerHandler.js';
import type { PackageInstaller } from '../handlers/packageInstaller.js';

export interface IncompatibilityRollbackContext {
  visualizerHandler: VisualizerHandler;
  installerHandler: PackageInstaller;
  refreshVisualizer(): Promise<void>;
}

function isIncompatibilityRollback(
  visualizerHandler: VisualizerHandler,
  packageName: string
): boolean {
  const norm = packageName.toLowerCase().replace(/[-_.]+/g, '-');
  const pkg = visualizerHandler.getLastPackages().find(
    p => p.name.toLowerCase().replace(/[-_.]+/g, '-') === norm
  );
  return Boolean(pkg?.hasConflict);
}

export async function rollbackPackage(
  ctx: IncompatibilityRollbackContext,
  packageName: string,
  version: string,
  dueToIncompatibility?: boolean
): Promise<void> {
  const hadConflict = isIncompatibilityRollback(ctx.visualizerHandler, packageName);
  const ok = await ctx.installerHandler.rollbackPackage(packageName, version);
  if (!ok) {
    return;
  }

  const shouldAutoIgnore = dueToIncompatibility === true || hadConflict;
  if (!shouldAutoIgnore) {
    return;
  }

  const ignoredVersion = await ctx.visualizerHandler.autoIgnoreLatestPypiUpdate(packageName);
  if (ignoredVersion) {
    const lang = vscode.workspace
      .getConfiguration('pythonPackageVisualizer')
      .get<string>('language', 'en');
    const isIt = lang === 'it';
    void vscode.window.showInformationMessage(
      isIt
        ? `Python Packages: aggiornamento PyPI ${ignoredVersion} ignorato automaticamente dopo il ripristino per incompatibilità`
        : `Python Packages: PyPI update ${ignoredVersion} auto-ignored after incompatibility rollback`
    );
    await ctx.refreshVisualizer();
  }
}
