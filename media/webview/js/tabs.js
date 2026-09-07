/**
 * Primary Tab Routing and Top-Level Stats Synchronization System.
 * Coordinates view swaps across modular tab components and updates status bar warnings.
 * Loaded sequentially after specific tab component files to guarantee execution contexts.
 */

/**
 * Synchronizes layout count for dependency conflict stat card.
 * Hides or displays conflict card on toolbar depending on severity.
 * 
 * @returns {void}
 */
window.updateConflictStat = function () {
  const card = document.getElementById('stat-conflict-card');
  const num  = document.getElementById('stat-conflict');
  const conflicts = window.allConflicts || [];
  if (num)  { num.textContent = conflicts.length; }
  if (card) { card.style.display = conflicts.length > 0 ? '' : 'none'; }
};

/**
 * Computes and triggers alert-banners for vulnerability checks.
 * Warns users of active security advisories in current environment state.
 * 
 * @param {Array<object>} packages - The raw package list.
 * @returns {void}
 */
window.updateVulnBanner = function (packages) {
  const elVulnBanner = document.getElementById('vuln-banner');
  if (!elVulnBanner) return;
  const count = packages.filter(p => p.vulnerabilities && p.vulnerabilities.length > 0).length;
  if (count > 0 && !window.vulnBannerDismissed) {
    const el = document.getElementById('vuln-banner-count');
    if (el) el.textContent = count;
    elVulnBanner.classList.add('visible');
  } else {
    elVulnBanner.classList.remove('visible');
  }
};

/**
 * Computes and triggers alert-banners for requirements sync drift.
 * Detects misalignment between actual installed versions and requirements.txt declarations.
 * 
 * @param {Array<object>} packages - The raw package list.
 * @returns {void}
 */
window.updateDriftBanner = function (packages) {
  const elDriftBanner = document.getElementById('drift-banner');
  if (!elDriftBanner) return;
  const drifted = window.computeDrift(packages);
  if (drifted.length > 0 && !window.driftBannerDismissed) {
    const el = document.getElementById('drift-banner-count');
    if (el) el.textContent = drifted.length;
    elDriftBanner.classList.add('visible');
  } else {
    elDriftBanner.classList.remove('visible');
  }
};

/**
 * Refreshes top-level statistics display numbers in header card overlays.
 * Keeps status indicators in sync with current workspace environment metrics.
 * 
 * @param {Array<object>} packages - The raw package list.
 * @returns {void}
 */
window.updateStats = function (packages) {
  const ok       = packages.filter(p => p.status === 'up-to-date').length;
  const updates  = packages.filter(p => p.status === 'update-available' && !p.updateBlockedByConflict).length;
  const unknown  = packages.filter(p => p.status === 'unknown' || p.status === 'not-installed').length;
  const drifted  = packages.filter(p =>
    p.hasVersionDrift ||
    p.status === 'drift' ||
    (p.specifiedVersion && p.installedVersion && window.hasDrift?.(p.specifiedVersion, p.installedVersion))
  ).length;
  const vulnPkgs = packages.filter(p => p.vulnerabilities && p.vulnerabilities.length > 0).length;

  const elStatOk = document.getElementById('stat-ok');
  const elStatUpdate = document.getElementById('stat-update');
  const elStatUnknown = document.getElementById('stat-unknown');
  const elStatDrift = document.getElementById('stat-drift');
  const elStatVuln = document.getElementById('stat-vuln');
  const elStatVulnCard = document.getElementById('stat-vuln-card');
  const elStatGroupsCard = document.getElementById('stat-groups-card');
  const elStatGroupsText = document.getElementById('stat-groups-text');

  if (elStatOk) elStatOk.textContent = ok;
  if (elStatUpdate) elStatUpdate.textContent = updates;
  if (elStatUnknown) elStatUnknown.textContent = unknown;
  if (elStatDrift) elStatDrift.textContent = drifted;

  if (elStatVuln) elStatVuln.textContent = vulnPkgs;
  if (elStatVulnCard) elStatVulnCard.style.display = vulnPkgs > 0 ? '' : 'none';

  // Stale packages (no release in >12 months)
  const now = Date.now();
  const TWELVE_MONTHS = 365.25 * 24 * 60 * 60 * 1000;
  const stalePkgs = packages.filter(p => {
    if (!p.releaseDate) return false;
    const age = now - new Date(p.releaseDate).getTime();
    return age > TWELVE_MONTHS;
  }).length;
  const elStatStale = document.getElementById('stat-stale');
  const elStatStaleCard = document.getElementById('stat-stale-card');
  if (elStatStale) elStatStale.textContent = stalePkgs;
  if (elStatStaleCard) elStatStaleCard.style.display = stalePkgs > 0 ? '' : 'none';

  window.updateVulnBanner(packages);
  window.updateDriftBanner(packages);

  // Group breakdown
  const groupCounts = {};
  for (const pkg of packages) {
    const g = pkg.group || 'main';
    groupCounts[g] = (groupCounts[g] || 0) + 1;
  }
  const nonMainGroups = Object.entries(groupCounts)
    .filter(([g]) => g !== 'main')
    .map(([g, c]) => `${c} ${g}`)
    .join(' · ');
  const mainCount = groupCounts['main'] || 0;
  if (nonMainGroups && elStatGroupsCard && elStatGroupsText) {
    elStatGroupsText.textContent = `${mainCount} main · ${nonMainGroups}`;
    elStatGroupsCard.style.display = '';
  } else if (elStatGroupsCard) {
    elStatGroupsCard.style.display = 'none';
  }
};

