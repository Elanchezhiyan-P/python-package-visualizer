import * as vscode from 'vscode';
import { Logger } from '../utils/logger.js';
import type { PackageDisplayData, ScanStats, WebviewMessage } from './webviewPanel.js';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public view?: vscode.WebviewView;
  private messageHandlers: Array<(msg: WebviewMessage) => void> = [];

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly logger: Logger
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.view = webviewView;

    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.getWelcomeHtml();

    webviewView.webview.onDidReceiveMessage((msg: { type: string; key?: string; value?: unknown }) => {
      this.logger.debug(`Sidebar message: ${msg.type}`);

      if (msg.type === 'openPanel') {
        void vscode.commands.executeCommand('extension.showPackageVisualizer');
        return;
      }

      if (msg.type === 'getSettings') {
        const config = vscode.workspace.getConfiguration('pythonPackageVisualizer');
        const settings = {
          showImportCodeLens: config.get<boolean>('showImportCodeLens', true),
          showImportHover:    config.get<boolean>('showImportHover', true),
          autoCheckOnOpen:    config.get<boolean>('autoCheckOnOpen', true),
          notifyOnOutdated:   config.get<boolean>('notifyOnOutdated', true),
          updateCheckSchedule: config.get<string>('updateCheckSchedule', 'off'),
          showFunctionMetrics:    config.get<boolean>('showFunctionMetrics', true),
          showMethodCallHover:    config.get<boolean>('showMethodCallHover', true),
          showComplexityWarnings: config.get<boolean>('showComplexityWarnings', true),
          showTypeHintCoverage:   config.get<boolean>('showTypeHintCoverage', true),
          showDocstringWarnings:  config.get<boolean>('showDocstringWarnings', true),
        };
        void this.view?.webview.postMessage({ type: 'settings', settings });
        return;
      }

      if (msg.type === 'updateSetting' && msg.key) {
        const config = vscode.workspace.getConfiguration('pythonPackageVisualizer');
        void config.update(msg.key, msg.value, vscode.ConfigurationTarget.Global);
        return;
      }

      // Forward any other actions (update / rollback / refresh) to handlers
      this.messageHandlers.forEach(h => h(msg as WebviewMessage));
    });
  }

  onMessage(handler: (msg: WebviewMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  sendPackages(packages: PackageDisplayData[], _stats?: ScanStats, _type?: 'init' | 'update'): void {
    if (!this.view) { return; }
    const ok       = packages.filter(p => p.status === 'up-to-date').length;
    const updates  = packages.filter(p => p.status === 'update-available').length;
    const vulnerable = packages.filter(p => p.vulnerabilities && p.vulnerabilities.length > 0).length;
    void this.view.webview.postMessage({ type: 'sidebarStats', ok, updates, vulnerable });
  }
  sendProgress(_message: string): void {}

  isVisible(): boolean {
    return this.view?.visible ?? false;
  }

  private getWelcomeHtml(): string {
    const nonce = getNonce();
    const version: string = (this._context.extension.packageJSON as { version: string }).version;
    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';" />
  <style nonce="${nonce}">
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--vscode-font-family);
      font-size: 12px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 0 0 32px;
    }

    /* ── Hero ──────────────────────────── */
    .hero {
      padding: 20px 16px 16px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      text-align: center;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .hero-icon { font-size: 32px; line-height: 1; margin-bottom: 2px; }
    .hero-name {
      font-size: 13px;
      font-weight: 700;
      color: var(--vscode-foreground);
      letter-spacing: .2px;
    }
    .hero-badge {
      font-size: 10px;
      padding: 1px 8px;
      border-radius: 10px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-weight: 600;
    }
    .hero-desc {
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.6;
      max-width: 220px;
    }

    /* ── Live Stats ────────────────────── */
    #live-stats {
      display: none;
      margin: 10px 16px 0;
      gap: 6px;
      flex-wrap: wrap;
    }
    #live-stats.visible { display: flex; }
    .ls-card {
      flex: 1; min-width: 60px;
      display: flex; flex-direction: column; align-items: center;
      padding: 7px 6px;
      border-radius: 6px;
      font-size: 10px;
      font-weight: 500;
      border: 1px solid transparent;
    }
    .ls-card .ls-num  { font-size: 18px; font-weight: 700; line-height: 1.1; }
    .ls-card .ls-lbl  { opacity: .75; margin-top: 2px; text-align: center; }
    .ls-card.ok       { background: rgba(74,222,128,.1);  color: #4ade80; border-color: rgba(74,222,128,.2); }
    .ls-card.update   { background: rgba(251,146,60,.1);  color: #fb923c; border-color: rgba(251,146,60,.2); }
    .ls-card.vuln     { background: rgba(248,113,113,.1); color: #f87171; border-color: rgba(248,113,113,.2); }

    /* ── CTA button ────────────────────── */
    .cta {
      margin: 12px 16px 0;
    }
    .open-btn {
      width: 100%;
      padding: 9px 12px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 5px;
      font-size: 12px;
      font-family: inherit;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      transition: background .14s;
      letter-spacing: .1px;
    }
    .open-btn:hover  { background: var(--vscode-button-hoverBackground); }
    .open-btn:active { opacity: .85; }

    .shortcut-hint {
      margin: 8px 16px 0;
      font-size: 10.5px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      line-height: 1.7;
    }
    .kbd {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      vertical-align: middle;
    }
    .kbd-key {
      display: inline-block;
      padding: 0 4px;
      background: var(--vscode-keybindingLabel-background, var(--vscode-editor-background));
      border: 1px solid var(--vscode-keybindingLabel-border, var(--vscode-panel-border));
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 9.5px;
      line-height: 1.6;
      color: var(--vscode-keybindingLabel-foreground, var(--vscode-foreground));
    }
    .kbd-plus { font-size: 9px; opacity: .5; padding: 0 1px; }

    /* ── Sections ──────────────────────── */
    .section {
      padding: 14px 16px 0;
    }
    .section-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .7px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
      padding-bottom: 5px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }

    /* ── Getting started steps ─────────── */
    .steps { display: flex; flex-direction: column; gap: 1px; }
    .step {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 7px 6px;
      border-radius: 4px;
      transition: background .12s;
    }
    .step:hover { background: var(--vscode-list-hoverBackground); }
    .step-num {
      width: 18px; height: 18px;
      border-radius: 50%;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      font-size: 10px;
      font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .step-text {
      font-size: 11.5px;
      color: var(--vscode-foreground);
      line-height: 1.5;
    }
    .step-text em {
      font-style: normal;
      color: var(--vscode-descriptionForeground);
      font-size: 10.5px;
      display: block;
      margin-top: 1px;
    }

    /* ── Shortcuts table ───────────────── */
    .shortcuts { display: flex; flex-direction: column; gap: 1px; }
    .shortcut-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 6px;
      border-radius: 4px;
      transition: background .12s;
    }
    .shortcut-row:hover { background: var(--vscode-list-hoverBackground); }
    .shortcut-label {
      font-size: 11px;
      color: var(--vscode-foreground);
    }
    .shortcut-keys {
      display: flex;
      align-items: center;
      gap: 2px;
      flex-shrink: 0;
    }

    /* ── Quick links ───────────────────── */
    .links { display: flex; flex-direction: column; gap: 1px; }
    .link-row {
      display: flex;
      align-items: center;
      gap: 9px;
      padding: 6px 6px;
      border-radius: 4px;
      font-size: 11.5px;
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      cursor: pointer;
      transition: background .12s;
    }
    .link-row:hover {
      background: var(--vscode-list-hoverBackground);
      text-decoration: underline;
    }
    .link-row-icon { font-size: 13px; flex-shrink: 0; width: 18px; text-align: center; }

    /* ── Tips ──────────────────────────── */
    .tips { display: flex; flex-direction: column; gap: 1px; }
    .tip-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 5px 6px;
      border-radius: 4px;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.5;
      transition: background .12s;
    }
    .tip-row:hover { background: var(--vscode-list-hoverBackground); }
    .tip-dot {
      width: 5px; height: 5px;
      border-radius: 50%;
      background: var(--vscode-descriptionForeground);
      flex-shrink: 0;
      margin-top: 6px;
      opacity: .5;
    }
    code {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 10.5px;
      background: var(--vscode-textCodeBlock-background, var(--vscode-editor-background));
      border-radius: 3px;
      padding: 0 3px;
    }
    strong { font-weight: 600; color: var(--vscode-foreground); }

    /* ── Author ────────────────────────── */
    .author {
      margin: 14px 16px 0;
      padding: 12px;
      border-radius: 6px;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-background);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .author-top {
      display: flex;
      align-items: center;
      gap: 9px;
    }
    .author-avatar {
      width: 30px; height: 30px;
      border-radius: 50%;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      display: flex; align-items: center; justify-content: center;
      font-size: 15px;
      flex-shrink: 0;
    }
    .author-info-name {
      font-size: 12px;
      font-weight: 700;
      color: var(--vscode-foreground);
    }
    .author-info-role {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      margin-top: 1px;
    }
    .author-links { display: flex; flex-direction: column; gap: 2px; }
    .author-link {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 11px;
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
      padding: 4px 5px;
      border-radius: 4px;
      transition: background .12s;
    }
    .author-link:hover {
      background: var(--vscode-list-hoverBackground);
      text-decoration: underline;
    }
    .author-link-icon { font-size: 12px; width: 16px; text-align: center; flex-shrink: 0; }

    /* ── Footer ────────────────────────── */
    .footer {
      margin-top: 16px;
      padding: 0 16px;
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      text-align: center;
      opacity: .55;
      line-height: 1.6;
    }
    
    .author-tagline {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      margin-top: 2px;
    }

    .author-meta,
    .author-skills,
    .author-cred {
      font-size: 10.5px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.5;
    }

    /* ── Settings ──────────────────────── */
    .section-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: .08em;
      text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
      padding: 18px 16px 8px;
      opacity: .8;
    }
    .settings-list {
      display: flex;
      flex-direction: column;
      padding: 0 16px;
    }
    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px 0;
      border-bottom: 1px solid color-mix(in srgb, var(--vscode-panel-border) 40%, transparent);
      cursor: pointer;
    }
    .setting-row:last-child { border-bottom: none; }
    .setting-info { flex: 1; min-width: 0; }
    .setting-name {
      font-size: 12px;
      font-weight: 600;
      color: var(--vscode-foreground);
    }
    .setting-desc {
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      margin-top: 2px;
      line-height: 1.4;
    }
    .toggle-switch { flex-shrink: 0; }
    .toggle-track {
      width: 32px;
      height: 18px;
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 10px;
      position: relative;
      transition: background .15s;
      cursor: pointer;
    }
    .toggle-thumb {
      position: absolute;
      top: 2px;
      left: 2px;
      width: 12px;
      height: 12px;
      background: var(--vscode-descriptionForeground);
      border-radius: 50%;
      transition: left .18s ease, background .15s;
    }
    .toggle-switch.on .toggle-track {
      background: var(--vscode-button-background);
      border-color: var(--vscode-button-background);
    }
    .toggle-switch.on .toggle-thumb {
      left: 16px;
      background: white;
    }
    .setting-select {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 11px;
      font-family: inherit;
      cursor: pointer;
      flex-shrink: 0;
    }
    .select-row { cursor: default; }
  </style>
