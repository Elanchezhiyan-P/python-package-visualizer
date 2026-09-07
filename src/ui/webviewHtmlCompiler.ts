/**
 * Webview HTML Template Compiler.
 * Resolves media asset URIs and interpolates placeholder tokens in the HTML template.
 * Extracted from WebviewPanel to isolate the heavy template processing logic.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { getNonce } from '../utils/nonce.js';

/**
 * Asset manifest entry describing a JS file and its HTML template placeholder.
 * WHY: Declarative manifest avoids repetitive URI.joinPath boilerplate —
 * adding a new script is a single line instead of 10.
 */
interface JsAsset {
  /** Path segments relative to `media/webview/` */
  segments: string[];
  /** Template placeholder name (e.g. `STATE_JS_URI` → `{{STATE_JS_URI}}`) */
  placeholder: string;
}

/** Ordered list of JS assets loaded by the webview — order matters for script execution. */
const JS_ASSETS: JsAsset[] = [
  { segments: ['js', 'state.js'],             placeholder: 'STATE_JS_URI' },
  { segments: ['js', 'i18n', 'en.js'],        placeholder: 'I18N_EN_JS_URI' },
  { segments: ['js', 'i18n', 'it.js'],        placeholder: 'I18N_IT_JS_URI' },
  { segments: ['js', 'i18n.js'],              placeholder: 'I18N_JS_URI' },
  { segments: ['js', 'htmlSafety.js'],        placeholder: 'HTML_SAFETY_JS_URI' },
  { segments: ['js', 'versionDisplay.js'],    placeholder: 'VERSION_DISPLAY_JS_URI' },
  { segments: ['js', 'packageMetrics.js'],    placeholder: 'PACKAGE_METRICS_JS_URI' },
  { segments: ['js', 'filters.js'],           placeholder: 'FILTERS_JS_URI' },
  { segments: ['js', 'table', 'rowBuilder.js'], placeholder: 'TABLE_ROW_BUILDER_JS_URI' },
  { segments: ['js', 'table', 'events.js'],     placeholder: 'TABLE_EVENTS_JS_URI' },
  { segments: ['js', 'table', 'rowContextMenu.js'], placeholder: 'TABLE_ROW_CONTEXT_MENU_JS_URI' },
  { segments: ['js', 'table', 'dialogs', 'unusedRemoveConfirm.js'], placeholder: 'TABLE_UNUSED_REMOVE_CONFIRM_JS_URI' },
  { segments: ['js', 'table', 'dialogs.js'],    placeholder: 'TABLE_DIALOGS_JS_URI' },
  { segments: ['js', 'table', 'bulk.js'],       placeholder: 'TABLE_BULK_JS_URI' },
  { segments: ['js', 'table.js'],             placeholder: 'TABLE_JS_URI' },
  { segments: ['js', 'modal.js'],             placeholder: 'MODAL_JS_URI' },
  { segments: ['js', 'tour.js'],              placeholder: 'TOUR_JS_URI' },
  { segments: ['js', 'graph', 'treeData.js'], placeholder: 'GRAPH_TREE_DATA_JS_URI' },
  { segments: ['js', 'graph.js'],             placeholder: 'GRAPH_JS_URI' },
  { segments: ['js', 'tabs', 'licenses.js'],  placeholder: 'TAB_LICENSES_JS_URI' },
  { segments: ['js', 'tabs', 'snapshots.js'], placeholder: 'TAB_SNAPSHOTS_JS_URI' },
  { segments: ['js', 'tabs', 'dashboard.js'], placeholder: 'TAB_DASHBOARD_JS_URI' },
  { segments: ['js', 'tabs', 'performance.js'], placeholder: 'TAB_PERFORMANCE_JS_URI' },
  { segments: ['js', 'tabs', 'history.js'],   placeholder: 'TAB_HISTORY_JS_URI' },
  { segments: ['js', 'tabs', 'unused', 'confidenceRows.js'], placeholder: 'TAB_UNUSED_CONFIDENCE_ROWS_JS_URI' },
  { segments: ['js', 'tabs', 'unused', 'unusedBindings.js'], placeholder: 'TAB_UNUSED_BINDINGS_JS_URI' },
  { segments: ['js', 'tabs', 'unused.js'],    placeholder: 'TAB_UNUSED_JS_URI' },
  { segments: ['js', 'tabs', 'conflicts.js'], placeholder: 'TAB_CONFLICTS_JS_URI' },
  { segments: ['js', 'tabs', 'venv-health', 'installedPackagesPanel.js'], placeholder: 'TAB_VENV_INSTALLED_PANEL_JS_URI' },
  { segments: ['js', 'tabs', 'venv-health.js'], placeholder: 'TAB_VENV_HEALTH_JS_URI' },
  { segments: ['js', 'tabs.js'],              placeholder: 'TABS_JS_URI' },
  { segments: ['js', 'detail.js'],            placeholder: 'DETAIL_JS_URI' },
  { segments: ['main', 'messageRouter.js'],   placeholder: 'MAIN_MESSAGE_ROUTER_JS_URI' },
  { segments: ['main', 'domSetup.js'],        placeholder: 'MAIN_DOM_SETUP_JS_URI' },
  { segments: ['main.js'],                    placeholder: 'MAIN_JS_URI' },
];

