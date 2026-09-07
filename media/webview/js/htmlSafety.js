/**
 * HTML escaping, badges, and overlay helpers for Python Package Visualizer.
 * Loaded sequentially after i18n.js.
 */

/**
 * Escapes HTML special characters to prevent cross-site scripting (XSS)
 * when rendering dynamic package names, summaries, or metadata.
 * 
 * @param {string} str - The raw string to escape.
 * @returns {string} The HTML-safe string.
 */
window.esc = function (str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

/**
 * Renders a button that installs the pip requirement suggested by a conflict row.
 *
 * @param {{ requirement: string, conflictingPackage: string }} conflict
 * @returns {string}
 */
window.conflictFixButtonHtml = function (conflict) {
  if (!conflict?.requirement || !conflict?.conflictingPackage) {
    return '';
  }
  const label = (window.t ? window.t('btn.fixConflict') : '🔧 Install {spec}')
    .replace('{spec}', conflict.requirement);
  const title = window.t ? window.t('btn.fixConflictTitle') : 'Install the required version to resolve this conflict';
  return `<button class="action-btn fix-conflict-btn" data-spec="${window.esc(conflict.requirement)}" data-package="${window.esc(conflict.conflictingPackage)}" title="${window.esc(title)}">${window.esc(label)}</button>`;
};

/**
 * Wires click handlers for conflict fix buttons inside a container element.
 *
 * @param {ParentNode} root
 */
window.wireConflictFixButtons = function (root) {
  if (!root) return;
  root.querySelectorAll('.fix-conflict-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const spec = btn.dataset.spec;
      const packageName = btn.dataset.package;
      if (!spec || !packageName || !window.vscode) return;
      btn.disabled = true;
      const applying = window.t ? window.t('btn.fixConflictApplying') : 'Applying fix…';
      btn.textContent = applying;
      window.vscode.postMessage({ type: 'fixConflict', requirement: spec, packageName });
    });
  });
};

/**
 * Returns dynamic HTML badge matching package update/sync status.
 * Standardizes styling class and leverages localization dictionaries.
 * 
 * @param {string} status - Package status string.
 * @returns {string} HTML span element.
 */
window.statusBadge = function (status) {
  const labels = {
    'up-to-date':       window.t('status.upToDate'),
    'update-available': window.t('status.updateAvailable'),
    'update-ignored':   window.t('status.updateIgnored'),
    'conflict-blocked': window.t('status.conflictBlocked'),
    'not-installed':    window.t('status.notInstalled'),
    'drift':            window.t('status.drift'),
    'unknown':          window.t('status.unknown'),
  };
  return `<span class="badge ${window.esc(status || 'unknown')}">${labels[status] || window.t('status.unknown')}</span>`;
};

/**
 * Renders the primary fullscreen loading state during environment discovery.
 * Ensures the user has visual feedback when long shell commands run.
 * 
 * @param {string} msg - Dynamic message string.
 */
window.showLoading = function (msg) {
  const elLoadingMsg = document.getElementById('loading-msg');
  const elLoading    = document.getElementById('loading');
  const elEmpty      = document.getElementById('empty-state');

  if (elLoadingMsg) elLoadingMsg.textContent = msg || 'Scanning workspace…';
  if (elLoading) elLoading.style.display = 'flex';
  if (elEmpty) elEmpty.style.display = 'none';

  // Hide ALL view containers to prevent overlap with loading spinner
  const viewIds = [
    'view-graph', 'view-list', 'view-unused', 'view-history',
    'view-dashboard', 'view-performance', 'view-licenses',
    'view-snapshots', 'view-conflicts', 'view-venv-health'
  ];
  for (const id of viewIds) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
};

/**
 * Brief toast for clipboard copy feedback.
 * @param {string} [message]
 */
window.showCopyToast = function (message) {
  const el = document.getElementById('copy-toast');
  if (!el) return;
  el.textContent = message || (window.t ? window.t('toast.copied') : '✓ Copied');
  el.classList.add('show');
  clearTimeout(window._copyToastTimer);
  window._copyToastTimer = setTimeout(() => {
    el.classList.remove('show');
  }, 1600);
};

/**
 * Dismisses the fullscreen loading state when a background scan completes.
 */
window.hideLoading = function () {
  const elLoading = document.getElementById('loading');
  if (elLoading) elLoading.style.display = 'none';
};

/**
 * Displays an empty-state panel when no valid python dependency files are found.
 * Provides helpful diagnostic directions to resolve requirements setup.
 *
 * @param {object} [state] - { reason: 'not-found' | 'parse-failed', failedPath?: string }
 */
window.showEmpty = function (state) {
  const reason = state?.reason || 'not-found';
  const elEmpty = document.getElementById('empty-state');
  const elTitle = document.querySelector('#empty-state .empty-title');
  const elDesc = document.querySelector('#empty-state p');

  if (elTitle) {
    elTitle.textContent = reason === 'parse-failed'
      ? window.t('empty.parseFailedTitle')
      : window.t('empty.noPythonTitle');
  }
  if (elDesc) {
    elDesc.textContent = reason === 'parse-failed'
      ? window.t('empty.parseFailedDesc').replace('{path}', state?.failedPath || '')
      : window.t('empty.autoNotFoundDesc');
  }

  const viewIds = [
    'view-graph', 'view-list', 'view-unused', 'view-history',
    'view-dashboard', 'view-performance', 'view-licenses',
    'view-snapshots', 'view-conflicts', 'view-venv-health'
  ];
  for (const id of viewIds) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  if (elEmpty) elEmpty.style.display = 'flex';
};
