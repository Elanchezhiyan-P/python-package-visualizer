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

    webviewView.webview.onDidReceiveMessage((msg: { type: string }) => {
      this.logger.debug(`Sidebar message: ${msg.type}`);
      // "openPanel" → open the main editor tab
      if (msg.type === 'openPanel') {
        void vscode.commands.executeCommand('extension.showPackageVisualizer');
        return;
      }
      // Forward any other actions (update / rollback / refresh) to handlers
      this.messageHandlers.forEach(h => h(msg as WebviewMessage));
    });
  }

  onMessage(handler: (msg: WebviewMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  // No-op stubs — sidebar is now a static welcome page only
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  sendPackages(_packages: PackageDisplayData[], _stats?: ScanStats, _type?: 'init' | 'update'): void {}
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
