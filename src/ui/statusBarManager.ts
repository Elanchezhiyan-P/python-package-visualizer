import * as vscode from 'vscode';

export class StatusBarManager {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.item.command = 'extension.showPackageVisualizer';
    this.item.tooltip = 'Python Package Visualizer — click to open';
  }

  update(outdated: number, vulnerable: number, total = 0): void {
    const totalStr = total > 0 ? ` · ${total} pkgs` : '';
    if (outdated === 0 && vulnerable === 0) {
      this.item.text = `$(package) Packages ✓${totalStr}`;
      this.item.backgroundColor = undefined;
      this.item.tooltip = `All ${total} Python packages are up to date`;
    } else {
      const parts: string[] = [];
      if (vulnerable > 0) parts.push(`$(shield) ${vulnerable} CVE`);
      if (outdated > 0)   parts.push(`$(arrow-up) ${outdated} updates`);
      this.item.text = `$(package) ${parts.join('  ')}${totalStr}`;
      this.item.backgroundColor = vulnerable > 0
        ? new vscode.ThemeColor('statusBarItem.errorBackground')
        : new vscode.ThemeColor('statusBarItem.warningBackground');
      this.item.tooltip = parts.join(', ') + ` — ${total} packages total. Click to open.`;
    }
    this.item.show();
  }

  hide(): void {
    this.item.hide();
  }

  dispose(): void {
    this.item.dispose();
  }
}