/** CSS files loaded by the webview, relative to `media/webview/css/`. */
const CSS_FILES: string[] = [
  'base.css',
  'layout.css',
  'components.css',
  'components/loader.css',
  'components/empty-state.css',
  'components/tour.css',
  'components/modal.css',
  'components/export-menu.css',
  'components/row-context-menu.css',
  'list-view.css',
  'detail-view.css',
  'graph-view.css',
  'tabs-view.css',
  'tabs/dashboard.css',
  'tabs/unused.css',
  'tabs/licenses.css',
  'tabs/snapshots.css',
  'tabs/performance.css',
  'tabs/history.css',
  'tabs/conflicts.css',
  'tabs/venv-health.css',
];

/** Cache-bust token so webview reloads assets after local edits without a version bump. */
export function getWebviewCacheBust(extensionUri: vscode.Uri): string {
  const versionPath = path.join(extensionUri.fsPath, 'package.json');
  let version = '0';
  try {
    version = JSON.parse(fs.readFileSync(versionPath, 'utf-8')).version ?? version;
  } catch {
    // fall back to mtime-only token
  }

  const mediaRoot = path.join(extensionUri.fsPath, 'media', 'webview');
  let latestMtime = 0;
  const visit = (dir: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (!/\.(js|css|html)$/i.test(entry.name)) {
        continue;
      }
      try {
        latestMtime = Math.max(latestMtime, Math.floor(fs.statSync(full).mtimeMs));
      } catch {
        // skip unreadable files
      }
    }
  };
  visit(mediaRoot);

  return latestMtime > 0 ? `${version}.${latestMtime}` : version;
}

/**
 * Reads the webview HTML template from disk, resolves all media asset URIs,
 * and interpolates security nonce + CSP source tokens.
 *
 * @param webview - The VS Code Webview instance providing URI resolution and CSP source.
 * @param extensionUri - The root URI of the extension (for media path resolution).
 * @returns The fully interpolated HTML string ready for webview rendering.
 */
export function compileWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  cacheBust?: string
): string {
  const htmlPath = path.join(extensionUri.fsPath, 'media', 'webview', 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf-8');

  const nonce = getNonce();
  const cspSource = webview.cspSource;
  const versionQuery = `?v=${encodeURIComponent(cacheBust ?? getWebviewCacheBust(extensionUri))}`;

  // Build CSS <link> tags
  const cssLinks = CSS_FILES.map(file => {
    const uri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'media', 'webview', 'css', file)
    );
    return `<link rel="stylesheet" nonce="${nonce}" href="${uri.toString()}${versionQuery}">`;
  }).join('\n  ');

  // Resolve JS asset URIs and build replacement map
  const replacements = new Map<string, string>();
  replacements.set('NONCE', nonce);
  replacements.set('CSP_SOURCE', cspSource);
  replacements.set('STYLE_CSS_URI', cssLinks);

  for (const asset of JS_ASSETS) {
    const uri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'media', 'webview', ...asset.segments)
    );
    replacements.set(asset.placeholder, `${uri.toString()}${versionQuery}`);
  }

  const d3Uri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'webview', 'vendor', 'd3.v7.min.js')
  );
  replacements.set('D3_JS_URI', `${d3Uri.toString()}${versionQuery}`);

  // Apply all replacements in a single pass
  for (const [key, value] of replacements) {
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }

  return html;
}
