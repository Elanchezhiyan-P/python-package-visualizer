<div align="center">

# 📦 Python Package Visualizer (Community)

**Community-maintained fork — dependency manager for Python projects in VS Code & Cursor**

![Version](https://img.shields.io/badge/version-3.3.1-blue?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![VS Code](https://img.shields.io/badge/vscode-%5E1.105.0-007ACC?style=flat-square&logo=visualstudiocode)
![Python](https://img.shields.io/badge/python-3.8%2B-3776AB?style=flat-square&logo=python)

*Visualize, manage, and audit your Python workspace dependencies — all from inside VS Code.*

![Package Visualizer Hero](media/screenshots/hero.gif)

</div>

---

## ✨ Why Python Package Visualizer?

Every Python developer has been there: `pip list --outdated` is noisy, `requirements.txt` gets out of sync, CVEs go unnoticed, unused packages bloat your environment, and dependency conflicts break your builds. **This extension fixes all of that — visually.**

- 🎯 **See everything at a glance** — dashboard, dependency graph, health score
- 🔒 **Catch vulnerabilities early** — CVE badges pulled from PyPI advisory DB
- 🧹 **Clean up bloat** — find packages that aren't imported anywhere
- 📌 **Pin a chosen version** — install it, write `==` in the file, hide updates until PyPI ships something newer
- ⚡ **Update safely** — Safe Mode blocks major-version jumps; Ignore hides a release without changing the env
- 📸 **Rollback confidently** — environment snapshots & update history

---

## 🎬 Demo

<div align="center">

### Package List & Updates
![Package List Demo](media/screenshots/package-list.gif)

### Import Annotations
![Import Annotations Demo](media/screenshots/import-annotations.gif)

### Code Insights — Hover & Function Metrics
![Code Insights Demo](media/screenshots/code-insights.gif)

### Dashboard & Analytics
![Dashboard](media/screenshots/dashboard.png)

### Dependency Graph
![Dependency Graph](media/screenshots/dependency-graph.png)

</div>

---

## 🚀 Quick Start

1. Open a Python project containing `requirements.txt`, `pyproject.toml`, or `setup.py`  
   *(monorepos are supported — e.g. `backend/requirements.txt` is discovered automatically)*
2. Click the **📦 icon** in the Activity Bar (left side)
3. Click **▶ Open Package Visualizer** in the sidebar

If no dependency file is found, the panel shows an in-app empty state with a **Select requirements file** button — no IDE popup required.

---

## 🎯 Core Features

### 📋 Package Management
| Feature | What it does |
|---|---|
| **Package List** | Sortable table of all dependencies with required, installed, and latest versions, plus filters (updates, ignored, out of sync, group) |
| **One-click Update** | Update a single package or all selected packages |
| **Pin** | Choose a known PyPI version from the row or detail panel — installs it if needed, writes `==` in the dependency file, and hides updates until a newer release than at pin time. A **Pinned** tag stays on the row. **Unpin** only lifts the hold; the `==` pin in the file remains |
| **Ignore** | Hide the current PyPI update until a newer version is published — does not change the installed package. Separate from Pin |
| **Rollback** | Revert to a previously installed version |
| **Install New** | Search PyPI and install packages directly |
| **Align Versions** | Rewrite exact pins (`==`) in dependency files to match the *currently installed* version. Ranges / Poetry `^` are left unchanged on update |
| **Remove Unused** | Delete packages from requirements with one click |
| **Bulk Actions** | Select multiple packages and update / align / remove together (no bulk pin) |

Pin, Ignore, and Align are different tools:

| | **Pin** | **Ignore** | **Align** |
|---|---|---|---|
| Env / file | Installs the version you pick and writes `==` | Leaves env and file unchanged | Rewrites an existing exact pin to match *what is already installed* |
| Updates | Hidden until PyPI is newer than at pin time | Hidden until PyPI publishes something newer than the ignored latest | Not hidden |
| UI | Tag **Pinned** until Unpin or a successful Update | Status **update-ignored** until expiry | Tag **out of sync** when `==` ≠ installed |
| Sync | Written to `.python-package-visualizer.json` (commit this file) | Same project file | Dependency files only |

Pin and Ignore metadata live in **`.python-package-visualizer.json`** at the project root (one file per folder in a multi-root workspace). Commit it so the Pinned tag and update holds match on every machine. Exact `==` constraints still belong in `requirements.txt` / `pyproject.toml` as before.

### 🧹 Unused Packages & Cursor AI Review

The **Unused Packages** tab lists dependencies declared in your manifest files that were **not found** in static Python import scans. Each row shows a **confidence score** (high / medium / low) based on signals such as transitive deps, dev groups, popularity, and partial name matches — so you can prioritize cleanup safely.

| Action | What it does |
|---|---|
| **Remove** | Deletes the package line from its source file (`requirements.txt`, `pyproject.toml`, …), with fallback across included `-r` files and monorepo paths |
| **Mark as used** | Persist a manual “this package is used” confirmation so it leaves the unused list (can be unmarked later) |
| **Analyze with Cursor AI** | *(Cursor only)* Opens a new **Agent** chat with a structured review prompt — never runs automatically |
| **Apply removals…** | After AI review, bulk-remove selected packages with confirmation and an automatic pre-removal snapshot |

#### Cursor AI workflow (opt-in)

1. Open the visualizer and scan the workspace.
2. Go to the **Unused Packages** tab.
3. Click **✨ Analyze with Cursor AI** (visible only in **Cursor** when AI analysis is enabled).
4. The extension searches the workspace for **non-import references** (configs, Dockerfiles, CI, scripts) and sends the unused list to **Cursor Agent** with confidence scores and reference hits.
5. Review the Agent verdicts (`USED` / `UNUSED` / `UNCERTAIN`) in the chat.
6. Back in the tab, click **Apply removals…** to open a checklist — high-confidence packages without config references are pre-selected; confirm to remove them from dependency files.

> **Privacy & control:** analysis starts **only when you click the button**. No background AI calls. In VS Code (without Cursor Agent), the AI button is hidden; one-click **Remove** still works.

**Settings** (`Python Package Visualizer`):

| Setting | Default | Description |
|---|---|---|
| `pythonPackageVisualizer.cursorAiAnalysis` | `true` | Show the Cursor AI review button on the Unused tab |
| `pythonPackageVisualizer.cursorAiUseAutoModel` | `true` | Open Agent with Cursor **Auto** model (`default`) |

### 🧠 Code Intelligence

**Import Annotations** — see package status right above each import line:
```python
✅ requests v2.31.0      ↗ PyPI
import requests

⚠️ flask 2.0.1 → 3.0.3   ↑ Update    ↗ PyPI
from flask import Flask
```

**Function Metrics** — quality insights above every function:
```python
# 📊 18 lines · 🔗 2 refs · ⚡ Low
def load_resume_text(pdf_path: str) -> str:
    """Extract text from PDF."""
    ...

# 📊 25 lines · 🔗 0 refs · ⚡ Moderate
# ⚠️ Missing type hints (3/3 untyped, no return type) — Click to fix
# ⚠️ Missing docstring — Click to add
def create_qa_chain(resume_text):
    ...
```

**Smart Hover Cards** — hover any imported symbol for a compact card:
```
📦 langchain · v1.2.15 · MIT
Building applications with LLMs through composability
🟢 Up to date · 🐍 >=3.10 · 📅 2 days ago
↑ Update · 🔍 Inspect · PyPI ↗
```

**API Cost Hints** — hover on LLM clients like `ChatGroq`, `ChatOpenAI`:
```
🤖 ChatGroq
Provider: Groq
💰 Pricing: Free tier · ~$0.05-0.10/1M tokens
⚡ Speed: Very fast (~300 tok/s)
```

### 🔒 Security & Compliance
| Feature | What it does |
|---|---|
| **CVE Detection** | Vulnerabilities flagged from PyPI advisory DB |
| **License Risk** | Classifies MIT/BSD/Apache as safe, GPL/AGPL as restricted |
| **Safe Mode** 🛡️ | Blocks major-version updates to prevent breaking changes (Pin remains available — it is an explicit version choice) |
| **Conflict-aware updates** | `pip check` conflicts block the Update button; revert to previous or force-update from the row |
| **Python Compatibility** | Warns when packages require newer Python |
| **Global Python guard** | Confirmation before install/update/pin when the target is not a workspace venv |

### 📊 Visualization & Analytics

- **Dashboard** — health score, security stats, maintainer activity
- **Dependency Graph** — interactive D3.js tree with collapsible nodes
- **Conflicts** — packages involved in `pip check` mismatches
- **Environment** — venv health, pip version, and **Active project** selector in multi-root workspaces
- **Performance** — ranks packages by install time (Fast/Moderate/Slow); times are recorded only for installs/updates/rollbacks started from this extension
- **History** — timeline of all updates, installs, rollbacks
- **Licenses** — packages grouped by license with risk badges
- **Snapshots** — save and restore your entire environment

### 🛠 Power Tools

Accessible from the **Tools** menu in the main panel:

- **📤 Export Report** — Markdown or JSON snapshot of your dependencies
- **📦 Generate requirements.txt** — auto-scan imports and create `requirements.txt`
- **🐧 Setup Scripts** — generate Bash / PowerShell / Markdown setup scripts for onboarding
- **⚡ Migrate to uv** — convert `requirements.txt` → modern `pyproject.toml`
- **🎭 Migrate to Poetry** — convert to Poetry format

---

## ⚙️ Settings Panel

![Settings Panel](media/screenshots/settings-panel.png)

Every code insight is **toggleable from the sidebar** — no need to dig into VS Code settings.json.

### General Settings
- 🔘 Import annotations *(inline package badges)*
- 🔘 Show hover info
- 🔘 Auto-check on open
- 🔘 Notify on outdated packages
- 📋 Update check schedule *(Off / Daily / Weekly / Monthly)*
- 🌐 UI language *(English / Italiano)*

### Code Insights
- 🔘 Function metrics *(lines, references, complexity)*
- 🔘 Method call hover *(package info + API cost)*
- 🔘 Complexity warnings
- 🔘 Type hint coverage warnings
- 🔘 Docstring warnings

---

## ⌨️ Keyboard Shortcuts

Inside the Package Visualizer panel:

| Key | Action |
|---|---|
| `R` | Refresh packages |
| `/` or `Ctrl+F` | Focus the search bar |
| `U` | Update all outdated packages |
| `Esc` | Close detail panel |

---

> 📋 **Full release history:** [CHANGELOG.md](CHANGELOG.md)

## 🎯 What's New in v3.3.1

- 📁 **Project Pin/Ignore file** — `.python-package-visualizer.json` at the project root syncs Pinned tags and update holds across machines via git (one-time migrate from editor storage)

### v3.3.0

- 📌 **Pin a chosen version** — from the list or detail panel, pick a known PyPI version; the extension installs it if needed, writes `==` in the dependency file, and hides updates until PyPI publishes something newer than at pin time. **Ignore** stays a separate action; **Unpin** lifts the hold only
- 🔧 **Bulk Update** no longer rewrites exact pins of packages you did not select

### v3.2.x highlights

- 🗂️ **Multi-root workspaces** — detect `.venv` in every folder; Environment tab **Active project** selector; scans, pip, CodeLens, and snapshots follow that root
- 🧹 **Mark unused packages as used** (persisted) and unmark them later
- 🛠️ **Tools menu** — export, generate, and uv/Poetry migration in one dropdown
- 🏷️ Independent community release under `FaberVi`

### v3.1.x highlights

- 🔍 **Robust dependency file discovery** — scans subfolders (e.g. `backend/requirements.txt` in monorepos)
- 🔗 **`requirements-dev.txt` support** — follows `-r requirements.txt` includes and merges packages correctly
- 🖥️ **In-panel empty state** — manual file selection from the visualizer UI (EN/IT), no IDE notification popup
- 🤖 **Cursor AI review** — optional Agent analysis for unused packages (Auto model, codebase search)
- 🧹 **Smarter unused detection** — dynamic imports, config/Dockerfile references, reduced false positives
- ⚠️ **Conflict-aware updates** — blocked updates on `pip check` conflicts, revert & force-update actions
- 🐍 **Global Python guard** — confirmation before install/update when not using a workspace venv
- 🇮🇹 **Italian localization** — webview, sidebar, tour, and key VS Code messages
- 🧩 **Cursor compatibility** — engine `^1.105.0`, installable in Cursor via VSIX

### v3.0.x highlights

- 📝 Import annotations, function metrics, quick-fix CodeLens, smart hover cards
- 📦 Environment snapshots, Safe Mode, uv/Poetry migration, setup script generator

---

## 📋 Supported Project Types

The extension automatically detects and parses dependency files **recursively** in the workspace (up to 6 levels deep), skipping `node_modules`, `.git`, `venv`, etc.

| File | Notes |
|---|---|
| `requirements.txt` | Main pip format; also found in subfolders (`backend/`, `api/`, …) |
| `requirements-dev.txt`, `dev-requirements.txt` | Dev deps; `-r requirements.txt` includes are resolved |
| `requirements-test.txt`, `requirements-prod.txt`, … | Environment-specific variants |
| `pyproject.toml` | PEP 517/518/621, Poetry, PDM, Hatch, uv |
| `setup.py` | Legacy setuptools |
| `setup.cfg` | Declarative setuptools |
| `Pipfile` | Pipenv |

Virtual environments are auto-detected from: `.venv/`, `venv/`, `env/`, `.env/` at the workspace root **and** common subfolders (`backend/`, `api/`, `server/`, `python/`). In a **multi-root** workspace, each folder is scanned for its own venv; pick the active project in the **Environment** tab.

You can also pick a requirements file manually from the dashboard or the in-panel empty state.

---

## 🔧 Installation

> **Extension ID:** `FaberVi.python-package-visualizer-community`  
> This is a **community fork**, independent from `Elanchezhiyan-P.python-package-visualizer`.  
> If you had the original installed, disable or uninstall it to avoid duplicate sidebars.

### From VS Code Marketplace
1. Open VS Code or Cursor
2. Go to **Extensions** (`Ctrl+Shift+X`)
3. Search **Python Package Visualizer (Community)**
4. Install the extension published by **FaberVi**

### From VSIX (VS Code or Cursor)

```bash
# VS Code
code --install-extension python-package-visualizer-community-3.3.1.vsix

# Cursor
cursor --install-extension python-package-visualizer-community-3.3.1.vsix --force
```

Or run the full pipeline from the project root:

```powershell
.\scripts\build-all.ps1
```

---

## 🏗️ Development

### Prerequisites

- [Node.js](https://nodejs.org/) **v18+**
- [npm](https://www.npmjs.com/) (bundled with Node.js)
- [VS Code](https://code.visualstudio.com/) or [Cursor](https://cursor.com/) **^1.105.0**

### Setup

```bash
# Clone the repository (fork with active development)
git clone https://github.com/FaberVi/python-package-visualizer.git
cd python-package-visualizer

# Install dependencies
npm install
```

> Upstream original project: [Elanchezhiyan-P/python-package-visualizer](https://github.com/Elanchezhiyan-P/python-package-visualizer)

### Build & Install (One Command)

The project includes an automated build pipeline that runs all steps in sequence:

```powershell
.\scripts\build-all.ps1
```

This single script performs **5 steps** automatically:

| Step | Action | Description |
|------|--------|-------------|
| 1/5 | **Lint** | Runs ESLint on `src/` |
| 2/5 | **Type Check** | Runs `tsc --noEmit` to verify TypeScript types |
| 3/5 | **Build** | Compiles TypeScript → `dist/extension.js` via esbuild |
| 4/5 | **Package VSIX** | Bundles the extension as `.vsix` via `vsce` |
| 5/5 | **Install** | Installs the new VSIX with `--force` |

The pipeline **stops on first failure** and reports which step failed with the exit code. After install, reload manually with `Ctrl+Shift+P` → `Developer: Reload Window`.

### Individual npm Scripts

For granular operations, you can run each step individually:

| Command | Description |
|---|---|
| `npm run build` | Compile TypeScript → `dist/extension.js` via esbuild |
| `npm run watch` | Compile in watch mode (auto-rebuild on save) |
| `npm run lint` | Run ESLint on `src/` |
| `npm run pretest` | Compile test files via `tsc` |
| `npm run test` | Run extension tests with `@vscode/test-electron` |
| `npm run test:unit` | Fast Mocha unit tests in Node (no Electron) |
| `npm run test:grep` | Targeted unit test: `npm run test:grep -- "pattern" [file-substring]` |
| `npm run test:coverage` | Unit tests + c8 report (`coverage/`) |
| `npm run test:coverage:check` | Coverage with global floor (see `c8.json`) |
| `npm run package` | Package the extension as `.vsix` via `vsce` |

**Coverage policy (unit-test scope):** lines/statements ≥ **79%**, branches ≥ **72%**, functions ≥ **81%** on modules exercised by `test:unit`. Full-repo line coverage including webview/commands remains lower by design; patch gate (`node scripts/check-patch-coverage.mjs`) enforces **70%** on newly added `src/` files that are unit-tested. Local full check: `.\scripts\diff-coverage.ps1`.

### Typical Development Workflow

```bash
# Option A — Full automated pipeline (build + install + reload)
.\scripts\build-all.ps1

# Option B — Watch mode for rapid iteration
npm run watch
# Press F5 in VS Code to launch the Extension Development Host
# Make changes → watcher rebuilds → reload dev host (Ctrl+Shift+P → "Reload Window")
```

### Project Structure

```
python-package-visualizer/
├── src/                          # TypeScript source (compiled by esbuild)
│   ├── extension.ts              # Extension entry point (activate/deactivate)
│   ├── commands/
│   │   ├── commandController.ts  # Central command dispatcher
│   │   └── handlers/
│   │       ├── visualizerHandler.ts   # Core scan + update orchestration
│   │       ├── visualizer/
│   │       │   └── displayCompiler.ts # Payload building (shared by panel + sidebar)
│   │       ├── packageInstaller.ts    # pip install/update/rollback/pin
│   │       ├── requirementsHandler.ts # Requirements file operations
│   │       ├── reportExporter.ts      # Markdown/JSON export
│   │       ├── snapshotHandler.ts     # Environment snapshots
│   │       ├── migrationHandler.ts    # uv/Poetry migration
│   │       └── utilityHandler.ts      # Misc utilities
│   ├── modules/
│   │   ├── importScanner.ts      # Facade — delegates to import/ sub-modules
│   │   ├── import/
│   │   │   ├── scanner.ts        # Python file scanning + import extraction
│   │   │   ├── confidence.ts     # Unused package confidence scoring
│   │   │   └── maps.ts           # stdlib, import-to-package mappings
│   │   ├── packageScanner.ts     # Requirements/pyproject/setup.py parser
│   │   ├── depFileDiscovery.ts   # Recursive monorepo dep-file search
│   │   ├── parsers/              # Format-specific parsers
│   │   ├── requirementsSync.ts   # Align/remove version lines in requirements
│   │   ├── requirementsGenerator.ts
│   │   ├── migrationHelper.ts
│   │   └── setupScriptGenerator.ts
│   ├── services/
│   │   ├── versionChecker.ts     # PyPI API queries
│   │   ├── versionHistoryCache.ts # Local JSON history store
│   │   ├── projectVisualizerConfig.ts # `.python-package-visualizer.json` Pin/Ignore store
│   │   ├── pinnedPackages.ts     # User-chosen version pins (tag + hold metadata)
│   │   ├── ignoredUpdates.ts     # Dismissed PyPI latest versions
│   │   ├── venvHealthChecker.ts  # Environment tab diagnostics
│   │   ├── activeVenvRoot.ts     # Multi-root active project
│   │   └── cursorAiService.ts    # Cursor Agent integration (unused review)
│   ├── providers/                # CodeLens, Hover, and Diagnostics providers
│   ├── ui/
│   │   ├── webviewPanel.ts       # Main webview panel manager
│   │   ├── sidebarProvider.ts    # Activity bar sidebar
│   │   └── statusBarManager.ts   # Status bar item
│   ├── data/                     # Static data (alternatives, API costs)
│   └── utils/                    # Logger, helpers
├── media/
│   ├── webview/
│   │   ├── index.html            # Main webview HTML template
│   │   ├── main.js               # Webview entry point
│   │   ├── js/
│   │   │   ├── state.js          # Global state management
│   │   │   ├── utils.js          # Shared utilities (esc, formatters)
│   │   │   ├── i18n.js           # i18n engine + static translations
│   │   │   ├── i18n/             # Language packs (en.js, it.js)
│   │   │   ├── filters.js        # Search, sort, filter logic
│   │   │   ├── table.js          # Package list table renderer
│   │   │   ├── table/            # Row builder, events, dialogs, bulk
│   │   │   ├── tabs.js           # Tab router + shared tab utilities
│   │   │   ├── tabs/             # Per-tab renderers
│   │   │   │   ├── dashboard.js
│   │   │   │   ├── unused.js
│   │   │   │   ├── licenses.js
│   │   │   │   ├── performance.js
│   │   │   │   ├── history.js
│   │   │   │   ├── snapshots.js
│   │   │   │   ├── conflicts.js
│   │   │   │   └── venv-health.js
│   │   │   ├── detail.js         # Package detail side panel
│   │   │   ├── graph.js          # D3.js dependency graph
│   │   │   ├── modal.js          # Modal dialogs
│   │   │   └── tour.js           # Guided tour
│   │   └── css/
│   │       ├── base.css          # CSS custom properties + reset
│   │       ├── layout.css        # Header, toolbar, stats bar
│   │       ├── components.css    # Buttons, badges, tags, banners
│   │       ├── components/       # Extracted component styles
│   │       │   ├── loader.css
│   │       │   ├── empty-state.css
│   │       │   ├── modal.css
│   │       │   ├── export-menu.css
│   │       │   └── tour.css
│   │       ├── list-view.css     # Package table styles
│   │       ├── detail-view.css   # Detail panel styles
│   │       ├── graph-view.css    # Graph visualization styles
│   │       ├── tabs-view.css     # Tab bar controls
│   │       └── tabs/             # Per-tab styles
│   │           ├── dashboard.css
│   │           ├── unused.css
│   │           ├── licenses.css
│   │           ├── performance.css
│   │           ├── history.css
│   │           ├── snapshots.css
│   │           ├── conflicts.css
│   │           └── venv-health.css
│   └── sidebar/
│       ├── welcome.html          # Sidebar HTML template
│       └── welcome.js            # Sidebar settings + event handlers
├── test/                         # Extension integration tests
├── scripts/
│   └── build-all.ps1             # Automated build pipeline (lint → type-check → build → package → install)
├── dist/                         # Compiled output (gitignored)
├── esbuild.js                    # Build script configuration
├── tsconfig.json                 # TypeScript compiler config
├── tsconfig.test.json            # Test-specific TS config
├── package.json                  # Extension manifest + npm scripts
└── .vscodeignore                 # Files excluded from VSIX package
```

---

## 🤝 Contributing

Issues and pull requests are welcome!

- 🐛 **Bug reports & features:** [FaberVi/python-package-visualizer — Issues](https://github.com/FaberVi/python-package-visualizer/issues)
- 📝 **Changelog:** [CHANGELOG.md](CHANGELOG.md)
- 🔼 **Upstream:** [Elanchezhiyan-P/python-package-visualizer](https://github.com/Elanchezhiyan-P/python-package-visualizer)

> **Before submitting a PR**, run `.\scripts\build-all.ps1` and make sure all 5 steps pass cleanly.

---

## 👥 Credits

| | |
|---|---|
| **Original author** | **Elanchezhiyan P** — [codebyelan.in](https://codebyelan.in) · [GitHub](https://github.com/Elanchezhiyan-P) |
| **Fork maintainer** | **Vincenzo Fabiano** — active development & Cursor integration · [GitHub @FaberVi](https://github.com/FaberVi) · [fork](https://github.com/FaberVi/python-package-visualizer) |

---

## 📜 License

MIT © [Vincenzo Fabiano](https://github.com/FaberVi) (fork maintainer), [Elanchezhiyan P](https://codebyelan.in) (original author), and contributors. See [LICENSE](LICENSE) for details.

---

## 📸 Screenshots & GIFs

All media is stored in `media/screenshots/`. Current assets:

| File | Type | Used in |
|---|---|---|
| `hero.gif` | GIF | Top hero banner |
| `package-list.gif` | GIF | Demo section — Package List & Updates |
| `import-annotations.gif` | GIF | Demo section — Import Annotations |
| `code-insights.gif` | GIF | Demo section — Code Insights |
| `dashboard.png` | PNG | Demo section — Dashboard |
| `dependency-graph.png` | PNG | Demo section — Dependency Graph |
| `settings-panel.png` | PNG | Settings Panel section |

**Regenerate all README screenshots** (uses the real webview UI + demo fixture data, captured via headless Chrome/Edge):

```powershell
npm run screenshots
# or: python scripts/screenshots/capture.py
```

Requires **Node.js**, **Python 3 + Pillow**, and **Chrome or Edge** installed locally.
