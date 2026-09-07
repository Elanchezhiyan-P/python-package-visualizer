import * as vscode from 'vscode';
import { Logger } from '../../utils/logger.js';
import {
  listLegacyRequirementFiles,
  MigrationHelper,
} from '../../modules/migrationHelper.js';
import { PackageScanner } from '../../modules/packageScanner.js';

type MigrationLang = {
  isIt: boolean;
  uvManualConfirm: string;
  uvManualProceed: string;
  uvAutoConfirm: string;
  uvAutoProceed: string;
  uvManualSuccess: string;
  uvAutoSuccess: (deletedCount: number) => string;
  uvNotFound: string;
  migrationFailed: (err: string) => string;
  poetryConfirm: string;
  poetryProceed: string;
  poetrySuccess: string;
};

function getMigrationLang(): MigrationLang {
  const isIt = vscode.workspace
    .getConfiguration('pythonPackageVisualizer')
    .get<string>('language', 'en') === 'it';

  return {
    isIt,
    uvManualConfirm: isIt
      ? 'Verrà creato o sovrascritto pyproject.toml nel progetto. Continuare?'
      : 'This will create or overwrite pyproject.toml in your project. Continue?',
    uvManualProceed: isIt ? 'Migra (manuale)' : 'Migrate (manual)',
    uvAutoConfirm: isIt
      ? 'Migrazione automatica: verrà creato/sovrascritto pyproject.toml, eseguito uv sync e rimossi i file requirements legacy. Continuare?'
      : 'Automatic migration: will create/overwrite pyproject.toml, run uv sync, and remove legacy requirements files. Continue?',
    uvAutoProceed: isIt ? 'Migra (automatico)' : 'Migrate (automatic)',
    uvManualSuccess: isIt
      ? '✅ Migrazione a uv completata. Esegui `uv sync --all-extras` per installare le dipendenze.'
      : '✅ Migrated to uv. Run `uv sync --all-extras` to install dependencies.',
    uvAutoSuccess: (deletedCount: number) => isIt
      ? `✅ Migrazione automatica completata. uv sync eseguito. Rimossi ${deletedCount} file requirements.`
      : `✅ Automatic migration complete. uv sync finished. Removed ${deletedCount} requirements file(s).`,
    uvNotFound: isIt
      ? 'uv non trovato nel PATH. Installa uv prima di usare la migrazione automatica.'
      : 'uv not found in PATH. Install uv before using automatic migration.',
    migrationFailed: (err: string) => isIt
      ? `Migrazione fallita: ${err}`
      : `Migration failed: ${err}`,
    poetryConfirm: isIt
      ? 'Verrà creato o sovrascritto pyproject.toml nel progetto. Continuare?'
      : 'This will create or overwrite pyproject.toml in your project. Continue?',
    poetryProceed: isIt ? 'Migra a Poetry' : 'Migrate to Poetry',
    poetrySuccess: isIt
      ? '✅ Migrazione a Poetry completata. Esegui `poetry install` per installare.'
      : '✅ Migrated to Poetry. Run `poetry install` to install.',
  };
}

/**
 * Facilitates automated dependency migration from traditional requirements lists
 * to modern uv or Poetry pyproject.toml configurations.
 */
export class MigrationHandler {
  constructor(
    private readonly migration: MigrationHelper,
    private readonly scanner: PackageScanner,
    private readonly context: vscode.ExtensionContext,
    private readonly logger: Logger,
    private readonly getWorkspaceRoot: () => string | null,
    private readonly refreshCallback: () => Promise<void>
  ) {}

  /** Manual uv migration: writes pyproject.toml only (current behaviour). */
  async migrateToUvManual(): Promise<void> {
    await this.migrateToUv('manual');
  }

  /** Automatic uv migration: pyproject.toml, uv sync, cleanup legacy requirements. */
  async migrateToUvAutomatic(): Promise<void> {
    await this.migrateToUv('automatic');
  }

  private async migrateToUv(mode: 'manual' | 'automatic'): Promise<void> {
    const lang = getMigrationLang();
    try {
      const root = this.getWorkspaceRoot();
      if (!root) {
        return;
      }

      if (mode === 'automatic') {
        const uvPath = await this.scanner.resolveUvPath(root);
        if (!uvPath) {
          void vscode.window.showErrorMessage(lang.uvNotFound);
          return;
        }
      }

      const choice = await vscode.window.showWarningMessage(
        mode === 'manual' ? lang.uvManualConfirm : lang.uvAutoConfirm,
        { modal: true },
        mode === 'manual' ? lang.uvManualProceed : lang.uvAutoProceed
      );
      const proceedLabel = mode === 'manual' ? lang.uvManualProceed : lang.uvAutoProceed;
      if (choice !== proceedLabel) {
        return;
      }

      const manualPath = this.context.workspaceState.get<string>(
        'pythonPackageVisualizer.manualRequirementsPath'
      );
      const legacyFiles = listLegacyRequirementFiles(root, manualPath);
      const hasDevGroup = (await this.scanner.scanWorkspace(root)).packages
        .some(p => p.group === 'dev');

      const target = await this.migration.migrateToUv(root);

      if (mode === 'automatic') {
        const uvPath = await this.scanner.resolveUvPath(root);
        if (!uvPath) {
          throw new Error(lang.uvNotFound);
        }
        await this.migration.runUvSync(root, uvPath, hasDevGroup);
        const deleted = await this.migration.deleteLegacyRequirementFiles(legacyFiles);
        if (manualPath && deleted.some(f => f === manualPath)) {
          await this.context.workspaceState.update(
            'pythonPackageVisualizer.manualRequirementsPath',
            undefined
          );
        }
        await this.refreshCallback();
        void vscode.window.showInformationMessage(lang.uvAutoSuccess(deleted.length));
      } else {
        void vscode.window.showInformationMessage(lang.uvManualSuccess);
      }

      const doc = await vscode.workspace.openTextDocument(target);
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
    } catch (err) {
      void vscode.window.showErrorMessage(lang.migrationFailed(String(err)));
      this.logger.error(`Migration to uv (${mode}) failed: ${String(err)}`);
      this.logger.show();
    }
  }

  /**
   * Prompts for confirmation and converts current dependencies to Poetry-configured
   * pyproject.toml layout.
   */
  async migrateToPoetry(): Promise<void> {
    const lang = getMigrationLang();
    try {
      const root = this.getWorkspaceRoot();
      if (!root) {
        return;
      }
      const choice = await vscode.window.showWarningMessage(
        lang.poetryConfirm,
        { modal: true },
        lang.poetryProceed
      );
      if (choice !== lang.poetryProceed) {
        return;
      }
      const target = await this.migration.migrateToPoetry(root);
      const doc = await vscode.workspace.openTextDocument(target);
      await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
      void vscode.window.showInformationMessage(lang.poetrySuccess);
    } catch (err) {
      void vscode.window.showErrorMessage(lang.migrationFailed(String(err)));
      this.logger.error(`Migration to Poetry failed: ${String(err)}`);
    }
  }
}
