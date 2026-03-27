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

  update(outdated: number, vulnerable: number): void {
    if (outdated === 0 && vulnerable === 0) {
      this.item.text = '$(package) Packages ✓';
      this.item.backgroundColor = undefined;
      this.item.tooltip = 'All Python packages are up to date';
    } else {
      const parts: string[] = [];
      if (vulnerable > 0) parts.push(`$(shield) ${vulnerable} vulnerable`);
      if (outdated > 0)   parts.push(`$(arrow-up) ${outdated} outdated`);
      this.item.text = `$(package) ${parts.join('  ')}`;
      this.item.backgroundColor = vulnerable > 0
        ? new vscode.ThemeColor('statusBarItem.errorBackground')
        : new vscode.ThemeColor('statusBarItem.warningBackground');
      this.item.tooltip = parts.join(', ') + ' — click to open Package Visualizer';
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
