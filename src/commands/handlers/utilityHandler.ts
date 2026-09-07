import * as vscode from 'vscode';
import { Logger } from '../../utils/logger.js';
import { WebviewPanel } from '../../ui/webviewPanel.js';
import { SidebarProvider } from '../../ui/sidebarProvider.js';
import { SetupScriptGenerator } from '../../modules/setupScriptGenerator.js';
import { ScannedPackage } from '../../modules/packageScanner.js';

/**
 * Handles utility actions such as searching packages on PyPI and generating setup/bootstrap scripts.
 * Extracted from CommandController to satisfy the Single Responsibility Principle.
 */
export class UtilityHandler {
  /**
   * Why: Passes functional callbacks for getWorkspaceRoot and getLastPackages to maintain complete
   * decoupling from CommandController and state ownership.
   */
  constructor(
    private readonly logger: Logger,
    private readonly panel: WebviewPanel,
    private readonly setupGen: SetupScriptGenerator,
    private readonly getWorkspaceRoot: () => string | null,
    private readonly getLastPackages: () => ScannedPackage[],
    private readonly sidebar?: SidebarProvider
  ) {}

  /**
   * Search package metadata from PyPI using native NodeJS https module.
   * Why: Uses a dynamic lazy import of the native `https` module to optimize startup time,
   * sending results back asynchronously to the webview and sidebar channels.
   *
   * @param query The package name search query.
   */
  async searchPypi(query: string): Promise<void> {
    if (!query.trim()) {
      return;
    }
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
      const json = JSON.parse(data) as {
        info: {
          name: string;
          version: string;
          summary: string;
          home_page: string;
          project_url: string;
        };
      };
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
    } catch (err) {
      this.logger.error(`PyPI search failed for query "${query}": ${String(err)}`);
      void this.panel.webview?.postMessage({ type: 'pypiSearchResult', found: false });
    }
  }

  /**
   * Generates shell scripts for virtual environment bootstrapping.
   * Why: Provides virtual environment configuration scripts based on the currently detected packages.
   *
   * @param format The script shell format.
   */
  async generateSetupScript(format: 'bash' | 'powershell' | 'markdown'): Promise<void> {
    try {
      const root = this.getWorkspaceRoot();
      if (!root) {
        return;
      }
      let content: string;
      let lang: string;
      const lastPackages = this.getLastPackages();
      if (format === 'bash') {
        content = this.setupGen.generateBash(root, lastPackages);
        lang = 'shellscript';
      } else if (format === 'powershell') {
        content = this.setupGen.generatePowershell(root, lastPackages);
        lang = 'powershell';
      } else {
        content = this.setupGen.generateMarkdown(root, lastPackages);
        lang = 'markdown';
      }
      const doc = await vscode.workspace.openTextDocument({ content, language: lang });
      await vscode.window.showTextDocument(doc, { preview: false, viewColumn: vscode.ViewColumn.Beside });
    } catch (err) {
      this.logger.error(`Failed to generate setup script: ${String(err)}`);
      void vscode.window.showErrorMessage(`Failed to generate setup script: ${String(err)}`);
    }
  }
}
