#!/usr/bin/env node
/**
 * Builds standalone demo HTML pages for README screenshot capture.
 * Run: node scripts/screenshots/build-demo.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DEMO_DIR = path.join(ROOT, 'media', 'screenshots', 'demo');
const WEBVIEW = path.join(ROOT, 'media', 'webview');

const CSS_FILES = [
  'base.css', 'layout.css', 'components.css', 'components/loader.css',
  'components/empty-state.css', 'components/tour.css', 'components/modal.css',
  'components/export-menu.css', 'components/row-context-menu.css', 'list-view.css', 'detail-view.css',
  'graph-view.css', 'tabs-view.css', 'tabs/dashboard.css', 'tabs/unused.css',
  'tabs/licenses.css', 'tabs/snapshots.css', 'tabs/performance.css',
  'tabs/history.css', 'tabs/conflicts.css', 'tabs/venv-health.css',
];

const JS_ASSETS = [
  ['js', 'state.js'], ['js', 'i18n', 'en.js'], ['js', 'i18n', 'it.js'], ['js', 'i18n.js'],
  ['js', 'htmlSafety.js'], ['js', 'versionDisplay.js'], ['js', 'packageMetrics.js'], ['js', 'filters.js'],
  ['js', 'table', 'rowBuilder.js'], ['js', 'table', 'events.js'], ['js', 'table', 'rowContextMenu.js'],
  ['js', 'table', 'dialogs', 'unusedRemoveConfirm.js'], ['js', 'table', 'dialogs.js'],
  ['js', 'table', 'bulk.js'], ['js', 'table.js'], ['js', 'modal.js'], ['js', 'tour.js'],
  ['js', 'graph', 'treeData.js'], ['js', 'graph.js'], ['js', 'tabs', 'licenses.js'], ['js', 'tabs', 'snapshots.js'],
  ['js', 'tabs', 'dashboard.js'], ['js', 'tabs', 'performance.js'], ['js', 'tabs', 'history.js'],
  ['js', 'tabs', 'unused', 'confidenceRows.js'], ['js', 'tabs', 'unused', 'unusedBindings.js'],
  ['js', 'tabs', 'unused.js'], ['js', 'tabs', 'conflicts.js'],
  ['js', 'tabs', 'venv-health', 'installedPackagesPanel.js'], ['js', 'tabs', 'venv-health.js'],
  ['js', 'tabs.js'], ['js', 'detail.js'],
  ['main', 'messageRouter.js'], ['main', 'domSetup.js'], ['main.js'],
];

const SIDEBAR_EN = {
  LOC_WELCOME_TITLE: 'Python Package Visualizer',
  LOC_WELCOME_DESC: 'Manage and visualize your Python workspace dependencies inside VS Code.',
  LOC_STATS_UPTODATE: 'Up to date',
  LOC_STATS_UPDATES: 'Updates',
  LOC_STATS_VULNERABLE: 'Vulnerable',
  LOC_STATS_DRIFTED: 'Out of sync: {count}',
  LOC_STATS_ALL_ALIGNED: 'All in sync',
  LOC_BTN_OPEN: 'Open Package Visualizer',
  LOC_SHORTCUT_PREFIX: 'Ctrl',
  LOC_SHORTCUT_PLUS: '+',
  LOC_SHORTCUT_KEY_P: 'P',
  LOC_SHOW_VISUALIZER: 'Show Package Visualizer',
  LOC_GETTING_STARTED: 'Getting Started',
  LOC_STEP1_TITLE: 'Open a Python project',
  LOC_STEP1_DESC: 'Open any folder containing a requirements.txt or pyproject.toml',
  LOC_STEP2_TITLE: 'Click Open Package Visualizer',
  LOC_STEP2_DESC: 'Or use the command palette shortcut above',
  LOC_STEP3_TITLE: 'Browse packages by status',
  LOC_STEP3_DESC: 'Up to date, update available, not installed, vulnerable',
  LOC_STEP4_TITLE: 'Update, rollback or remove',
  LOC_STEP4_DESC: 'All changes sync back to your requirements file automatically',
  LOC_KEYBOARD_SHORTCUTS: 'Keyboard Shortcuts',
  LOC_REFRESH_PACKAGES: 'Refresh packages',
  LOC_FOCUS_SEARCH: 'Focus search',
  LOC_UPDATE_ALL_PACKAGES: 'Update all packages',
  LOC_CLOSE_DETAIL_PANEL: 'Close detail panel',
  LOC_SETTINGS: 'Settings',
  LOC_IMPORT_ANNOTATIONS: 'Import annotations',
  LOC_IMPORT_ANNOTATIONS_DESC: 'Package badges above import lines',
  LOC_SHOW_HOVER_INFO: 'Show hover info',
  LOC_SHOW_HOVER_INFO_DESC: 'Tooltip with package details on hover',
  LOC_AUTO_CHECK_ON_OPEN: 'Auto-check on open',
  LOC_AUTO_CHECK_ON_OPEN_DESC: 'Scan workspace when project loads',
  LOC_NOTIFY_ON_OUTDATED: 'Notify on outdated',
  LOC_NOTIFY_ON_OUTDATED_DESC: 'Show banner when updates available',
  LOC_UPDATE_CHECK_SCHEDULE: 'Update check schedule',
  LOC_UPDATE_CHECK_SCHEDULE_DESC: 'Periodic background check',
  LOC_SCHEDULE_OFF: 'Off',
  LOC_SCHEDULE_DAILY: 'Daily',
  LOC_SCHEDULE_WEEKLY: 'Weekly',
  LOC_SCHEDULE_MONTHLY: 'Monthly',
  LOC_CODE_INSIGHTS: 'Code Insights',
  LOC_FUNCTION_METRICS: 'Function metrics',
  LOC_FUNCTION_METRICS_DESC: 'Show line count, references & complexity',
  LOC_METHOD_CALL_HOVER: 'Method call hover',
  LOC_METHOD_CALL_HOVER_DESC: 'Package info & API cost on hover',
  LOC_COMPLEXITY_WARNINGS: 'Complexity warnings',
  LOC_COMPLEXITY_WARNINGS_DESC: 'Warn when functions are too complex',
  LOC_TYPE_HINT_COVERAGE: 'Type hint coverage',
  LOC_TYPE_HINT_COVERAGE_DESC: 'Warn about missing type hints',
  LOC_DOCSTRING_WARNINGS: 'Docstring warnings',
  LOC_DOCSTRING_WARNINGS_DESC: 'Warn about missing docstrings',
  LOC_LANGUAGE: '🌐 Language',
  LOC_LANGUAGE_DESC: 'UI language (EN / IT)',
  LOC_QUICK_LINKS: 'Quick Links',
  LOC_DOCUMENTATION: 'Documentation',
  LOC_CHANGELOG: 'Changelog',
  LOC_REPORT_ISSUE: 'Report an Issue',
  LOC_STAR_GITHUB: 'Star on GitHub',
  LOC_TIPS: 'Tips',
  LOC_TIP1: 'Click any <strong>package name</strong> to open its PyPI page',
  LOC_TIP2: 'Unused packages show a <strong>🗑 Remove</strong> button to delete from requirements',
  LOC_TIP3: 'Click <strong>+ Add Package</strong> to search PyPI and install new packages',
  LOC_TIP4: 'Click any <strong>column header</strong> to sort the package list',
  LOC_TIP5: 'Use <strong>Tools</strong> to export reports, generate setup files, or migrate to uv/Poetry',
  LOC_TIP6: 'The <strong>Dependency Graph</strong> tab shows a collapsible tree — click nodes to expand',
  LOC_AUTHOR_ROLE: 'Senior Software Developer',
  LOC_AUTHOR_TAGLINE: 'Full Stack Developer | .NET | AI | Cloud',
  LOC_AUTHOR_SKILLS: 'Specialized in .NET, React, AI, Integrations & DevOps',
  LOC_AUTHOR_CRED: '🧩 Open Source Contributor · 📦 NuGet Publisher · ✍️ Technical Blogger',
  LOC_CREDITS: 'Credits',
  LOC_ORIGINAL_AUTHOR: 'Original author',
  LOC_MAINTAINER: 'Fork maintainer',
  LOC_MAINTAINER_DESC: 'Active development & Cursor integration',
  LOC_MAINTAINER_FORK_LINK: 'python-package-visualizer (fork)',
  LOC_FOOTER_LICENSE: 'MIT License',
  VERSION: '3.2.0',
};

function rel(from, to) {
  return path.relative(from, to).split(path.sep).join('/');
}

function buildWebviewDemo(afterInitJs = '') {
  const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf-8'));
  const theme = fs.readFileSync(path.join(__dirname, 'theme.css'), 'utf-8');
  let html = fs.readFileSync(path.join(WEBVIEW, 'index.html'), 'utf-8');

  const cssLinks = CSS_FILES.map(file =>
    `<link rel="stylesheet" href="${rel(DEMO_DIR, path.join(WEBVIEW, 'css', file))}">`
  ).join('\n  ');

  const scripts = [
    `<script src="${rel(DEMO_DIR, path.join(WEBVIEW, 'vendor', 'd3.v7.min.js'))}"></script>`,
    ...JS_ASSETS.map(segs =>
      `<script src="${rel(DEMO_DIR, path.join(WEBVIEW, ...segs))}"></script>`
    ),
  ].join('\n  ');

  html = html.replace(/<meta http-equiv="Content-Security-Policy"[\s\S]*?>/, '');
  html = html.replace('{{STYLE_CSS_URI}}', `<style>${theme}</style>\n  ${cssLinks}`);
  html = html.replace(/\{\{NONCE\}\}/g, 'demo');
  html = html.replace(/\{\{CSP_SOURCE\}\}/g, '*');
  html = html.replace(/<!-- D3\.js -->[\s\S]*?<\/body>/, '</body>');
  html = html.replace(/\{\{[A-Z0-9_]+\}\}/g, '');

  const bootstrap = `
<script>
  try { localStorage.setItem('tourShown', '1'); } catch (_) {}
  window.acquireVsCodeApi = function () {
    return { postMessage: function () {}, getState: function () { return null; }, setState: function () {} };
  };
  window.startTour = function () {};
</script>
${scripts}
<script>
  window.addEventListener('load', function () {
    try { localStorage.setItem('tourShown', '1'); } catch (_) {}
    window.startTour = function () {};
    if (window.endTour) window.endTour();
    setTimeout(function () {
      window.dispatchEvent(new MessageEvent('message', {
        data: ${JSON.stringify({ type: 'init', ...fixtures })}
      }));
      setTimeout(function () {
        window.startTour = function () {};
        if (window.endTour) window.endTour();
        ${afterInitJs}
      }, 600);
    }, 150);
  });
</script>
</body>`;

  html = html.replace('</body>', bootstrap);
  return html;
}

function buildSettingsDemo() {
  const theme = fs.readFileSync(path.join(__dirname, 'theme.css'), 'utf-8');
  let html = fs.readFileSync(path.join(ROOT, 'media', 'sidebar', 'welcome.html'), 'utf-8');
  html = html.replace(/<meta http-equiv="Content-Security-Policy"[\s\S]*?>/, '');
  html = html.replace(/\{\{NONCE\}\}/g, 'demo');
  html = html.replace('<style nonce="demo">', `<style>\n${theme}\n`);
  html = html.replace(/<script[\s\S]*?<\/script>\s*$/m, '');

  for (const [key, value] of Object.entries(SIDEBAR_EN)) {
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }

  const extras = `
<style>
  #live-stats { display: flex !important; }
  #drift-stat-box { display: none !important; }
  .toggle-switch { pointer-events: none; }
</style>
<script>
  document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('ls-ok').textContent = '6';
    document.getElementById('ls-update').textContent = '3';
    document.getElementById('ls-vuln').textContent = '1';
    document.getElementById('live-stats').classList.add('visible');
    document.querySelectorAll('.toggle-switch').forEach(function (el) { el.classList.add('on'); });
  });
</script>`;

  html = html.replace('</body>', `${extras}\n</body>`);
  return html;
}

fs.mkdirSync(DEMO_DIR, { recursive: true });
fs.writeFileSync(path.join(DEMO_DIR, 'webview-list.html'), buildWebviewDemo());
fs.writeFileSync(path.join(DEMO_DIR, 'webview-list-detail.html'), buildWebviewDemo(`
  var row = document.querySelector('#pkg-table-body tr');
  if (row) row.click();
`));
fs.writeFileSync(path.join(DEMO_DIR, 'webview-dashboard.html'), buildWebviewDemo(`
  window.activeTab = 'dashboard';
  window.showTab('dashboard', window.getFiltered());
`));
fs.writeFileSync(path.join(DEMO_DIR, 'webview-graph.html'), buildWebviewDemo(`
  window.activeTab = 'graph';
  window.showTab('graph', window.getFiltered());
`));
fs.writeFileSync(path.join(DEMO_DIR, 'settings.html'), buildSettingsDemo());
console.log('Demo pages written to media/screenshots/demo/');