</head>
<body>

  <!-- Hero -->
  <div class="hero">
    <div class="hero-icon">📦</div>
    <div class="hero-name">Python Package Visualizer</div>
    <span class="hero-badge">v${version}</span>
    <div class="hero-desc">Manage and visualize your Python workspace dependencies inside VS Code.</div>
  </div>

  <!-- Live Stats -->
  <div id="live-stats">
    <div class="ls-card ok">
      <span class="ls-num" id="ls-ok">—</span>
      <span class="ls-lbl">up to date</span>
    </div>
    <div class="ls-card update">
      <span class="ls-num" id="ls-update">—</span>
      <span class="ls-lbl">updates</span>
    </div>
    <div class="ls-card vuln">
      <span class="ls-num" id="ls-vuln">—</span>
      <span class="ls-lbl">vulnerable</span>
    </div>
  </div>

  <!-- CTA -->
  <div class="cta">
    <button class="open-btn" id="btn-open">
      <span>▶</span> Open Package Visualizer
    </button>
  </div>
  <div class="shortcut-hint">
    <span class="kbd">
      <span class="kbd-key">Ctrl</span>
      <span class="kbd-plus">+</span>
      <span class="kbd-key">Shift</span>
      <span class="kbd-plus">+</span>
      <span class="kbd-key">P</span>
    </span>
    → <em>Show Package Visualizer</em>
  </div>

  <!-- Getting Started -->
  <div class="section">
    <div class="section-title">Getting Started</div>
    <div class="steps">
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-text">
          Open a Python project
          <em>Open any folder containing a requirements.txt or pyproject.toml</em>
        </div>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <div class="step-text">
          Click <strong>Open Package Visualizer</strong>
          <em>Or use the command palette shortcut above</em>
        </div>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <div class="step-text">
          Browse packages by status
          <em>Up to date, update available, not installed, vulnerable</em>
        </div>
      </div>
      <div class="step">
        <div class="step-num">4</div>
        <div class="step-text">
          Update, rollback or remove
          <em>All changes sync back to your requirements file automatically</em>
        </div>
      </div>
    </div>
  </div>

  <!-- Keyboard Shortcuts -->
  <div class="section">
    <div class="section-title">Keyboard Shortcuts</div>
    <div class="shortcuts">
      <div class="shortcut-row">
        <span class="shortcut-label">Refresh packages</span>
        <div class="shortcut-keys">
          <span class="kbd-key">R</span>
        </div>
      </div>
      <div class="shortcut-row">
        <span class="shortcut-label">Focus search</span>
        <div class="shortcut-keys">
          <span class="kbd-key">/</span>
        </div>
      </div>
      <div class="shortcut-row">
        <span class="shortcut-label">Update all packages</span>
        <div class="shortcut-keys">
          <span class="kbd-key">U</span>
        </div>
      </div>
      <div class="shortcut-row">
        <span class="shortcut-label">Close detail panel</span>
        <div class="shortcut-keys">
          <span class="kbd-key">Esc</span>
        </div>
      </div>
    </div>
  </div>

  <div class="section-label">SETTINGS</div>
  <div class="settings-list">
    <label class="setting-row">
      <div class="setting-info">
        <div class="setting-name">Import annotations</div>
        <div class="setting-desc">Package badges above import lines</div>
      </div>
      <div class="toggle-switch" data-setting="showImportCodeLens">
        <div class="toggle-track"><div class="toggle-thumb"></div></div>
      </div>
    </label>
    <label class="setting-row">
      <div class="setting-info">
        <div class="setting-name">Show hover info</div>
        <div class="setting-desc">Tooltip with package details on hover</div>
      </div>
      <div class="toggle-switch" data-setting="showImportHover">
        <div class="toggle-track"><div class="toggle-thumb"></div></div>
      </div>
    </label>
    <label class="setting-row">
      <div class="setting-info">
        <div class="setting-name">Auto-check on open</div>
        <div class="setting-desc">Scan workspace when project loads</div>
      </div>
      <div class="toggle-switch" data-setting="autoCheckOnOpen">
        <div class="toggle-track"><div class="toggle-thumb"></div></div>
      </div>
    </label>
    <label class="setting-row">
      <div class="setting-info">
        <div class="setting-name">Notify on outdated</div>
        <div class="setting-desc">Show banner when updates available</div>
      </div>
      <div class="toggle-switch" data-setting="notifyOnOutdated">
        <div class="toggle-track"><div class="toggle-thumb"></div></div>
      </div>
    </label>
    <div class="setting-row select-row">
      <div class="setting-info">
        <div class="setting-name">Update check schedule</div>
        <div class="setting-desc">Periodic background check</div>
      </div>
      <select class="setting-select" data-setting="updateCheckSchedule">
        <option value="off">Off</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
      </select>
    </div>
  </div>

  <div class="section-label">CODE INSIGHTS</div>
  <div class="settings-list">
    <label class="setting-row">
      <div class="setting-info">
        <div class="setting-name">Function metrics</div>
        <div class="setting-desc">Show line count, references &amp; complexity</div>
      </div>
      <div class="toggle-switch" data-setting="showFunctionMetrics">
        <div class="toggle-track"><div class="toggle-thumb"></div></div>
      </div>
    </label>
    <label class="setting-row">
      <div class="setting-info">
        <div class="setting-name">Method call hover</div>
        <div class="setting-desc">Package info &amp; API cost on hover</div>
      </div>
      <div class="toggle-switch" data-setting="showMethodCallHover">
        <div class="toggle-track"><div class="toggle-thumb"></div></div>
      </div>
    </label>
    <label class="setting-row">
      <div class="setting-info">
        <div class="setting-name">Complexity warnings</div>
        <div class="setting-desc">Warn when functions are too complex</div>
      </div>
      <div class="toggle-switch" data-setting="showComplexityWarnings">
        <div class="toggle-track"><div class="toggle-thumb"></div></div>
      </div>
    </label>
    <label class="setting-row">
      <div class="setting-info">
        <div class="setting-name">Type hint coverage</div>
        <div class="setting-desc">Warn about missing type hints</div>
      </div>
      <div class="toggle-switch" data-setting="showTypeHintCoverage">
        <div class="toggle-track"><div class="toggle-thumb"></div></div>
      </div>
    </label>
    <label class="setting-row">
      <div class="setting-info">
        <div class="setting-name">Docstring warnings</div>
        <div class="setting-desc">Warn about missing docstrings</div>
      </div>
      <div class="toggle-switch" data-setting="showDocstringWarnings">
        <div class="toggle-track"><div class="toggle-thumb"></div></div>
      </div>
    </label>
  </div>

  <!-- Quick Links -->
  <div class="section">
    <div class="section-title">Quick Links</div>
    <div class="links">
      <a class="link-row" id="link-docs">
        <span class="link-row-icon">📖</span> Documentation
      </a>
      <a class="link-row" id="link-changelog">
        <span class="link-row-icon">📝</span> Changelog
      </a>
      <a class="link-row" id="link-issue">
        <span class="link-row-icon">🐛</span> Report an Issue
      </a>
      <a class="link-row" id="link-star">
        <span class="link-row-icon">⭐</span> Star on GitHub
      </a>
    </div>
  </div>

  <!-- Tips -->
  <div class="section">
    <div class="section-title">Tips</div>
    <div class="tips">
      <div class="tip-row"><div class="tip-dot"></div><span>Click any <strong>package name</strong> to open its PyPI page</span></div>
      <div class="tip-row"><div class="tip-dot"></div><span>Unused packages show a <strong>🗑 Remove</strong> button to delete from requirements</span></div>
      <div class="tip-row"><div class="tip-dot"></div><span>Click <strong>+ Add Package</strong> to search PyPI and install new packages</span></div>
      <div class="tip-row"><div class="tip-dot"></div><span>Click any <strong>column header</strong> to sort the package list</span></div>
      <div class="tip-row"><div class="tip-dot"></div><span>Use <strong>Export</strong> to save a Markdown or JSON report of your packages</span></div>
      <div class="tip-row"><div class="tip-dot"></div><span>The <strong>Dependency Graph</strong> tab shows a collapsible tree — click nodes to expand</span></div>
    </div>
  </div>

  <!-- Author -->
  <div class="author">
    <div class="author-top">
      <div class="author-avatar">👨‍💻</div>
      <div>
        <div class="author-info-name">Elanchezhiyan P</div>
        <div class="author-info-role">Senior Software Developer</div>
        <div class="author-tagline">Full Stack Developer | .NET | AI | Cloud</div>
      </div>
    </div>
    <div class="author-skills">Specialized in .NET, React, AI, Integrations & DevOps</div>
    <div class="author-cred">🧩 Open Source Contributor · 📦 NuGet Publisher · ✍️ Technical Blogger</div>
    <div class="author-links">
      <a class="author-link" id="link-portfolio">
        <span class="author-link-icon">🌐</span> codebyelan.in
      </a>
      <a class="author-link" id="link-github-author">
        <span class="author-link-icon">🐙</span> github.com/Elanchezhiyan-P
      </a>
      <a class="author-link" id="link-linkedin">
        <span class="author-link-icon">🔗</span> LinkedIn
      </a>
    </div>
  </div>

  <div class="footer">MIT License &nbsp;·&nbsp; Python Package Visualizer v${version}</div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    function openUrl(url) { vscode.postMessage({ type: 'openUrl', url }); }

    document.getElementById('btn-open').addEventListener('click', () =>
      vscode.postMessage({ type: 'openPanel' }));

    document.getElementById('link-docs').addEventListener('click', () =>
      openUrl('https://github.com/Elanchezhiyan-P/python-package-visualizer#readme'));
    document.getElementById('link-changelog').addEventListener('click', () =>
      openUrl('https://github.com/Elanchezhiyan-P/python-package-visualizer/blob/main/CHANGELOG.md'));
    document.getElementById('link-issue').addEventListener('click', () =>
      openUrl('https://github.com/Elanchezhiyan-P/python-package-visualizer/issues/new'));
    document.getElementById('link-star').addEventListener('click', () =>
      openUrl('https://github.com/Elanchezhiyan-P/python-package-visualizer'));
    document.getElementById('link-portfolio').addEventListener('click', () =>
      openUrl('https://codebyelan.in'));
    document.getElementById('link-github-author').addEventListener('click', () =>
      openUrl('https://github.com/Elanchezhiyan-P'));
    document.getElementById('link-linkedin').addEventListener('click', () =>
      openUrl('https://www.linkedin.com/in/elanchezhiyan-p/'));

    // ── Settings ─────────────────────────────────────────
    const settingsState = {
      showImportCodeLens: true,
      showImportHover: true,
      autoCheckOnOpen: true,
      notifyOnOutdated: true,
      updateCheckSchedule: 'off',
      showFunctionMetrics: true,
      showMethodCallHover: true,
      showComplexityWarnings: true,
      showTypeHintCoverage: true,
      showDocstringWarnings: true,
    };

    // Request current settings from extension
    vscode.postMessage({ type: 'getSettings' });

    // Apply settings to UI
    function applySettings(s) {
      Object.assign(settingsState, s);
      document.querySelectorAll('.toggle-switch').forEach(el => {
        const key = el.dataset.setting;
        if (settingsState[key]) el.classList.add('on');
        else el.classList.remove('on');
      });
      document.querySelectorAll('.setting-select').forEach(el => {
        const key = el.dataset.setting;
        if (settingsState[key]) el.value = settingsState[key];
      });
    }

    // Toggle handler
    document.querySelectorAll('.toggle-switch').forEach(el => {
      el.addEventListener('click', () => {
        const key = el.dataset.setting;
        const newVal = !settingsState[key];
        settingsState[key] = newVal;
        if (newVal) el.classList.add('on');
        else el.classList.remove('on');
        vscode.postMessage({ type: 'updateSetting', key, value: newVal });
      });
    });

    // Select handler
    document.querySelectorAll('.setting-select').forEach(el => {
      el.addEventListener('change', () => {
        const key = el.dataset.setting;
        const value = el.value;
        settingsState[key] = value;
        vscode.postMessage({ type: 'updateSetting', key, value });
      });
    });

    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'sidebarStats') {
        document.getElementById('ls-ok').textContent     = msg.ok;
        document.getElementById('ls-update').textContent = msg.updates;
        document.getElementById('ls-vuln').textContent   = msg.vulnerable;
        document.getElementById('live-stats').classList.add('visible');
      }
      if (msg.type === 'settings') {
        applySettings(msg.settings);
      }
    });
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
