import * as vscode from 'vscode';
import { Logger } from '../../utils/logger.js';
import { ScannedPackage } from '../../modules/packageScanner.js';
import { VersionCheckResult } from '../../services/versionChecker.js';

/**
 * Handles package audit status report generation and exports them
 * in Markdown or JSON format.
 */
export class ReportExporter {
  constructor(
    private readonly logger: Logger,
    private readonly getWorkspaceRoot: () => string | null
  ) {}

  /**
   * Compiles current package states and vulnerabilities into Markdown or JSON
   * and opens the resulting document in a column beside the current webview.
   */
  async exportReport(
    format: 'markdown' | 'json',
    lastPackages: ScannedPackage[],
    lastCheckResults: VersionCheckResult[]
  ): Promise<void> {
    try {
      const root = this.getWorkspaceRoot();
      if (!root) {
        void vscode.window.showErrorMessage('Python Package Visualizer: No workspace folder found.');
        return;
      }

      if (lastCheckResults.length === 0) {
        void vscode.window.showWarningMessage(
          'No package data to export. Please open the Package Visualizer and wait for the scan to finish first.'
        );
        return;
      }

      const date = new Date().toISOString().split('T')[0];
      let content = '';
      let lang = '';

      if (format === 'json') {
        const scannedMap = new Map(lastPackages.map(p => [p.name, p]));
        const data = {
          generated: new Date().toISOString(),
          workspace: root,
          summary: {
            total: lastCheckResults.length,
            upToDate: lastCheckResults.filter(r => r.status === 'up-to-date').length,
            updateAvailable: lastCheckResults.filter(r => r.status === 'update-available').length,
            vulnerable: lastCheckResults.filter(r => (r.vulnerabilities?.length ?? 0) > 0).length,
          },
          packages: lastCheckResults.map(r => ({
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
        const total   = lastCheckResults.length;
        const ok      = lastCheckResults.filter(r => r.status === 'up-to-date').length;
        const updates = lastCheckResults.filter(r => r.status === 'update-available').length;
        const vulns   = lastCheckResults.filter(r => (r.vulnerabilities?.length ?? 0) > 0).length;

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
        for (const r of lastCheckResults) {
          const status = r.status === 'up-to-date' ? '✅ Up to date'
            : r.status === 'update-available' ? '⚠️ Update available'
            : r.status === 'not-installed'     ? '⬜ Not installed'
            : r.status === 'drift'             ? '⚠️ Out of sync'
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
        `Package report exported as ${format.toUpperCase()} (${lastCheckResults.length} packages).`
      );
    } catch (err) {
      void vscode.window.showErrorMessage(`Export failed: ${String(err)}`);
      this.logger.error(`exportReport error: ${String(err)}`);
    }
  }
}
