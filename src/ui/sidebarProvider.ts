import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { Logger } from '../utils/logger.js';
import { getNonce } from '../utils/nonce.js';
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
    webviewView.webview.html = this.getWelcomeHtml(webviewView.webview);

    // Listen to global configuration changes to instantly hot-reload the translated sidebar view if the language changes.
    const configListener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('pythonPackageVisualizer.language')) {
        if (this.view) {
          this.view.webview.html = this.getWelcomeHtml(this.view.webview);
        }
      }
    });

    webviewView.onDidDispose(() => {
      configListener.dispose();
    });

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
          language: config.get<string>('language', 'en'),
        };
        void this.view?.webview.postMessage({ type: 'settings', settings });
        return;
      }

      if (msg.type === 'updateSetting' && msg.key) {
        const config = vscode.workspace.getConfiguration('pythonPackageVisualizer');
        void config.update(msg.key, msg.value, vscode.ConfigurationTarget.Global);
        if (msg.key === 'language' && this.view) {
          this.view.webview.html = this.getWelcomeHtml(this.view.webview);
        }
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
    const updates  = packages.filter(p => p.status === 'update-available' && !p.updateBlockedByConflict).length;
    const vulnerable = packages.filter(p => p.vulnerabilities && p.vulnerabilities.length > 0).length;
    const drifted = packages.filter(p => p.status === 'drift').length;
    void this.view.webview.postMessage({ type: 'sidebarStats', ok, updates, vulnerable, drifted });
  }
  sendProgress(_message: string): void {}

  isVisible(): boolean {
    return this.view?.visible ?? false;
  }

  /**
   * Generates the welcome sidebar HTML content with dynamic localized translation values.
   * We perform template interpolation at runtime to support instant interface changes when toggling language settings.
   */
  private getWelcomeHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const version: string = (this._context.extension.packageJSON as { version: string }).version;
    const templatePath = path.join(this._context.extensionPath, 'media', 'sidebar', 'welcome.html');
    try {
      let html = fs.readFileSync(templatePath, 'utf8');
      
      const welcomeJsUri = webview.asWebviewUri(
        vscode.Uri.joinPath(this._context.extensionUri, 'media', 'sidebar', 'welcome.js')
      );

      const config = vscode.workspace.getConfiguration('pythonPackageVisualizer');
      const lang = config.get<string>('language', 'en') === 'it' ? 'it' : 'en';
      const dict = TRANSLATIONS[lang];

      // Interpolate generic workspace assets tokens
      html = html
        .replace(/{{NONCE}}/g, nonce)
        .replace(/{{VERSION}}/g, version)
        .replace(/{{WELCOME_JS_URI}}/g, welcomeJsUri.toString());

      // Interpolate localized strings by looking up predefined token mappings
      for (const [key, value] of Object.entries(dict)) {
        const token = new RegExp(`{{LOC_${key.toUpperCase()}}}`, 'g');
        html = html.replace(token, value);
      }

      return html;
    } catch (err) {
      this.logger.error(`Failed to load sidebar template: ${String(err)}`);
      return `<!DOCTYPE html><html><body>Failed to load welcome view.</body></html>`;
    }
  }
}



/**
 * Localized string dictionaries for sidebar textual content.
 * Provides high-quality English and Italian translations for layout headers, stats cards, quick start guides,
 * settings panel toggles, tips, links, and the author metadata card.
 */
