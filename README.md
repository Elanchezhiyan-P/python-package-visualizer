<div align="center">

# 📦 Python Package Visualizer

**The ultimate dependency manager for Python projects in VS Code**

![Version](https://img.shields.io/badge/version-3.0.0-blue?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)
![VS Code](https://img.shields.io/badge/vscode-%5E1.85.0-007ACC?style=flat-square&logo=visualstudiocode)
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
- ⚡ **Update safely** — Safe Mode blocks major-version jumps
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
2. Click the **📦 icon** in the Activity Bar (left side)
3. Click **▶ Open Package Visualizer** in the sidebar

That's it. Everything is automatic from there.

---

## 🎯 Core Features

### 📋 Package Management
| Feature | What it does |
|---|---|
| **Package List** | Sortable table of all dependencies with installed vs latest versions |
| **One-click Update** | Update a single package or all at once |
| **Rollback** | Revert to a previously installed version |
| **Install New** | Search PyPI and install packages directly |
| **Pin Versions** | Lock packages to their current version in `requirements.txt` |
| **Remove Unused** | Delete packages from requirements with one click |
| **Bulk Actions** | Select multiple packages and update/remove together |

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
| **Safe Mode** 🛡️ | Blocks major-version updates to prevent breaking changes |
| **Python Compatibility** | Warns when packages require newer Python |

### 📊 Visualization & Analytics

- **Dashboard** — health score, weekly downloads, security stats, maintainer activity
- **Dependency Graph** — interactive D3.js tree with collapsible nodes
- **Performance** — ranks packages by install time (Fast/Moderate/Slow)
- **History** — timeline of all updates, installs, rollbacks
- **Licenses** — packages grouped by license with risk badges
- **Snapshots** — save and restore your entire environment

### 🛠 Power Tools

Accessible from the **Export** dropdown in the main panel:

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

## 🎯 What's New in v3.0.0

- 📝 **Import Annotations** above every import line with Update/Install quick actions
- 📊 **Function Metrics** (lines, references, complexity) above every `def`
- 💡 **Quick-fix CodeLens** — click "Missing docstring" to auto-insert a template
- 🔍 **Clickable References** — click `🔗 X refs` to open VS Code's Find All References panel
- 🤖 **Smart Hover Cards** — compact, actionable hover UI with health indicators
- 💰 **API Cost Hints** for LLM client classes (ChatGroq, ChatOpenAI, etc.)
- 🎨 **Redesigned tabs** — cleaner Dashboard, Performance, History, Unused, Licenses, Snapshots
- ⚙️ **Full Settings Panel** in the sidebar with 10 toggles
- 📦 **Environment Snapshots** — save and restore your full dependency state
- 🛡️ **Safe Mode** — blocks major-version updates to prevent breaking changes
- ⚡ **Migration Tools** — convert to uv / Poetry with one click
- 🚀 **Setup Script Generator** — Bash, PowerShell, and Markdown

See the [CHANGELOG](CHANGELOG.md) for the full history.

---

## 📋 Supported Project Types

The extension automatically detects and parses:

| File | Notes |
|---|---|
| `requirements.txt` | Main pip format |
| `requirements-dev.txt`, `requirements-test.txt`, `requirements-prod.txt` | Environment-specific |
| `pyproject.toml` | PEP 517/518/621, Poetry, PDM, Hatch, uv |
| `setup.py` | Legacy setuptools |
| `setup.cfg` | Declarative setuptools |
| `Pipfile` | Pipenv |

Virtual environments are auto-detected from: `.venv/`, `venv/`, `env/`, `.env/`.

---

## 🔧 Installation

### From VS Code Marketplace
1. Open VS Code
2. Go to **Extensions** (`Ctrl+Shift+X`)
3. Search **Python Package Visualizer**
4. Click **Install**

### From VSIX
```bash
code --install-extension python-package-visualizer-3.0.0.vsix
```

---

## 🤝 Contributing

Issues and pull requests are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

- 🐛 **Bug reports:** [GitHub Issues](https://github.com/Elanchezhiyan-P/python-package-visualizer/issues)
- 💡 **Feature requests:** same place — use the `enhancement` label
- 📖 **Documentation:** [GitHub Wiki](https://github.com/Elanchezhiyan-P/python-package-visualizer/wiki)

---

## 👤 Author

**Elanchezhiyan P**
- 🌐 [codebyelan.in](https://codebyelan.in)
- 🐙 [github.com/Elanchezhiyan-P](https://github.com/Elanchezhiyan-P)

---

## 📜 License

MIT © [Elanchezhiyan P](https://codebyelan.in). See [LICENSE](LICENSE) for details.

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

**Recommended tools for recording new GIFs:**
- 🎞️ [ScreenToGif](https://www.screentogif.com/) *(Windows, free)*
- 🎞️ [Kap](https://getkap.co/) *(macOS, free)*
- 🎞️ [LICEcap](https://www.cockos.com/licecap/) *(cross-platform, free)*
