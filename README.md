# Python Package Visualizer

> Visualize, manage, and audit your Python workspace dependencies — all from inside VS Code.

![Version](https://img.shields.io/badge/version-2.2.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![VS Code](https://img.shields.io/badge/vscode-%5E1.85.0-blue)

## Features

- 📦 **Package List** — View all installed packages with installed vs latest versions
- ⚠️ **Update Detection** — See which packages have updates available at a glance
- 🔴 **CVE Vulnerability Badges** — Security vulnerabilities flagged from PyPI advisory database
- 🔍 **Unused Package Detection** — Static import analysis across all `.py` files
- 🕸️ **Dependency Graph** — Interactive D3.js tree with collapsible nodes
- 🕒 **Update History** — Timeline of all installs, updates and rollbacks
- 📤 **Export Reports** — Export package status as Markdown or JSON
- ➕ **Add Packages** — Search PyPI and install new packages directly
- 🗂️ **Group Detection** — Auto-detects dev/test/docs/lint dependency groups
- 🔒 **License Compliance** — Classifies licenses as Safe / Caution / Restricted
- 🐍 **Python Version Compatibility** — Shows required Python version per package
- 📊 **Download Stats** — Weekly PyPI download counts
- 💾 **Snapshots** — Save and restore full environment state
- 🛡️ **Safe Mode** — Block major-version updates to prevent breaking changes
- ⚡ **uv Support** — Automatically uses `uv pip` if uv is installed

## 🚀 Getting Started

### Prerequisites

- [VS Code](https://code.visualstudio.com/) `1.85.0` or newer
- Python installed and accessible (or a virtual environment)
- A Python project with one of: `requirements.txt`, `pyproject.toml`, `setup.py`, `setup.cfg`, or `Pipfile`

### Installation

1. Open VS Code
2. Go to **Extensions** (`Ctrl+Shift+X`)
3. Search for **Python Package Visualizer**
4. Click **Install**

Or install from the [VS Code Marketplace](#).

---

## 📚 Documentation

Full documentation is available on the [GitHub Wiki](https://github.com/Elanchezhiyan-P/python-package-visualizer/wiki):

- [Home](https://github.com/Elanchezhiyan-P/python-package-visualizer/wiki/Home) — Overview, features, and quick start
- [Supported Project Types](https://github.com/Elanchezhiyan-P/python-package-visualizer/wiki/Supported-Project-Types) — All supported dependency file formats

---

## 📖 How to Use

### Opening the Visualizer

**Option 1 — Activity Bar**
Click the 📦 icon in the left Activity Bar to open the sidebar, then click **▶ Open Package Visualizer**.

**Option 2 — Command Palette**
Press `Ctrl+Shift+P` and type `Show Package Visualizer`.

**Option 3 — Command**
Run `Python Package Visualizer: Show` from the command palette.

---

### Package List Tab

The main view shows all packages found in your requirements files.

| Column | Description |
|---|---|
| **Package** | Name, source file, group tag, and badges |
| **Installed** | Currently installed version |
| **Latest** | Latest version available on PyPI |
| **Status** | ✅ Up to date / ⚠️ Update available / ⬜ Not installed / 🔴 Vulnerable |
| **Released** | Release date of the latest version |
| **Actions** | Update, Rollback, Install, or Remove buttons |

**Sorting:** Click any column header to sort. Click again to reverse.

**Filtering:**
- Use the search bar to filter by package name or description
- Use the **All statuses** dropdown to show only specific statuses
- Use the **All groups** dropdown to filter by group (main, dev, test, docs)

**Inline badges:**
- `⊘ unused?` — package is not imported anywhere in the project
- `🔴 CVE` — one or more known vulnerabilities found

---

### Actions

#### Update a Package
Click **⬆ Update** on any row with an available update. The package is updated via pip and the version pin in your requirements file is synced automatically.

#### Rollback a Package
Click **↩ Rollback** to revert to the previous version. Only available if the package has version history.

#### Install a Package
Click **⬇ Install** on any row with status `Not installed`.

#### Remove from Requirements
Click **🗑 Remove** on any row marked as `unused?`. This removes the package line from its requirements file after confirmation. The package itself is **not** uninstalled from your environment.

---

### Add Package

Click **+ Add Package** in the header to open the install dialog.

1. Type a package name (e.g. `requests`, `numpy`, `fastapi`)
2. The dialog instantly shows if the package is **already installed**
3. Click **Search** to look up the package on PyPI
4. Review the version and description
5. Click **⬇ Install** to install it

---

### Export Report

Click **⬆ Export** in the header and choose a format:

- **📝 Markdown** — a formatted table with status icons and PyPI links, ready to paste into a README or wiki
- **{}  JSON** — machine-readable data including version, status, release date, and vulnerability count

The report opens in a new editor tab beside the visualizer.

---

### Unused Packages Tab

Shows all packages that have **no detected import** in your `.py` files.

The scanner uses static regex-based analysis — it reads every `.py` file in your workspace (excluding `node_modules`, `.venv`, `__pycache__`, etc.) and checks if the package's module name appears in any `import` or `from ... import` statement.

**Known mappings handled:**
- `opencv-python` → imported as `cv2`
- `scikit-learn` → imported as `sklearn`
- `python-dotenv` → imported as `dotenv`
- `google-generativeai` → imported as `google.generativeai`
- CLI-only tools (`uvicorn`, `gunicorn`, `black`, etc.) are never flagged as unused

> **Note:** Static analysis may occasionally produce false positives for dynamically imported packages. Use the `unused?` badge as a hint, not a definitive answer.

---

### Dependency Graph Tab

An interactive tree showing:
- **Root** → your direct packages → their sub-dependencies

**Controls:**
- 🖱️ **Scroll** — zoom in / out
- 🖱️ **Drag** — pan the canvas
- 🖱️ **Click node** — expand/collapse sub-dependencies, open package detail
- **⊡ Fit** button — auto-fit all nodes in view
- **＋ / －** buttons — zoom in / out

Node colors match the package status:
- 🟢 Green — up to date
- 🟠 Orange — update available
- 🔴 Red — vulnerable
- ⚪ Grey — unknown
- Dashed — not installed

---

### History Tab

A chronological timeline of every **install, update, and rollback** performed through the extension. Entries are stored per-workspace.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `R` | Refresh packages |
| `/` or `Ctrl+F` | Focus search bar |
| `Esc` | Close detail panel / modal |

---

## ⚙️ Configuration

Open **Settings** (`Ctrl+,`) and search for `pythonPackageVisualizer`:

| Setting | Default | Description |
|---|---|---|
| `pythonPackageVisualizer.pythonPath` | `""` | Override the Python executable path |
| `pythonPackageVisualizer.cacheExpiryMinutes` | `60` | How long PyPI data is cached |
| `pythonPackageVisualizer.autoCheckOnOpen` | `true` | Auto-scan when a workspace is opened |
| `pythonPackageVisualizer.notifyOnOutdated` | `true` | Show notification if outdated packages found |

---

## 🗂️ Supported Dependency Files

| File | Parsed |
|---|---|
| `requirements.txt` | ✅ |
| `requirements-dev.txt`, `requirements-test.txt`, etc. | ✅ (auto group: dev / test / docs / lint) |
| `-r base.txt` includes | ✅ (followed recursively) |
| `pyproject.toml` | ✅ PEP 621 + Poetry (including named groups) |
| `setup.py` | ✅ `install_requires` + `extras_require` |
| `setup.cfg` | ✅ `[options]` + `[options.extras_require]` |
| `Pipfile` | ✅ `[packages]` + `[dev-packages]` |

→ See [Supported Project Types](https://github.com/Elanchezhiyan-P/python-package-visualizer/wiki/Supported-Project-Types) for full details.

---

## 🔒 Security (CVE Badges)

Vulnerability data is fetched from the **PyPI JSON API** (`https://pypi.org/pypi/{name}/json`). If a package version has known vulnerabilities, a 🔴 CVE badge is shown inline and full details (CVE ID, description, fixed version) are visible in the package detail panel.

---

## 🛠️ Development

```bash
# Clone the repo
git clone https://github.com/Elanchezhiyan-P/python-package-visualizer.git
cd python-package-visualizer

# Install dependencies
npm install

# Build
npm run build

# Watch mode (auto-rebuild on save)
npm run watch
```

Then press `F5` in VS Code (with the project folder open) to launch the **Extension Development Host**.

---

## 📁 Project Structure

```
python-package-visualizer/
├── src/
│   ├── extension.ts              # Entry point
│   ├── commands/
│   │   └── commandController.ts  # All command & message handlers
│   ├── modules/
│   │   ├── packageScanner.ts     # Scans requirements files
│   │   ├── importScanner.ts      # Static import analysis
│   │   └── requirementsSync.ts   # Syncs version pins to file
│   ├── services/
│   │   ├── versionChecker.ts     # PyPI API calls
│   │   └── versionHistoryCache.ts
│   ├── ui/
│   │   ├── webviewPanel.ts       # Main editor tab
│   │   ├── sidebarProvider.ts    # Activity Bar sidebar
│   │   └── statusBarManager.ts   # Status bar badge
│   └── webview/
│       ├── index.html            # Webview UI
│       └── main.js               # Webview JS
├── media/
│   └── icon.svg
└── package.json
```

---

## 🤝 Contributing

Contributions, issues and feature requests are welcome!

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 📄 License

MIT © [Elanchezhiyan P](https://codebyelan.in)

---

## 👨‍💻 Author

**Elanchezhiyan P**
- 🌐 [codebyelan.in](https://codebyelan.in)
- 🐙 [github.com/Elanchezhiyan-P](https://github.com/Elanchezhiyan-P)

---

*If you find this extension useful, consider giving it a ⭐ on GitHub!*
