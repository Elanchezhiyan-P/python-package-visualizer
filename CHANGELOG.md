# Changelog

All notable changes to **Python Package Visualizer (Community)** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.3.1] — 2026-09-07

### Added

- Pin and Ignore choices are saved in `.python-package-visualizer.json` at the project root so they sync across machines via git (legacy editor storage is migrated once)

## [3.3.0] — 2026-09-01

### Added

- Pin a package to a chosen PyPI version from the list or detail panel — installs it if needed, writes `==` in the dependency file, and hides updates until a newer release than at pin time; **Ignore** remains a separate action

### Fixed

- Bulk Update no longer silently aligns exact pins of packages that were not selected — only successfully updated packages are reconciled in dependency files

### Changed

- Internal refactor: split oversized TypeScript and webview modules for maintainability (no user-facing API changes)

## [3.2.6] — 2026-08-07

### Added

- Multi-root workspaces: detect `.venv` across all workspace folders, not only the first root
- Environment tab: **Active project** selector when multiple workspace folders have a virtual environment (persisted choice)

### Changed

- Python resolution priority: manual project selection → active editor folder → first folder with venv
- Package scan uses each folder's local venv for installed-version lookup when present
- CodeLens and import hover use the document's workspace folder for conflicts and ignored updates
- Pre-update snapshots and pip operations follow the active project root

### Fixed

- Environment tab showed "System Python" when the venv lived on a secondary workspace root
- Race when switching active project in the Environment tab could refresh with stale health data
- `willUseGlobalPython` false positives when the selected venv belonged to another workspace root

## [3.2.5] — 2026-07-19

### Added

- Unused Packages: manually mark packages as used (persisted) and unmark them later
- Performance tab: clear note that install times are measured only for installs/updates/rollbacks from this extension

### Changed

- Align Versions: drift only on exact pins (`==` / `===`); flexible ranges are no longer treated as out of sync
- License display: show short license labels instead of full legal text walls (full text in a collapsible details block)
- Dashboard dependency paths: truncated with tooltip, click-to-copy, and clearer auto-detected badge layout

### Fixed

- Performance tab always showing zeros — install duration is now timed, stored in history, and sent to the UI
- License detection for LGPL/MPL and common PyPI license fields; MIT text recognition
- Pre-release version comparison and exact-pin/wildcard edge cases for align and drift

## [3.2.4] — 2026-07-11

### Added

- Unused Packages tab: per-row and select-all checkboxes with bulk remove (snapshot, dependency files, and venv uninstall)

### Fixed

- Environment tab **Update pip** now uses the workspace Python/uv interpreter instead of generic `python` on PATH
- Bulk unused removal dialog: select-all / deselect-all controls

## [3.2.3] — 2026-07-11

### Fixed

- Unused packages tab incorrectly showing all packages as used — dependency files no longer count as strong usage evidence during reference search
- Script and entry-point detection in `pyproject.toml` / `setup.cfg` for CLI packages missed by import scan

## [3.2.2] — 2026-07-11

### Changed

- Sidebar quick links: Changelog points to this file; Report an Issue opens the GitHub Issues page
- Usage evidence engine for smarter unused-package detection (Django settings, pytest config, migrations, dev-tool configs)
- Orphan-chain analysis to reduce false positives when related packages are used together
- PyPI top-level module cache for import-to-package mapping

## [3.2.1] — 2026-07-05

### Fixed

- Reliable package removal — UTF-16 `requirements.txt` support, PEP 508 direct URLs (`pkg @ git+…`), and fallback search across included `-r` files
- Bulk align fix — sync now searches included requirement files, handles pip hash/continuation lines, and preserves environment markers

## [3.2.0] — 2026-07-03

### Added

- Independent community release published under `FaberVi` (separate from the original marketplace extension)
- Tools menu — export, generate, and uv/Poetry migration in one dropdown
- uv migration (manual/automatic) with optional cleanup of legacy `requirements*.txt` files

### Changed

- Updated branding — extension icon aligned with the in-app package tile

## [3.1.1]

### Added

- Robust dependency file discovery — scans subfolders (e.g. `backend/requirements.txt` in monorepos)
- `requirements-dev.txt` support — follows `-r requirements.txt` includes and merges packages correctly
- In-panel empty state — manual file selection from the visualizer UI (EN/IT)
- Cursor AI review — optional Agent analysis for unused packages
- Conflict-aware updates — blocked updates on `pip check` conflicts, revert & force-update actions
- Global Python guard — confirmation before install/update when not using a workspace venv
- Italian localization — webview, sidebar, tour, and key VS Code messages
- Cursor compatibility — engine `^1.105.0`, installable in Cursor via VSIX

### Changed

- Smarter unused detection — dynamic imports, config/Dockerfile references, reduced false positives

## [3.0.1]

### Added

- Import annotations, function metrics, quick-fix CodeLens, smart hover cards
- Environment snapshots, Safe Mode, uv/Poetry migration, setup script generator
- Environment diagnostic scan tab
- Modular extension architecture and i18n support

## [2.x and earlier]

See [commit history](https://github.com/FaberVi/python-package-visualizer/commits/main) for changes prior to the community fork.
