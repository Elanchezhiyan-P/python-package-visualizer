import * as vscode from 'vscode';
import { VersionChecker, VersionCheckResult } from '../services/versionChecker.js';
import { ImportScanner } from '../modules/importScanner.js';
import { PackageScanner } from '../modules/packageScanner.js';
import { Logger } from '../utils/logger.js';

interface ImportInfo {
  line: number;
  range: vscode.Range;
  rawModule: string;
  packageName: string;
}

export class ImportCodeLensProvider implements vscode.CodeLensProvider {
  private cache = new Map<string, VersionCheckResult>();
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(
    private readonly logger: Logger,
    private readonly checker: VersionChecker,
    private readonly importScanner: ImportScanner,
    private readonly packageScanner: PackageScanner,
  ) {}

  refresh(): void {
    this.cache.clear();
    this._onDidChangeCodeLenses.fire();
  }

  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const config = vscode.workspace.getConfiguration('pythonPackageVisualizer');
    if (!config.get<boolean>('showImportCodeLens', true)) {
      return [];
    }

    const imports = this.parseImports(document);
    const lenses: vscode.CodeLens[] = [];

    // Look up installed versions for the workspace
    let installedMap = new Map<string, string>();
    const ws = vscode.workspace.workspaceFolders?.[0];
    if (ws) {
      try {
        const scanned = await this.packageScanner.scanWorkspace(ws.uri.fsPath);
        installedMap = new Map(scanned.map(p => [p.name.toLowerCase(), p.installedVersion || '']));
      } catch {
        // ignore
      }
    }

    for (const imp of imports) {
      let result = this.cache.get(imp.packageName);
      if (!result) {
        try {
          result = await this.checker.checkPackage(imp.packageName, installedMap.get(imp.packageName.toLowerCase()) || '');
          this.cache.set(imp.packageName, result);
        } catch {
          continue;
        }
      }

      const installedVer = installedMap.get(imp.packageName.toLowerCase()) || '';
      const latestVer = result.latestVersion;
      const vulns = result.vulnerabilities?.length ?? 0;

      // Build the status icon and primary lens title
      let icon = '\u{1F4E6}';
      let versionDisplay: string;
      if (installedVer && installedVer !== latestVer) {
        versionDisplay = `${installedVer} \u2192 ${latestVer}`;
        icon = '\u26A0\uFE0F';
      } else if (installedVer) {
        versionDisplay = `v${installedVer}`;
        icon = '\u2705';
      } else {
        versionDisplay = `v${latestVer}`;
        icon = '\u{1F4E6}';
      }
      if (vulns > 0) { icon = '\u{1F534}'; }

      const tooltip = `${result.packageName}${result.summary ? `\n\n${result.summary}` : ''}\n\nInstalled: ${installedVer || 'not installed'}\nLatest: ${latestVer}${vulns > 0 ? `\n${vulns} vulnerabilit${vulns > 1 ? 'ies' : 'y'}` : ''}`;

      // Primary lens — opens the visualizer
      lenses.push(new vscode.CodeLens(imp.range, {
        title: `${icon} ${result.packageName} ${versionDisplay}`,
        tooltip,
        command: 'extension.openPackageVisualizer',
        arguments: [],
      }));

      // Quick action lens — depends on status
      if (vulns > 0) {
        lenses.push(new vscode.CodeLens(imp.range, {
          title: `\u{1F534} ${vulns} CVE${vulns > 1 ? 's' : ''} \u2014 View`,
          command: 'extension.openPackageVisualizer',
          arguments: [],
        }));
      } else if (installedVer && installedVer !== latestVer) {
        lenses.push(new vscode.CodeLens(imp.range, {
          title: `\u2191 Update to ${latestVer}`,
          tooltip: `Run pip install --upgrade ${imp.packageName}`,
          command: 'extension.updatePackage',
          arguments: [imp.packageName],
        }));
      } else if (!installedVer) {
        lenses.push(new vscode.CodeLens(imp.range, {
          title: `\u2B07 Install`,
          tooltip: `Run pip install ${imp.packageName}`,
          command: 'extension.updatePackage',
          arguments: [imp.packageName],
        }));
      }

      // PyPI link lens
      lenses.push(new vscode.CodeLens(imp.range, {
        title: `\u2197 PyPI`,
        tooltip: `Open PyPI page for ${imp.packageName}`,
        command: 'vscode.open',
        arguments: [vscode.Uri.parse(`https://pypi.org/project/${imp.packageName}/`)],
      }));
    }
    this.logger.debug(`CodeLens: produced ${lenses.length} lenses for ${document.uri.fsPath}`);
    return lenses;
  }

  private parseImports(document: vscode.TextDocument): ImportInfo[] {
    const result: ImportInfo[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const text = line.text.trim();
      // Skip comments
      if (text.startsWith('#')) { continue; }

      // Match: import X, import X.Y, import X as Z
      let match = text.match(/^import\s+([a-zA-Z_][\w.]*)/);
      if (match) {
        const mod = match[1];
        const pkg = this.importScanner.mapToPackageName(mod);
        if (pkg && !seen.has(pkg)) {
          seen.add(pkg);
          result.push({
            line: i,
            range: new vscode.Range(i, 0, i, line.text.length),
            rawModule: mod,
            packageName: pkg,
          });
        }
        continue;
      }

      // Match: from X import Y or from X.Y import Z
      match = text.match(/^from\s+([a-zA-Z_][\w.]*)\s+import/);
      if (match) {
        const mod = match[1];
        const pkg = this.importScanner.mapToPackageName(mod);
        if (pkg && !seen.has(pkg)) {
          seen.add(pkg);
          result.push({
            line: i,
            range: new vscode.Range(i, 0, i, line.text.length),
            rawModule: mod,
            packageName: pkg,
          });
        }
      }
    }
    return result;
  }
}