const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    welcome_title: "Python Package Visualizer",
    welcome_desc: "Manage and visualize your Python workspace dependencies inside VS Code.",
    stats_uptodate: "Up to date",
    stats_updates: "Updates",
    stats_vulnerable: "Vulnerable",
    stats_drifted: "Out of sync: {count}",
    stats_all_aligned: "All in sync",
    btn_open: "Open Package Visualizer",
    shortcut_prefix: "Ctrl",
    shortcut_plus: "+",
    shortcut_key_p: "P",
    show_visualizer: "Show Package Visualizer",
    getting_started: "Getting Started",
    step1_title: "Open a Python project",
    step1_desc: "Open any folder containing a requirements.txt or pyproject.toml",
    step2_title: "Click Open Package Visualizer",
    step2_desc: "Or use the command palette shortcut above",
    step3_title: "Browse packages by status",
    step3_desc: "Up to date, update available, not installed, vulnerable",
    step4_title: "Update, rollback or remove",
    step4_desc: "All changes sync back to your requirements file automatically",
    keyboard_shortcuts: "Keyboard Shortcuts",
    refresh_packages: "Refresh packages",
    focus_search: "Focus search",
    update_all_packages: "Update all packages",
    close_detail_panel: "Close detail panel",
    settings: "Settings",
    import_annotations: "Import annotations",
    import_annotations_desc: "Package badges above import lines",
    show_hover_info: "Show hover info",
    show_hover_info_desc: "Tooltip with package details on hover",
    auto_check_on_open: "Auto-check on open",
    auto_check_on_open_desc: "Scan workspace when project loads",
    notify_on_outdated: "Notify on outdated",
    notify_on_outdated_desc: "Show banner when updates available",
    update_check_schedule: "Update check schedule",
    update_check_schedule_desc: "Periodic background check",
    schedule_off: "Off",
    schedule_daily: "Daily",
    schedule_weekly: "Weekly",
    schedule_monthly: "Monthly",
    code_insights: "Code Insights",
    function_metrics: "Function metrics",
    function_metrics_desc: "Show line count, references & complexity",
    method_call_hover: "Method call hover",
    method_call_hover_desc: "Package info & API cost on hover",
    complexity_warnings: "Complexity warnings",
    complexity_warnings_desc: "Warn when functions are too complex",
    type_hint_coverage: "Type hint coverage",
    type_hint_coverage_desc: "Warn about missing type hints",
    docstring_warnings: "Docstring warnings",
    docstring_warnings_desc: "Warn about missing docstrings",
    language: "🌐 Language",
    language_desc: "UI language (EN / IT)",
    quick_links: "Quick Links",
    documentation: "Documentation",
    changelog: "Changelog",
    report_issue: "Report an Issue",
    star_github: "Star on GitHub",
    tips: "Tips",
    tip1: "Click any <strong>package name</strong> to open its PyPI page",
    tip2: "Unused packages show a <strong>🗑 Remove</strong> button to delete from requirements",
    tip3: "Click <strong>+ Add Package</strong> to search PyPI and install new packages",
    tip4: "Click any <strong>column header</strong> to sort the package list",
    tip5: "Use <strong>Tools</strong> to export reports, generate setup files, or migrate to uv/Poetry",
    tip6: "The <strong>Dependency Graph</strong> tab shows a collapsible tree — click nodes to expand",
    author_role: "Senior Software Developer",
    author_tagline: "Full Stack Developer | .NET | AI | Cloud",
    author_skills: "Specialized in .NET, React, AI, Integrations & DevOps",
    author_cred: "🧩 Open Source Contributor · 📦 NuGet Publisher · ✍️ Technical Blogger",
    credits: "Credits",
    original_author: "Original author",
    maintainer: "Fork maintainer",
    maintainer_desc: "Active development & Cursor integration",
    maintainer_fork_link: "python-package-visualizer (fork)",
    footer_license: "MIT License"
  },
  it: {
    welcome_title: "Python Package Visualizer",
    welcome_desc: "Gestisci e visualizza le dipendenze del tuo workspace Python dentro VS Code.",
    stats_uptodate: "Aggiornati",
    stats_updates: "Aggiornamenti",
    stats_vulnerable: "Vulnerabili",
    stats_drifted: "Non allineati: {count}",
    stats_all_aligned: "Tutti allineati",
    btn_open: "Apri Package Visualizer",
    shortcut_prefix: "Ctrl",
    shortcut_plus: "+",
    shortcut_key_p: "P",
    show_visualizer: "Mostra Package Visualizer",
    getting_started: "Guida Rapida",
    step1_title: "Apri un progetto Python",
    step1_desc: "Apri qualsiasi cartella contenente requirements.txt o pyproject.toml",
    step2_title: "Clicca su Apri Package Visualizer",
    step2_desc: "O usa la scorciatoia della tavolozza dei comandi in alto",
    step3_title: "Sfoglia i pacchetti per stato",
    step3_desc: "Aggiornato, aggiornamento disponibile, non installato, vulnerabile",
    step4_title: "Aggiorna, ripristina o rimuovi",
    step4_desc: "Tutti i cambiamenti si sincronizzano automaticamente con il tuo file dei requisiti",
    keyboard_shortcuts: "Scorciatoie da Tastiera",
    refresh_packages: "Aggiorna pacchetti",
    focus_search: "Focalizza ricerca",
    update_all_packages: "Aggiorna tutti i pacchetti",
    close_detail_panel: "Chiudi pannello dettagli",
    settings: "Impostazioni",
    import_annotations: "Annotazioni di importazione",
    import_annotations_desc: "Badge del pacchetto sopra le righe di importazione",
    show_hover_info: "Mostra info al passaggio",
    show_hover_info_desc: "Tooltip con i dettagli del pacchetto al passaggio del mouse",
    auto_check_on_open: "Controllo automatico all'apertura",
    auto_check_on_open_desc: "Scansiona il workspace al caricamento del progetto",
    notify_on_outdated: "Notifica se obsoleti",
    notify_on_outdated_desc: "Mostra un banner quando sono disponibili aggiornamenti",
    update_check_schedule: "Pianificazione controllo",
    update_check_schedule_desc: "Controllo periodico in background",
    schedule_off: "Disattivato",
    schedule_daily: "Giornaliero",
    schedule_weekly: "Settimanale",
    schedule_monthly: "Mensile",
    code_insights: "Analisi del Codice",
    function_metrics: "Metriche delle funzioni",
    function_metrics_desc: "Mostra numero di righe, riferimenti e complessità",
    method_call_hover: "Passaggio su chiamata metodo",
    method_call_hover_desc: "Info sul pacchetto e costo delle API al passaggio",
    complexity_warnings: "Avvisi di complessità",
    complexity_warnings_desc: "Avvisa quando le funzioni sono troppo complesse",
    type_hint_coverage: "Copertura dei type hint",
    type_hint_coverage_desc: "Avvisa in caso di type hint mancanti",
    docstring_warnings: "Avvisi sulle docstring",
    docstring_warnings_desc: "Avvisa in caso di docstring mancanti",
    language: "🌐 Lingua",
    language_desc: "Lingua dell'interfaccia utente (EN / IT)",
    quick_links: "Link Rapidi",
    documentation: "Documentazione",
    changelog: "Changelog",
    report_issue: "Segnala un Problema",
    star_github: "Lascia una Stella su GitHub",
    tips: "Suggerimenti",
    tip1: "Clicca sul nome di un <strong>pacchetto</strong> per aprire la sua pagina PyPI",
    tip2: "I pacchetti non utilizzati mostrano un pulsante <strong>🗑 Rimuovi</strong> per eliminarli",
    tip3: "Clicca su <strong>+ Aggiungi Pacchetto</strong> per cercare su PyPI e installare nuovi pacchetti",
    tip4: "Clicca sulle <strong>intestazioni delle colonne</strong> per ordinare la lista",
    tip5: "Usa <strong>Strumenti</strong> per esportare report, generare file di setup o migrare a uv/Poetry",
    tip6: "La scheda <strong>Grafo Dipendenze</strong> mostra un albero comprimibile — clicca sui nodi per espanderli",
    author_role: "Senior Software Developer",
    author_tagline: "Sviluppatore Full Stack | .NET | AI | Cloud",
    author_skills: "Specializzato in .NET, React, AI, Integrazioni e DevOps",
    author_cred: "🧩 Contributore Open Source · 📦 Editore NuGet · ✍️ Blogger Tecnico",
    credits: "Crediti",
    original_author: "Autore originale",
    maintainer: "Maintainer del fork",
    maintainer_desc: "Sviluppo attivo e integrazione Cursor",
    maintainer_fork_link: "python-package-visualizer (fork)",
    footer_license: "Licenza MIT"
  }
};

