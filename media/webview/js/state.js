/**
 * Global State and Scope Initializer for Python Package Visualizer.
 * Defines global state bindings on the window object to keep modular files
 * decoupled and fully type safe.
 *
 * WHY: Attaching variables on window allows sandbox offline webviews to access
 * values dynamically without complex module bundling or custom module bundler steps.
 */

// ── acquire VS Code Extension API ──────────────────────────────────────────
window.vscode = acquireVsCodeApi();

// ── Global State variables declarations ─────────────────────────────────────
window.allPackages = [];
window.historyEntries = [];
window.allConflicts = [];
window.conflictsByPkg = new Map(); // normalized pkg name -> ConflictInfo[]
window.snapshots = [];
window.scanStats = {};
window.activeTab = 'list';
window.sortCol = 'name';
window.sortDir = 'asc';
window.selectedPackages = new Set();
window.selectedUnusedPackages = new Set();
window.safeMode = true;
window.vulnBannerDismissed = false;
window.driftBannerDismissed = false;
window.activeCardFilter = null;
window.searchQuery = '';
window.activeFilterStatus = 'all';
window.activeFilterGroup = 'all';

// Load Safe Mode from localStorage persistence
try {
  const storedSafe = localStorage.getItem('ppv-safeMode');
  if (storedSafe !== null) {
    window.safeMode = storedSafe === 'true';
  }
} catch (_) {
  // Silent fallback for sandboxed offline browser instances
}

// Add Package modal results/pending states
window.pendingInstallName = '';
window.pendingInstallVersion = '';