/**
 * High-level router that toggles HTML displays based on active tab select.
 * Dispatches drawing requests to modular sub-renderers when a tab becomes active.
 * 
 * @param {string} tab - Tab name ('list' | 'dashboard' | 'unused' | 'graph' | etc.).
 * @param {Array<object>} filtered - The filtered set of package items.
 * @returns {void}
 */
window.showTab = function (tab, filtered) {
  const elGraph = document.getElementById('view-graph');
  const elList = document.getElementById('view-list');
  const elUnused = document.getElementById('view-unused');
  const elHistory = document.getElementById('view-history');
  const elDashboard = document.getElementById('view-dashboard');
  const elPerformance = document.getElementById('view-performance');
  const elViewLicenses = document.getElementById('view-licenses');
  const elViewSnapshots = document.getElementById('view-snapshots');
  const elViewConflicts = document.getElementById('view-conflicts');
  const elViewVenvHealth = document.getElementById('view-venv-health');

  // Hide loading/empty overlays to prevent overlap with tab content
  const elLoading = document.getElementById('loading');
  const elEmpty = document.getElementById('empty-state');
  if (elLoading) elLoading.style.display = 'none';
  if (elEmpty) elEmpty.style.display = 'none';

  if (elGraph) elGraph.style.display = 'none';
  if (elList) elList.style.display = 'none';
  if (elUnused) elUnused.style.display = 'none';
  if (elHistory) elHistory.style.display = 'none';
  if (elDashboard) elDashboard.style.display = 'none';
  if (elPerformance) elPerformance.style.display = 'none';
  if (elViewLicenses) elViewLicenses.style.display = 'none';
  if (elViewSnapshots) elViewSnapshots.style.display = 'none';
  if (elViewConflicts) elViewConflicts.style.display = 'none';
  if (elViewVenvHealth) elViewVenvHealth.style.display = 'none';

  if (tab === 'graph') {
    if (elGraph) elGraph.style.display = 'block';
    if (typeof window.renderGraph === 'function') window.renderGraph(filtered);
  } else if (tab === 'unused') {
    if (elUnused) {
      elUnused.style.display = 'flex';
      elUnused.style.flexDirection = 'column';
      if (typeof window.renderUnused === 'function') window.renderUnused();
    }
  } else if (tab === 'history') {
    if (elHistory) elHistory.style.display = 'flex';
    if (typeof window.renderHistory === 'function') window.renderHistory();
  } else if (tab === 'dashboard') {
    if (elDashboard) {
      elDashboard.style.display = 'flex';
      if (typeof window.renderDashboard === 'function') window.renderDashboard();
    }
  } else if (tab === 'performance') {
    if (elPerformance) {
      elPerformance.style.display = 'flex';
      if (typeof window.renderPerformance === 'function') window.renderPerformance(filtered);
    }
  } else if (tab === 'licenses') {
    if (elViewLicenses) {
      elViewLicenses.style.display = 'flex';
      elViewLicenses.style.flexDirection = 'column';
      if (typeof window.renderLicenses === 'function') window.renderLicenses();
    }
  } else if (tab === 'snapshots') {
    if (elViewSnapshots) {
      elViewSnapshots.style.display = 'flex';
      elViewSnapshots.style.flexDirection = 'column';
      window.vscode.postMessage({ type: 'listSnapshots' });
      if (typeof window.renderSnapshots === 'function') window.renderSnapshots();
    }
  } else if (tab === 'conflicts') {
    if (elViewConflicts) {
      elViewConflicts.style.display = 'flex';
      if (typeof window.renderConflicts === 'function') window.renderConflicts();
    }
  } else if (tab === 'venv-health') {
    if (elViewVenvHealth) {
      elViewVenvHealth.style.display = 'flex';
      if (typeof window.renderVenvHealth === 'function') window.renderVenvHealth();
    }
  } else {
    if (elList) elList.style.display = 'block';
    if (typeof window.renderTable === 'function') window.renderTable(filtered);
  }
};
