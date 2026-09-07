/**
 * Filter, Search, and Sort Logic for Python Package Visualizer.
 * Coordinates toolbar search inputs, active card status choices, and multi-column sorting.
 *
 * WHY: Decoupling filter computations from table rendering keeps the components focused,
 * clean, and highly reusable.
 */

// ── Shared Utility: Clear Filters ──────────────────────────────────────────
/**
 * Resets search boxes, dropdown selects, and clicked stat card highlights
 * back to empty default state.
 */
window.clearFilters = function () {
  const elSearch = document.getElementById('search');
  const elFilter = document.getElementById('filter-status');
  const elFilterGroup = document.getElementById('filter-group');

  if (elSearch) elSearch.value = '';
  if (elFilter) elFilter.value = 'all';
  if (elFilterGroup) elFilterGroup.value = 'all';

  window.searchQuery = '';
  window.activeFilterStatus = 'all';
  window.activeFilterGroup = 'all';
  window.activeCardFilter = null;

  document.querySelectorAll('.stat-card.clickable').forEach(c => c.classList.remove('selected'));
  
  // Highlight active filter states in dropdown selects
  if (elFilter) elFilter.classList.remove('active');
  if (elFilterGroup) elFilterGroup.classList.remove('active');

  window.renderAll();
};

// ── Shared Utility: Query Filtered Packages ─────────────────────────────────
/**
 * Sifts the global packages cache based on toolbar search text, selected group,
 * status selectors, and applies active column sort indicators.
 * 
 * @returns {Array<object>} The sorted, filtered list of packages.
 */
window.getFiltered = function () {
  let pkgs = window.allPackages || [];
  const search = (window.searchQuery || '').trim().toLowerCase();
  const status = window.activeFilterStatus || 'all';
  const group = window.activeFilterGroup || 'all';
  const card = window.activeCardFilter;

  // Search Filter
  if (search) {
    pkgs = pkgs.filter(p =>
      p.name.toLowerCase().includes(search) ||
      (p.summary && p.summary.toLowerCase().includes(search))
    );
  }

  // Card Filter (clicked stat-card: 'up-to-date', 'update-available', 'unknown', 'vuln', 'conflict', 'stale', 'drift')
  if (card) {
    if (card === 'vuln') {
      pkgs = pkgs.filter(p => p.vulnerabilities && p.vulnerabilities.length > 0);
    } else if (card === 'conflict') {
      pkgs = pkgs.filter(p => p.hasConflict);
    } else if (card === 'stale') {
      const now = Date.now();
      const TWELVE_MONTHS = 365.25 * 24 * 60 * 60 * 1000;
      pkgs = pkgs.filter(p => {
        if (!p.releaseDate) return false;
        return (now - new Date(p.releaseDate).getTime()) > TWELVE_MONTHS;
      });
    } else if (card === 'drift') {
      pkgs = pkgs.filter(p =>
        p.hasVersionDrift ||
        p.status === 'drift' ||
        (p.specifiedVersion && p.installedVersion && window.hasDrift?.(p.specifiedVersion, p.installedVersion))
      );
    } else if (card === 'update-ignored') {
      pkgs = pkgs.filter(p => p.status === 'update-ignored');
    } else {
      pkgs = pkgs.filter(p => p.status === card);
    }
  }

  // Status Dropdown
  if (status !== 'all') {
    if (status === 'drift') {
      pkgs = pkgs.filter(p =>
        p.hasVersionDrift ||
        p.status === 'drift' ||
        (p.specifiedVersion && p.installedVersion && window.hasDrift?.(p.specifiedVersion, p.installedVersion))
      );
    } else if (status === 'update-ignored') {
      pkgs = pkgs.filter(p => p.status === 'update-ignored');
    } else {
      pkgs = pkgs.filter(p => p.status === status);
    }
  }

  // Group Dropdown
  if (group !== 'all') {
    pkgs = pkgs.filter(p => p.group === group);
  }

  // Sorting
  const col = window.sortCol || 'name';
  const dir = window.sortDir || 'asc';
  pkgs = [...pkgs].sort((a, b) => {
    let valA, valB;

    if (col === 'name') {
      valA = a.name.toLowerCase();
      valB = b.name.toLowerCase();
    } else if (col === 'required') {
      valA = a.specifiedVersion || '';
      valB = b.specifiedVersion || '';
    } else if (col === 'installed') {
      valA = a.installedVersion || '';
      valB = b.installedVersion || '';
    } else if (col === 'latest') {
      valA = a.latestVersion || '';
      valB = b.latestVersion || '';
    } else if (col === 'released') {
      valA = a.releaseDate || '';
      valB = b.releaseDate || '';
    } else if (col === 'status') {
      valA = a.status || '';
      valB = b.status || '';
    } else {
      valA = a.name.toLowerCase();
      valB = b.name.toLowerCase();
    }

    if (valA < valB) return dir === 'asc' ? -1 : 1;
    if (valA > valB) return dir === 'asc' ? 1 : -1;
    return 0;
  });

  return pkgs;
};

// ── Shared Utility: Sort Table Headers UI ────────────────────────────────────
/**
 * Renders caret icons on table header columns reflecting the active sort dir.
 */
window.updateSortHeaders = function () {
  document.querySelectorAll('th[data-col]').forEach(th => {
    const col = th.dataset.col;
    const icon = document.getElementById(`si-${col}`);
    th.classList.remove('sorted', 'sort-asc', 'sort-desc');
    if (icon) icon.textContent = '\u2B0D';

    if (col === window.sortCol) {
      th.classList.add('sorted', window.sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
      if (icon) icon.textContent = window.sortDir === 'asc' ? '▲' : '▼';
    }
  });
  // Reset released column icon explicitly if not sorted by released
  const siReleased = document.getElementById('si-released');
  if (siReleased && window.sortCol !== 'released') {
    siReleased.textContent = '\u2B0D';
  }
};
