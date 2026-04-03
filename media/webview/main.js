// main.js — runs inside the VS Code webview sandbox (browser context)
// Receives messages from the extension host and drives all UI interactions.

(function () {
  'use strict';

  const vscode = acquireVsCodeApi();

  // ── State ───────────────────────────────────────────────────────────────
  let allPackages = [];
  let historyEntries = [];
  let allConflicts = [];
  let conflictsByPkg = new Map(); // normalized pkg name → ConflictInfo[]
  let activeTab = 'list';
  let sortCol = 'status';   // active sort column key
  let sortDir = 'asc';      // 'asc' | 'desc'
  let selectedPackages = new Set(); // Set of package names
  let filterVuln     = false; // extra stat-card filter: only vulnerable
  let filterConflict = false; // extra stat-card filter: only conflicted
  let filterDrift    = false; // extra filter: only drifted packages
  let activeStatFilter = null; // tracks which stat card is selected
  let safeMode = false;          // block major-version updates when true
  let vulnBannerDismissed  = false;
  let driftBannerDismissed = false;
  let snapshots = [];            // list of saved snapshots from extension

  // Pending PyPI search result (for Add Package modal)
  let pendingInstallName = '';
  let pendingInstallVersion = '';

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const elLoading      = document.getElementById('loading');
  const elLoadingMsg   = document.getElementById('loading-msg');
  const elEmpty        = document.getElementById('empty-state');
  const elGraph        = document.getElementById('view-graph');
  const elList         = document.getElementById('view-list');
  const elUnused       = document.getElementById('view-unused');
  const elHistory      = document.getElementById('view-history');
  const elUnusedBody   = document.getElementById('unused-table-body');
  const elUnusedEmpty  = document.getElementById('unused-empty');
  const elTableBody    = document.getElementById('pkg-table-body');
  const elSearch      = document.getElementById('search');
  const elFilter      = document.getElementById('filter-status');
  const elFilterGroup = document.getElementById('filter-group');
  const elStatOk      = document.getElementById('stat-ok');
  const elStatUpdate  = document.getElementById('stat-update');
  const elStatUnknown = document.getElementById('stat-unknown');
  const elDetail      = document.getElementById('detail-panel');
  const elDetailName  = document.getElementById('detail-name');
  const elDetailBody  = document.getElementById('detail-body');
  const elDetailClose = document.getElementById('detail-close');
  const elRefresh      = document.getElementById('btn-refresh');
  const elOverlay      = document.getElementById('overlay');
  const elStatVuln     = document.getElementById('stat-vuln');
  const elStatVulnCard = document.getElementById('stat-vuln-card');
  const elStatGroupsCard = document.getElementById('stat-groups-card');
  const elStatGroupsText = document.getElementById('stat-groups-text');
  // Add Package modal
  const elAddPkgModal   = document.getElementById('add-pkg-modal');
  const elAddPkgInput   = document.getElementById('add-pkg-input');
  const elAddPkgSearch  = document.getElementById('add-pkg-search');
  const elAddPkgResult  = document.getElementById('add-pkg-result');
  const elAddPkgInstall = document.getElementById('add-pkg-install');
  const elAddPkgClose   = document.getElementById('add-pkg-close');
  const elAddPkgCancel  = document.getElementById('add-pkg-cancel');
  const elBtnAddPkg     = document.getElementById('btn-add-pkg');
  // Export
  const elBtnExport   = document.getElementById('btn-export');
  const elExportMenu  = document.getElementById('export-menu');
  const elExportWrap  = document.getElementById('export-wrap');
  // Bulk bar & checkboxes
  const elBulkBar    = document.getElementById('bulk-bar');
  const elBulkCount  = document.getElementById('bulk-count');
  const elBulkUpdate = document.getElementById('bulk-update');
  const elBulkDeselect = document.getElementById('bulk-deselect');
  const elCheckAll   = document.getElementById('check-all');
  const elCopyToast  = document.getElementById('copy-toast');
  const elBtnSafeMode   = document.getElementById('btn-safe-mode');
  const elVulnBanner    = document.getElementById('vuln-banner');
  const elDriftBanner   = document.getElementById('drift-banner');
  const elViewLicenses  = document.getElementById('view-licenses');
  const elViewSnapshots = document.getElementById('view-snapshots');

  // ── Message listener (extension → webview) ───────────────────────────────
  window.addEventListener('message', event => {
    const msg = event.data;
    switch (msg.type) {
      case 'init':
      case 'update':
        hideLoading();
        allPackages = msg.packages || [];
        if (msg.scanStats) {
          window._scanStats = msg.scanStats;
        }
        vulnBannerDismissed  = false;
        driftBannerDismissed = false;
        renderAll();
        if (msg.type === 'init') { setTimeout(startTour, 1000); }
        break;
      case 'progress':
        showLoading(msg.message || 'Loading...');
        break;
      case 'history':
        historyEntries = msg.entries || [];
        if (activeTab === 'history') {
          renderHistory();
        }
        break;
      case 'pypiSearchResult':
        handlePypiSearchResult(msg);
        break;
      case 'conflicts':
        allConflicts = msg.conflicts || [];
        conflictsByPkg = new Map();
        for (const c of allConflicts) {
          const norm = n => String(n).toLowerCase().replace(/[-_.]+/g, '-');
          [norm(c.package), norm(c.conflictingPackage)].forEach(key => {
            if (!conflictsByPkg.has(key)) { conflictsByPkg.set(key, []); }
            conflictsByPkg.get(key).push(c);
          });
        }
        updateConflictStat();
        if (activeTab === 'list') { renderTable(getFiltered()); }
        break;
      case 'pkgProgress':
        updateRowProgress(msg.name, msg.stage, msg.percent);
        break;
      case 'snapshots':
        snapshots = msg.snapshots || [];
        if (activeTab === 'snapshots') renderSnapshots();
        break;
    }
  });

  function updateRowProgress(pkgName, stage, percent) {
    const tr = elTableBody?.querySelector(`tr[data-pkg="${CSS.escape(pkgName)}"]`);
    if (!tr) return;
    if (percent >= 100) {
      tr.removeAttribute('data-progress');
      tr.style.removeProperty('--row-progress');
      const stageEl = tr.querySelector('.progress-stage');
      if (stageEl) stageEl.remove();
    } else {
      tr.setAttribute('data-progress', '1');
      tr.style.setProperty('--row-progress', `${percent}%`);
      // Show stage label in the actions cell
      const actGroup = tr.querySelector('.act-group');
      if (actGroup) {
        let stageEl = tr.querySelector('.progress-stage');
        if (!stageEl) {
          stageEl = document.createElement('span');
          stageEl.className = 'progress-stage';
          actGroup.appendChild(stageEl);
        }
        stageEl.textContent = stage;
      }
    }
  }

  // ── Button handlers ───────────────────────────────────────────────────────
  elRefresh.addEventListener('click', () => {
    vscode.postMessage({ type: 'refresh' });
    showLoading('Refreshing...');
  });

  if (elBtnSafeMode) {
    elBtnSafeMode.addEventListener('click', () => {
      safeMode = !safeMode;
      elBtnSafeMode.classList.toggle('active', safeMode);
      elBtnSafeMode.title = safeMode
        ? 'Safe Mode ON — major-version updates blocked'
        : 'Safe Mode: block major-version updates';
      if (activeTab === 'list') renderTable(getFiltered());
    });
  }

  const closeDetail = () => {
    elDetail.style.display = 'none';
    elOverlay.style.display = 'none';
  };
  elDetailClose.addEventListener('click', closeDetail);
  elOverlay.addEventListener('click', () => {
    closeDetail();
    hideAddPkgModal();
  });

  // ── Search / filter ───────────────────────────────────────────────────────
  function updateFilterIndicators() {
    if (elFilter)      elFilter.classList.toggle('active', elFilter.value !== 'all');
    if (elFilterGroup) elFilterGroup.classList.toggle('active', elFilterGroup.value !== 'all');
  }

  elSearch.addEventListener('input', () => renderAll());
  elFilter.addEventListener('change', () => {
    // Deactivate stat-card filter if user manually picks a status
    if (filterVuln || filterConflict || filterDrift) {
      filterVuln = false; filterConflict = false; filterDrift = false; activeStatFilter = null;
      document.querySelectorAll('.stat-card.clickable').forEach(c => c.classList.remove('selected'));
    }
    updateFilterIndicators();
    renderAll();
  });
  if (elFilterGroup) elFilterGroup.addEventListener('change', () => { updateFilterIndicators(); renderAll(); });

  // ── Stat card click-to-filter ─────────────────────────────────────────────
  document.querySelectorAll('.stat-card.clickable').forEach(card => {
    card.addEventListener('click', () => {
      const f = card.dataset.filter;
      const isActive = activeStatFilter === f;

      // Reset all stat-card selections
      document.querySelectorAll('.stat-card.clickable').forEach(c => c.classList.remove('selected'));
      filterVuln = false; filterConflict = false;

      if (isActive) {
        // Toggle off — return to "all"
        activeStatFilter = null;
        elFilter.value = 'all';
      } else {
        activeStatFilter = f;
        card.classList.add('selected');
        if (f === 'vuln')     { filterVuln = true;     elFilter.value = 'all'; }
        else if (f === 'conflict') { filterConflict = true; elFilter.value = 'all'; }
        else                  { elFilter.value = f; }
      }
      updateFilterIndicators();
      renderAll();
    });
  });

  // ── Column-header sort ────────────────────────────────────────────────────
  document.querySelectorAll('th[data-col]').forEach(th => {
    th.querySelector('.th-inner').addEventListener('click', () => {
      const col = th.dataset.col;
      if (sortCol === col) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortCol = col;
        sortDir = 'asc';
      }
      updateSortHeaders();
      renderAll();
    });
  });

  function updateSortHeaders() {
    document.querySelectorAll('th[data-col]').forEach(th => {
      const col = th.dataset.col;
      const iconIds = ['si-name', 'si-installed', 'si-latest', 'si-status', 'si-released'];
      const icon = document.getElementById(`si-${col}`);
      th.classList.remove('sorted', 'sort-asc', 'sort-desc');
      if (icon) icon.textContent = '\u2B0D';

      if (col === sortCol) {
        th.classList.add('sorted', sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
        if (icon) icon.textContent = sortDir === 'asc' ? '▲' : '▼';
      }
    });
    // Also reset si-released explicitly if not active
    const siReleased = document.getElementById('si-released');
    if (siReleased && sortCol !== 'released') {
      siReleased.textContent = '\u2B0D';
    }
  }
  // Init header state
  updateSortHeaders();

  // ── Tab switching ─────────────────────────────────────────────────────────
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeTab = tab.dataset.tab;
      showTab(activeTab);
    });
  });

  // ── Export menu ───────────────────────────────────────────────────────────
  if (elBtnExport && elExportMenu) {
    function closeExportMenu() {
      elExportMenu.classList.remove('open');
      if (elExportWrap) elExportWrap.classList.remove('open');
    }
    function openExportMenu() {
      elExportMenu.classList.add('open');
      if (elExportWrap) elExportWrap.classList.add('open');
    }
    function toggleExportMenu() {
      elExportMenu.classList.contains('open') ? closeExportMenu() : openExportMenu();
    }

    elBtnExport.addEventListener('click', e => {
      e.stopPropagation();
      toggleExportMenu();
    });

    // Close when clicking anywhere outside the export wrapper
    document.addEventListener('click', e => {
      if (elExportWrap && !elExportWrap.contains(e.target)) {
        closeExportMenu();
      }
    });

    document.querySelectorAll('.export-item').forEach(item => {
      item.addEventListener('click', e => {
        e.stopPropagation();
        const fmt = item.dataset.fmt;
        if (fmt) {
          vscode.postMessage({ type: 'exportReport', format: fmt });
        }
        closeExportMenu();
      });
    });
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  function showToast(msg) {
    if (!elCopyToast) return;
    elCopyToast.textContent = msg;
    elCopyToast.classList.add('show');
    setTimeout(() => elCopyToast.classList.remove('show'), 3000);
  }

  // ── Welcome Tour ──────────────────────────────────────────────────────────
  const TOUR_STEPS = [
    { target: '#stats-bar',           title: 'Package Stats',      text: 'Click any card to instantly filter the list by status — updates, vulnerabilities, or conflicts.' },
    { target: '#btn-add-pkg',         title: 'Add Package',        text: 'Search PyPI and install a new package into your environment in one click.' },
    { target: '[data-tab="graph"]',   title: 'Dependency Graph',   text: 'Visualize your full dependency tree. Click any node to expand or view package details.' },
    { target: '[data-tab="licenses"]',title: 'License Compliance', text: 'See all licenses grouped by risk level — flagging GPL/AGPL packages for commercial projects.' },
  ];
  let tourStep = 0;

  function startTour() {
    if (localStorage.getItem('tourShown')) return;
    tourStep = 0;
    showTourStep();
  }

  function showTourStep() {
    const backdrop = document.getElementById('tour-backdrop');
    const tooltip  = document.getElementById('tour-tooltip');
    if (!backdrop || !tooltip) return;

    if (tourStep >= TOUR_STEPS.length) {
      endTour();
      return;
    }

    const step = TOUR_STEPS[tourStep];
    const target = document.querySelector(step.target);

    document.getElementById('tour-step-label').textContent = `Step ${tourStep + 1} of ${TOUR_STEPS.length}`;
    document.getElementById('tour-title').textContent = step.title;
    document.getElementById('tour-text').textContent  = step.text;
    document.getElementById('tour-next').textContent  = tourStep === TOUR_STEPS.length - 1 ? '✓ Done' : 'Next →';

    backdrop.classList.add('active');
    tooltip.classList.add('active');

    if (target) {
      const rect = target.getBoundingClientRect();
      const ttW = 260, ttH = 160;
      let top  = rect.bottom + 10;
      let left = rect.left;
      if (left + ttW > window.innerWidth - 10)  left = window.innerWidth - ttW - 10;
      if (top  + ttH > window.innerHeight - 10) top  = rect.top - ttH - 10;
      tooltip.style.top  = `${Math.max(8, top)}px`;
      tooltip.style.left = `${Math.max(8, left)}px`;
    } else {
      tooltip.style.top  = '50%';
      tooltip.style.left = '50%';
      tooltip.style.transform = 'translate(-50%,-50%)';
    }
  }

  function endTour() {
    document.getElementById('tour-backdrop')?.classList.remove('active');
    document.getElementById('tour-tooltip')?.classList.remove('active');
    localStorage.setItem('tourShown', '1');
  }

  document.getElementById('tour-next')?.addEventListener('click', () => {
    tourStep++;
    showTourStep();
  });
  document.getElementById('tour-skip')?.addEventListener('click', endTour);

  // ── Bulk bar ──────────────────────────────────────────────────────────────
  function updateBulkBar() {
    if (!elBulkBar) return;
    if (selectedPackages.size > 0) {
      elBulkBar.classList.add('visible');
      if (elBulkCount) elBulkCount.textContent = `${selectedPackages.size} selected`;
    } else {
      elBulkBar.classList.remove('visible');
    }
    if (elCheckAll) {
      const filtered = getFiltered();
      elCheckAll.checked = filtered.length > 0 && filtered.every(p => selectedPackages.has(p.name));
      elCheckAll.indeterminate = selectedPackages.size > 0 && !elCheckAll.checked;
    }
  }

  if (elBulkUpdate) {
    elBulkUpdate.addEventListener('click', () => {
      const names = [...selectedPackages].filter(name => {
        const pkg = allPackages.find(p => p.name === name);
        return pkg && pkg.status === 'update-available';
      });
      if (names.length) { vscode.postMessage({ type: 'bulkUpdate', names }); }
      selectedPackages.clear();
      updateBulkBar();
      renderAll();
    });
  }
  if (elBulkDeselect) {
    elBulkDeselect.addEventListener('click', () => {
      selectedPackages.clear();
      updateBulkBar();
      renderAll();
    });
  }
  if (elCheckAll) {
    elCheckAll.addEventListener('change', () => {
      const filtered = getFiltered();
      if (elCheckAll.checked) {
        filtered.forEach(p => selectedPackages.add(p.name));
      } else {
        filtered.forEach(p => selectedPackages.delete(p.name));
      }
      renderAll();
      updateBulkBar();
    });
  }

  // ── Add Package modal ─────────────────────────────────────────────────────
  function resetAddPkgResult() {
    elAddPkgResult.className = '';
    elAddPkgResult.innerHTML = '<span>Type a package name and press <strong>Search</strong> or Enter.</span>';
    elAddPkgInstall.disabled = true;
    elAddPkgInstall.classList.remove('is-installed');
    elAddPkgInstall.innerHTML = '&#x2B07;&nbsp;Install';
  }

  function showAlreadyInstalled(pkg) {
    elAddPkgResult.className = 'has-result is-installed';
    const needsUpdate = pkg.latestVersion && pkg.installedVersion && pkg.latestVersion !== pkg.installedVersion && pkg.status === 'update-available';
    elAddPkgResult.innerHTML = `
      <div class="apkg-row">
        <span class="apkg-name">${esc(pkg.name)}</span>
        <span class="apkg-ver">v${esc(pkg.installedVersion)}</span>
        <span class="apkg-installed-badge">&#x2713; Already installed</span>
      </div>
      <span class="apkg-installed-hint">${
        needsUpdate
          ? `A newer version <strong>v${esc(pkg.latestVersion)}</strong> is available. Use the <em>Update</em> button in the Package List tab.`
          : `This package is already installed and up to date in your environment.`
      }</span>
    `;
    elAddPkgInstall.disabled = true;
    elAddPkgInstall.classList.add('is-installed');
    elAddPkgInstall.innerHTML = '&#x2713; Installed';
    pendingInstallName = '';
    pendingInstallVersion = '';
  }

  function showAddPkgModal() {
    elAddPkgModal.classList.add('open');
    elAddPkgInput.value = '';
    resetAddPkgResult();
    pendingInstallName = '';
    pendingInstallVersion = '';
    setTimeout(() => elAddPkgInput.focus(), 80);
  }

  function hideAddPkgModal() {
    elAddPkgModal.classList.remove('open');
  }

  if (elBtnAddPkg) elBtnAddPkg.addEventListener('click', showAddPkgModal);
  if (elAddPkgClose)  elAddPkgClose.addEventListener('click', hideAddPkgModal);
  if (elAddPkgCancel) elAddPkgCancel.addEventListener('click', hideAddPkgModal);

  // Close if clicking the backdrop (not the dialog)
  if (elAddPkgModal) {
    elAddPkgModal.addEventListener('click', e => {
      if (e.target === elAddPkgModal) hideAddPkgModal();
    });
  }

  // Live installed-check while typing
  if (elAddPkgInput) {
    elAddPkgInput.addEventListener('input', () => {
      const query = elAddPkgInput.value.trim();
      if (!query) { resetAddPkgResult(); return; }
      const norm = query.toLowerCase().replace(/[-_.]+/g, '-');
      const existing = allPackages.find(p =>
        p.name.toLowerCase().replace(/[-_.]+/g, '-') === norm &&
        p.installedVersion && p.status !== 'not-installed'
      );
      if (existing) {
        showAlreadyInstalled(existing);
      } else {
        resetAddPkgResult();
      }
    });

    elAddPkgInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') elAddPkgSearch && elAddPkgSearch.click();
    });
  }

  if (elAddPkgSearch) {
    elAddPkgSearch.addEventListener('click', () => {
      const query = elAddPkgInput.value.trim();
      if (!query) return;
      // If already known as installed, don't search — badge already shown
      const norm = query.toLowerCase().replace(/[-_.]+/g, '-');
      const existing = allPackages.find(p =>
        p.name.toLowerCase().replace(/[-_.]+/g, '-') === norm &&
        p.installedVersion && p.status !== 'not-installed'
      );
      if (existing) { showAlreadyInstalled(existing); return; }
      elAddPkgResult.className = '';
      elAddPkgResult.innerHTML = '<span style="opacity:.6">Searching PyPI…</span>';
      elAddPkgInstall.disabled = true;
      elAddPkgInstall.classList.remove('is-installed');
      elAddPkgInstall.innerHTML = '&#x2B07;&nbsp;Install';
      vscode.postMessage({ type: 'searchPypi', query });
    });
  }

  if (elAddPkgInstall) {
    elAddPkgInstall.addEventListener('click', () => {
      if (!pendingInstallName) return;
      elAddPkgInstall.disabled = true;
      elAddPkgInstall.innerHTML = '<span class="btn-spinner"></span>Installing…';
      vscode.postMessage({ type: 'installNew', name: pendingInstallName, version: pendingInstallVersion || undefined });
      hideAddPkgModal();
    });
  }

  function handlePypiSearchResult(msg) {
    if (!msg.found) {
      elAddPkgResult.className = '';
      elAddPkgResult.innerHTML = '<span class="apkg-error">&#x26A0;&nbsp; Package not found on PyPI. Check the spelling and try again.</span>';
      return;
    }

    // Check if already installed in workspace
    const normSearch = msg.name.toLowerCase().replace(/[-_.]+/g, '-');
    const existing = allPackages.find(p =>
      p.name.toLowerCase().replace(/[-_.]+/g, '-') === normSearch &&
      p.installedVersion &&
      p.status !== 'not-installed'
    );

    if (existing) {
      showAlreadyInstalled(existing);
    } else {
      pendingInstallName = msg.name;
      pendingInstallVersion = msg.version || '';
      elAddPkgResult.className = 'has-result';
      elAddPkgResult.innerHTML = `
        <div class="apkg-row">
          <span class="apkg-name">${esc(msg.name)}</span>
          ${msg.version ? `<span class="apkg-ver">v${esc(msg.version)}</span>` : ''}
        </div>
        ${msg.summary ? `<span class="apkg-sum">${esc(msg.summary.slice(0, 200))}${msg.summary.length > 200 ? '…' : ''}</span>` : ''}
      `;
      elAddPkgInstall.disabled = false;
      elAddPkgInstall.classList.remove('is-installed');
      elAddPkgInstall.innerHTML = '&#x2B07;&nbsp;Install';
    }
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    // Escape → close detail panel and add-pkg modal
    if (e.key === 'Escape') {
      closeDetail();
      hideAddPkgModal();
      return;
    }
    // R → refresh (not when typing in input)
    if (e.key === 'r' && !isInputFocused()) {
      vscode.postMessage({ type: 'refresh' });
      showLoading('Refreshing…');
      return;
    }
    // / or Ctrl+F → focus search
    if ((e.key === '/' || (e.ctrlKey && e.key === 'f')) && !isInputFocused()) {
      e.preventDefault();
      elSearch.focus();
      return;
    }
  });

  function isInputFocused() {
    const tag = document.activeElement && document.activeElement.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  // ── Utility functions ─────────────────────────────────────────────────────
  function formatDownloads(n) {
    if (!n || n <= 0) return '';
    if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
    if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
    return String(n);
  }

  function isMajorJump(installed, latest) {
    if (!installed || !latest) return false;
    const maj = v => parseInt((v || '0').replace(/[^\d.].*/, '').split('.')[0], 10) || 0;
    return maj(latest) > maj(installed);
  }

  function computeDrift(packages) {
    return packages.filter(pkg => {
      if (!pkg.specifiedVersion || !pkg.installedVersion) return false;
      const m = pkg.specifiedVersion.match(/[=!<>~^]+\s*([\d][^\s,;]*)/);
      if (!m) return false;
      const pinned = m[1];
      return pinned !== pkg.installedVersion;
    });
  }

  function healthScore(pkg) {
    let s = 100;
    if (pkg.vulnerabilities && pkg.vulnerabilities.length > 0) s -= 30;
    if (pkg.status === 'update-available') s -= 20;
    if (pkg.status === 'unknown' || pkg.status === 'not-installed') s -= 10;
    if (pkg.releaseDate) {
      const days = (Date.now() - new Date(pkg.releaseDate + 'T00:00:00').getTime()) / 86400000;
      if (days > 730) s -= 20;
      else if (days > 365) s -= 10;
    }
    return Math.max(0, Math.min(100, s));
  }

  function healthRingHtml(pkg) {
    const score = healthScore(pkg);
    const r = 9, circ = 2 * Math.PI * r;
    const offset = circ * (1 - score / 100);
    const cls = score >= 80 ? 'health-score-good' : score >= 50 ? 'health-score-warn' : 'health-score-bad';
    return `<svg class="health-ring ${cls}" width="24" height="24" viewBox="0 0 24 24" title="Health: ${score}/100">
      <circle class="track" cx="12" cy="12" r="${r}"/>
      <circle class="fill" cx="12" cy="12" r="${r}"
        stroke-dasharray="${circ.toFixed(2)}"
        stroke-dashoffset="${offset.toFixed(2)}"
        transform="rotate(-90 12 12)"/>
      <text class="health-score-text" x="12" y="12">${score}</text>
    </svg>`;
  }

  function sizeTintClass(bytes) {
    if (!bytes || bytes <= 0) return '';
    const mb = bytes / (1024 * 1024);
    if (mb > 50)  return 'size-xl';
    if (mb > 10)  return 'size-lg';
    if (mb > 1)   return 'size-md';
    return '';
  }

  function getLicenseRisk(license) {
    if (!license) return 'unknown';
    const l = license.toUpperCase();
    if (/\bAGPL\b/.test(l) || /\bGPL[-\s]?[23]/.test(l)) return 'restricted';
    if (/\bLGPL\b/.test(l) || /\bMPL\b/.test(l) || /\bEUPL\b/.test(l)) return 'caution';
    if (/\bMIT\b|\bBSD\b|\bAPACHE\b|\bISC\b|\bUNLICENSE\b|\bPSF\b|\bWTFPL\b/.test(l)) return 'safe';
    return 'unknown';
  }

  // ── Banner helpers ────────────────────────────────────────────────────────
  function updateVulnBanner(packages) {
    if (!elVulnBanner) return;
    const count = packages.filter(p => p.vulnerabilities && p.vulnerabilities.length > 0).length;
    if (count > 0 && !vulnBannerDismissed) {
      const el = document.getElementById('vuln-banner-count');
      if (el) el.textContent = count;
      elVulnBanner.classList.add('visible');
    } else {
      elVulnBanner.classList.remove('visible');
    }
  }

  function updateDriftBanner(packages) {
    if (!elDriftBanner) return;
    const drifted = computeDrift(packages);
    if (drifted.length > 0 && !driftBannerDismissed) {
      const el = document.getElementById('drift-banner-count');
      if (el) el.textContent = drifted.length;
      elDriftBanner.classList.add('visible');
    } else {
      elDriftBanner.classList.remove('visible');
    }
  }

  // Banner button wiring
  document.getElementById('vuln-banner-jump')?.addEventListener('click', () => {
    filterVuln = true; filterConflict = false; filterDrift = false; activeStatFilter = 'vuln';
    document.querySelectorAll('.stat-card.clickable').forEach(c => c.classList.remove('selected'));
    document.getElementById('stat-vuln-card')?.classList.add('selected');
    renderAll();
  });
  document.getElementById('vuln-banner-dismiss')?.addEventListener('click', () => {
    vulnBannerDismissed = true;
    elVulnBanner?.classList.remove('visible');
  });
  document.getElementById('drift-banner-view')?.addEventListener('click', () => {
    filterDrift = true; filterVuln = false; filterConflict = false;
    activeStatFilter = null;
    document.querySelectorAll('.stat-card.clickable').forEach(c => c.classList.remove('selected'));
    renderAll();
  });
  document.getElementById('drift-banner-dismiss')?.addEventListener('click', () => {
    driftBannerDismissed = true;
    elDriftBanner?.classList.remove('visible');
  });

  // ── Render orchestrator ───────────────────────────────────────────────────
  function renderAll() {
    const filtered = getFiltered();

    updateStats(allPackages);
    updateUnusedBadge(allPackages);

    if (allPackages.length === 0) {
      showEmpty();
      return;
    }

    elEmpty.style.display = 'none';
    showTab(activeTab, filtered);
  }

  const STATUS_ORDER = {
    'update-available': 0,
    'not-installed': 1,
    'unknown': 2,
    'up-to-date': 3,
  };

  function getFiltered() {
    const query  = elSearch.value.toLowerCase();
    const status = elFilter.value;
    const group  = elFilterGroup ? elFilterGroup.value : 'all';

    const filtered = allPackages.filter(pkg => {
      const matchSearch = !query
        || pkg.name.toLowerCase().includes(query)
        || (pkg.summary || '').toLowerCase().includes(query);
      const matchStatus = status === 'all' || pkg.status === status;
      const matchGroup  = group === 'all' || (pkg.group || 'main') === group;
      const matchVuln   = !filterVuln || (pkg.vulnerabilities && pkg.vulnerabilities.length > 0);
      const normPkg     = pkg.name.toLowerCase().replace(/[-_.]+/g, '-');
      const matchConflict = !filterConflict || conflictsByPkg.has(normPkg);
      const matchDrift    = !filterDrift    || computeDrift([pkg]).length > 0;
      return matchSearch && matchStatus && matchGroup && matchVuln && matchConflict && matchDrift;
    });

    filtered.sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'installed':
          cmp = (a.installedVersion || '').localeCompare(b.installedVersion || '');
          break;
        case 'latest':
          cmp = (a.latestVersion || '').localeCompare(b.latestVersion || '');
          break;
        case 'status': {
          const sa = STATUS_ORDER[a.status] ?? 99;
          const sb = STATUS_ORDER[b.status] ?? 99;
          cmp = sa !== sb ? sa - sb : a.name.localeCompare(b.name);
          break;
        }
        case 'released':
          cmp = (a.releaseDate || '').localeCompare(b.releaseDate || '');
          break;
        default:
          cmp = a.name.localeCompare(b.name);
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return filtered;
  }

  // ── License Compliance ────────────────────────────────────────────────────
  function renderLicenses() {
    const summaryEl = document.getElementById('license-summary');
    const groupsEl  = document.getElementById('license-groups');
    if (!summaryEl || !groupsEl) return;

    const RISKS = ['restricted', 'caution', 'safe', 'unknown'];
    const RISK_LABELS = { restricted: '🔴 Restricted (GPL/AGPL)', caution: '⚠️ Caution (LGPL/MPL)', safe: '✅ Permissive', unknown: '❓ Unknown' };
    const grouped = { restricted: [], caution: [], safe: [], unknown: [] };

    allPackages.forEach(pkg => {
      const risk = getLicenseRisk(pkg.license);
      grouped[risk].push(pkg);
    });

    // Summary cards
    summaryEl.innerHTML = RISKS.map(r => {
      const count = grouped[r].length;
      if (!count) return '';
      return `<span class="stat-card ${r === 'safe' ? 'ok' : r === 'caution' ? 'update' : r === 'restricted' ? 'vuln' : 'unknown'}">`
        + `<span class="stat-num">${count}</span><span>${RISK_LABELS[r]}</span></span>`;
    }).join('');

    // Grouped lists
    groupsEl.innerHTML = RISKS.map(r => {
      const pkgs = grouped[r];
      if (!pkgs.length) return '';
      return `<div class="license-group">
        <div class="license-group-header">
          <span class="license-risk-badge license-risk-${r}">${RISK_LABELS[r]}</span>
          <span style="color:var(--vscode-descriptionForeground);font-weight:400">${pkgs.length} package${pkgs.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="license-pkg-list">
          ${pkgs.map(p => `<span class="license-pkg-chip" data-name="${esc(p.name)}">
            <span class="lpc-name">${esc(p.name)}</span>
            <span class="lpc-lic">${esc(p.license || 'Unknown')}</span>
          </span>`).join('')}
        </div>
      </div>`;
    }).join('');

    // Click chip → open detail panel
    groupsEl.querySelectorAll('.license-pkg-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const pkg = allPackages.find(p => p.name === chip.dataset.name);
        if (pkg) showDetail(pkg);
      });
    });
  }

  // ── Snapshots ─────────────────────────────────────────────────────────────
  function renderSnapshots() {
    const listEl  = document.getElementById('snapshots-list');
    const emptyEl = document.getElementById('snapshots-empty');
    if (!listEl) return;

    if (!snapshots.length) {
      if (emptyEl) emptyEl.style.display = '';
      listEl.innerHTML = '';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    listEl.innerHTML = snapshots.map(s => {
      const pkgCount = Object.keys(s.packages || {}).length;
      const date = new Date(s.createdAt).toLocaleString();
      return `<div class="snapshot-card">
        <span class="snapshot-icon">&#x1F4F8;</span>
        <div class="snapshot-info">
          <div class="snapshot-name">${esc(s.name)}</div>
          <div class="snapshot-meta">${pkgCount} packages &nbsp;·&nbsp; ${esc(date)}</div>
        </div>
        <div class="snapshot-actions">
          <button class="snap-btn snap-restore" data-id="${esc(s.id)}" title="Restore to this snapshot">&#x21A9; Restore</button>
          <button class="snap-btn danger snap-delete" data-id="${esc(s.id)}" title="Delete snapshot">&#x1F5D1;</button>
        </div>
      </div>`;
    }).join('');

    listEl.querySelectorAll('.snap-restore').forEach(btn => {
      btn.addEventListener('click', () => vscode.postMessage({ type: 'restoreSnapshot', id: btn.dataset.id }));
    });
    listEl.querySelectorAll('.snap-delete').forEach(btn => {
      btn.addEventListener('click', () => vscode.postMessage({ type: 'deleteSnapshot', id: btn.dataset.id }));
    });
  }

  document.getElementById('btn-take-snapshot')?.addEventListener('click', () => {
    const name = `Snapshot ${new Date().toLocaleString()}`;
    vscode.postMessage({ type: 'takeSnapshot', name });
  });

  function showTab(tab, filtered) {
    filtered = filtered || getFiltered();
    elGraph.style.display   = 'none';
    elList.style.display    = 'none';
    elUnused.style.display  = 'none';
    if (elHistory)       elHistory.style.display       = 'none';
    if (elViewLicenses)  elViewLicenses.style.display  = 'none';
    if (elViewSnapshots) elViewSnapshots.style.display = 'none';

    if (tab === 'graph') {
      elGraph.style.display = 'block';
      renderGraph(filtered);
    } else if (tab === 'unused') {
      elUnused.style.display = 'flex';
      elUnused.style.flexDirection = 'column';
      renderUnused();
    } else if (tab === 'history') {
      if (elHistory) elHistory.style.display = 'flex';
      renderHistory();
    } else if (tab === 'licenses') {
      if (elViewLicenses) { elViewLicenses.style.display = 'flex'; elViewLicenses.style.flexDirection = 'column'; }
      renderLicenses();
    } else if (tab === 'snapshots') {
      if (elViewSnapshots) { elViewSnapshots.style.display = 'flex'; elViewSnapshots.style.flexDirection = 'column'; }
      vscode.postMessage({ type: 'listSnapshots' });
      renderSnapshots();
    } else {
      elList.style.display = 'block';
      renderTable(filtered);
    }
  }

  // ── Unused tab badge ──────────────────────────────────────────────────────
  function updateUnusedBadge(packages) {
    const count = packages.filter(p => !p.isUsed).length;
    const tab = document.querySelector('.tab[data-tab="unused"]');
    if (tab) {
      tab.textContent = count > 0 ? `Unused Packages (${count})` : 'Unused Packages';
    }
  }

  // ── Conflict stat card ────────────────────────────────────────────────────
  function updateConflictStat() {
    const card = document.getElementById('stat-conflict-card');
    const num  = document.getElementById('stat-conflict');
    if (num)  { num.textContent = allConflicts.length; }
    if (card) { card.style.display = allConflicts.length > 0 ? '' : 'none'; }
  }

  // ── Stats Bar ─────────────────────────────────────────────────────────────
  function updateStats(packages) {
    const ok       = packages.filter(p => p.status === 'up-to-date').length;
    const updates  = packages.filter(p => p.status === 'update-available').length;
    const unknown  = packages.filter(p => p.status === 'unknown' || p.status === 'not-installed').length;
    const vulnPkgs = packages.filter(p => p.vulnerabilities && p.vulnerabilities.length > 0).length;

    elStatOk.textContent      = ok;
    elStatUpdate.textContent  = updates;
    elStatUnknown.textContent = unknown;

    if (elStatVuln) elStatVuln.textContent = vulnPkgs;
    if (elStatVulnCard) elStatVulnCard.style.display = vulnPkgs > 0 ? '' : 'none';

    updateVulnBanner(packages);
    updateDriftBanner(packages);

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
  }

  // ── D3.js Graph ───────────────────────────────────────────────────────────
  // ── Graph zoom instance (module-level so toolbar buttons can access it) ───
  let _graphZoom   = null;
  let _graphSvg    = null;
  let _graphFitFn  = null;

  function renderGraph(packages) {
    const canvas = document.getElementById('graph-canvas');
    if (!canvas) return;
    canvas.innerHTML = '';
    _graphZoom = null; _graphSvg = null; _graphFitFn = null;

    if (typeof d3 === 'undefined') {
      canvas.innerHTML = '<div style="padding:40px;text-align:center;color:var(--vscode-descriptionForeground)">Dependency graph unavailable: could not load the d3 library. Check your internet connection and reload.</div>';
      return;
    }

    if (!packages.length) {
      canvas.innerHTML = '<div style="padding:40px;text-align:center;color:var(--vscode-descriptionForeground)">No packages to display.</div>';
      return;
    }

    try {

    // ── Build hierarchy ──────────────────────────────────────────────────
    const treeData = {
      name: 'Project',
      status: 'root',
      children: packages.map(pkg => ({
        name: pkg.name,
        status: pkg.vulnerabilities && pkg.vulnerabilities.length ? 'vulnerable' : (pkg.status || 'unknown'),
        version: pkg.installedVersion || '',
        pkg,
        children: (pkg.requires || []).filter(r => r).map(req => {
          const dep = allPackages.find(p => p.name.toLowerCase() === req.toLowerCase());
          return {
            name: req,
            status: dep ? (dep.vulnerabilities && dep.vulnerabilities.length ? 'vulnerable' : dep.status) : 'unknown',
            version: dep ? (dep.installedVersion || '') : '',
            pkg: dep || null,
          };
        }),
      })),
    };

    // ── Dimensions ───────────────────────────────────────────────────────
    const W = canvas.clientWidth  || 860;
    const H = canvas.clientHeight || 520;

    // Count visible leaves to ensure enough vertical room
    const tempRoot = d3.hierarchy(treeData);
    // Collapse depth > 1 by default
    tempRoot.descendants().forEach(d => {
      if (d.depth > 1 && d.children) {
        d._children = d.children;
        d.children  = null;
      }
    });
    const visibleLeaves = Math.max(1, tempRoot.leaves().length);
    const NODE_SEP   = 26;   // px between sibling nodes
    const treeHeight = Math.max(H - 60, visibleLeaves * NODE_SEP);
    const DEPTH_GAP  = Math.min(220, Math.max(160, (W - 120) / 3)); // px per tree level

    // ── SVG setup ────────────────────────────────────────────────────────
    const svg = d3.select('#graph-canvas')
      .append('svg')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMidYMid meet');

    const g = svg.append('g');

    const zoom = d3.zoom()
      .scaleExtent([0.08, 4])
      .on('zoom', ev => g.attr('transform', ev.transform));
    svg.call(zoom).on('dblclick.zoom', null);
    _graphZoom = zoom;
    _graphSvg  = svg;

    // ── Hierarchy + layout ───────────────────────────────────────────────
    const root = d3.hierarchy(treeData);
    root.descendants().forEach(d => {
      if (d.depth > 1 && d.children) {
        d._children = d.children;
        d.children  = null;
      }
    });

    function fitView() {
      try {
        const box = g.node().getBBox();
        if (!box || box.width === 0) return;
        const pad = 40;
        const scale = Math.min(0.95, (W - pad * 2) / box.width, (H - pad * 2) / box.height);
        const tx = W / 2 - (box.x + box.width  / 2) * scale;
        const ty = H / 2 - (box.y + box.height / 2) * scale;
        svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
      } catch (_) {}
    }
    _graphFitFn = fitView;

    function update() {
      const layout = d3.tree()
        .nodeSize([NODE_SEP, DEPTH_GAP])
        .separation((a, b) => (a.parent === b.parent ? 1 : 1.4));
      layout(root);

      const nodes = root.descendants();
      const links = root.links();

      // ── Links ──────────────────────────────────────────────────────────
      const linkSel = g.selectAll('.link')
        .data(links, d => d.target.id || (d.target.id = Math.random()));

      linkSel.enter().append('path')
        .attr('class', 'link')
        .merge(linkSel)
        .attr('d', d3.linkHorizontal().x(d => d.y).y(d => d.x));

      linkSel.exit().remove();

      // ── Nodes ──────────────────────────────────────────────────────────
      const nodeSel = g.selectAll('.node')
        .data(nodes, d => d.data.name + '-' + d.depth);

      const nodeEnter = nodeSel.enter().append('g')
        .attr('transform', d => `translate(${d.y},${d.x})`);

      nodeEnter.append('circle')
        .attr('r', d => d.depth === 0 ? 12 : 7);

      nodeEnter.append('text')
        .attr('dy', '0.32em')
        .attr('x', d => d.depth === 0 ? 18 : ((d.children || d._children) ? -12 : 12))
        .style('text-anchor', d => d.depth === 0 ? 'start' : ((d.children || d._children) ? 'end' : 'start'))
        .text(d => {
          const v = d.data.version ? ` (${d.data.version})` : '';
          return d.data.name + v;
        });

      // Expand/collapse indicator dot for collapsed nodes
      nodeEnter.filter(d => d._children)
        .append('circle')
        .attr('class', 'expand-dot')
        .attr('r', 3)
        .attr('cx', 10).attr('cy', -10)
        .style('fill', 'var(--c-update)');

      const nodeMerge = nodeSel.merge(nodeEnter);

      nodeMerge
        .attr('class', d => {
          const cls = [
            'node',
            d.data.status || 'unknown',
            d.depth === 0 ? 'root' : '',
            d._children ? 'collapsed' : '',
          ].filter(Boolean).join(' ');
          return cls;
        })
        .attr('transform', d => `translate(${d.y},${d.x})`);

      // Update text anchor on merge (children may have changed)
      nodeMerge.select('text')
        .attr('x', d => d.depth === 0 ? 18 : ((d.children || d._children) ? -12 : 12))
        .style('text-anchor', d => d.depth === 0 ? 'start' : ((d.children || d._children) ? 'end' : 'start'));

      // Update expand-dot visibility
      nodeMerge.selectAll('.expand-dot').remove();
      nodeMerge.filter(d => d._children && d.depth > 0)
        .append('circle')
        .attr('class', 'expand-dot')
        .attr('r', 3).attr('cx', 10).attr('cy', -9)
        .style('fill', 'var(--c-update)').style('stroke', 'none');

      nodeMerge.on('click', (event, d) => {
        event.stopPropagation();
        if (d.children) {
          d._children = d.children;
          d.children  = null;
        } else if (d._children) {
          d.children  = d._children;
          d._children = null;
        }
        if (d.data.pkg) showDetail(d.data.pkg);
        update();
      });

      nodeSel.exit().remove();
    }

    update();

    // Auto-fit after first render (small delay for layout to settle)
    setTimeout(fitView, 60);

    // ── Legend (absolute overlay) ────────────────────────────────────────
    const legend = document.createElement('div');
    legend.className = 'graph-legend';
    legend.innerHTML = `
      <div style="font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
        color:var(--vscode-descriptionForeground);margin-bottom:4px;">Legend</div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--c-ok)"></div> Up to date</div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--c-update)"></div> Update available</div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--c-vuln)"></div> Vulnerable</div>
      <div class="legend-item"><div class="legend-dot" style="background:var(--c-unknown)"></div> Unknown</div>
      <div class="legend-item"><div class="legend-dot" style="border:2px dashed var(--c-missing);background:none"></div> Not installed</div>
      <div style="margin-top:6px;color:var(--vscode-descriptionForeground);font-size:10px;">
        ● orange dot = has sub-deps<br>Click node to expand
      </div>
    `;
    canvas.style.position = 'relative';
    canvas.appendChild(legend);
    } catch (err) {
      console.error('renderGraph error:', err);
      canvas.innerHTML = '<div style="padding:40px;text-align:center;color:var(--vscode-errorForeground)">Error rendering dependency graph. Please refresh.</div>';
    }
  }

  // ── Graph toolbar buttons ─────────────────────────────────────────────────
  document.getElementById('graph-fit')?.addEventListener('click', () => {
    if (_graphFitFn) _graphFitFn();
  });
  document.getElementById('graph-zoom-in')?.addEventListener('click', () => {
    if (_graphSvg && _graphZoom) _graphSvg.call(_graphZoom.scaleBy, 1.4);
  });
  document.getElementById('graph-zoom-out')?.addEventListener('click', () => {
    if (_graphSvg && _graphZoom) _graphSvg.call(_graphZoom.scaleBy, 1 / 1.4);
  });

  // ── Package Table ─────────────────────────────────────────────────────────
  function formatReleaseDate(dateStr) {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  function renderTable(packages) {
    try {
    // ── Result count bar ─────────────────────────────────────────────────────
    const elResultCount = document.getElementById('result-count');
    if (elResultCount) {
      const isFiltered = packages.length < allPackages.length;
      if (!isFiltered) {
        elResultCount.innerHTML = '';
      } else {
        const clearBtn = `<span id="result-count-clear" title="Clear all filters">✕ Clear</span>`;
        elResultCount.innerHTML =
          `<span class="result-count-filter-active">Showing ${packages.length} of ${allPackages.length} packages</span>${clearBtn}`;
        document.getElementById('result-count-clear')?.addEventListener('click', () => {
          elSearch.value = '';
          elFilter.value = 'all';
          if (elFilterGroup) elFilterGroup.value = 'all';
          filterVuln = false; filterConflict = false; filterDrift = false; activeStatFilter = null;
          document.querySelectorAll('.stat-card.clickable').forEach(c => c.classList.remove('selected'));
          updateFilterIndicators();
          renderAll();
        });
      }
    }

    elTableBody.innerHTML = '';

    if (!packages.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="7" style="text-align:center;padding:20px;color:var(--vscode-descriptionForeground)">No packages match your filter.</td>`;
      elTableBody.appendChild(tr);
      return;
    }

    packages.forEach((pkg, i) => {
      const tr = document.createElement('tr');

      const hasUpdate      = pkg.status === 'update-available';
      const notInstalled   = pkg.status === 'not-installed';
      const hasHistory     = pkg.allVersions && pkg.allVersions.length > 1;
      const hasVuln        = pkg.vulnerabilities && pkg.vulnerabilities.length > 0;
      const grp            = pkg.group || 'main';
      const isSelected     = selectedPackages.has(pkg.name);
      const normPkgName    = pkg.name.toLowerCase().replace(/[-_.]+/g, '-');
      const hasConflict    = conflictsByPkg.has(normPkgName);

      // Row accent + staggered animation
      tr.dataset.pkg = pkg.name;
      tr.classList.add(`row-${pkg.status || 'unknown'}`);
      if (hasVuln)     tr.classList.add('row-vulnerable');
      if (hasConflict) tr.classList.add('row-conflict');
      const sizeClass = sizeTintClass(pkg.installSize);
      if (sizeClass)   tr.classList.add(sizeClass);
      if (pkg.installSize) tr.title = `Install size: ${(pkg.installSize / 1024 / 1024).toFixed(1)} MB`;
      tr.style.animationDelay = `${i * 18}ms`;

      const latestDisplay = hasUpdate
        ? `<span class="ver ver-latest" data-copy="${esc(pkg.latestVersion)}" title="Click to copy" style="cursor:pointer">${esc(pkg.latestVersion)}<span class="copy-hint">⧉</span></span>`
        : `<span class="ver">${esc(pkg.latestVersion || '—')}</span>`;

      const groupTag = grp !== 'main'
        ? `<span class="group-tag ${esc(grp)}">${esc(grp)}</span>`
        : '';

      const releaseDateDisplay = formatReleaseDate(pkg.releaseDate);

      tr.innerHTML = `
        <td class="col-check"><input type="checkbox" class="pkg-check" data-name="${esc(pkg.name)}" ${isSelected ? 'checked' : ''}></td>
        <td>
          <div class="pkg-name">
            <span class="pkg-name-link" data-name="${esc(pkg.name)}">${esc(pkg.name)}</span>
            <span class="pkg-ext-link" data-pypi="${esc(pkg.name)}" title="Open on PyPI">&#x2197;</span>
            ${pkg.source ? `<span class="pkg-source">${esc(pkg.source)}</span>` : ''}
            ${groupTag}
            ${hasVuln     ? `<span class="inline-tag cve" title="${pkg.vulnerabilities.length} vulnerabilit${pkg.vulnerabilities.length !== 1 ? 'ies' : 'y'}">&#x1F534; CVE</span>` : ''}
            ${hasConflict ? `<span class="inline-tag conflict" title="${conflictsByPkg.get(normPkgName).length} dependency conflict(s)">&#x26A1; conflict</span>` : ''}
            ${!pkg.isUsed ? `<span class="inline-tag unused" title="No import found in project">&#x2298; unused?</span>` : ''}
            ${computeDrift([pkg]).length > 0 ? `<span class="inline-tag drift" title="Installed version differs from requirements file">&#x21C4; drift</span>` : ''}
            ${pkg.weeklyDownloads > 0 ? `<span class="pkg-popularity" title="${(pkg.weeklyDownloads||0).toLocaleString()} downloads/week">&#x2193;${formatDownloads(pkg.weeklyDownloads)}/wk</span>` : ''}
          </div>
        </td>
        <td><span class="ver" data-copy="${esc(pkg.installedVersion || '')}" title="Click to copy" style="cursor:pointer">${esc(pkg.installedVersion || '—')}<span class="copy-hint">⧉</span></span></td>
        <td>${latestDisplay}</td>
        <td>${statusBadge(pkg.status)}</td>
        <td><span style="font-size:11px;color:var(--vscode-descriptionForeground)">${esc(releaseDateDisplay)}</span></td>
        <td class="col-health">${healthRingHtml(pkg)}</td>
        <td>
          <div class="act-group">
            ${hasUpdate && safeMode && isMajorJump(pkg.installedVersion, pkg.latestVersion)
                ? `<span class="inline-tag major-lock" title="Major version jump — disabled in Safe Mode">&#x1F512; Major</span>`
                : hasUpdate ? `<button class="action-btn success btn-update" data-name="${esc(pkg.name)}" title="Update to ${esc(pkg.latestVersion)}">&#x2B06; Update</button>` : ''}
            ${notInstalled ? `<button class="action-btn primary btn-install" data-name="${esc(pkg.name)}" title="Install ${esc(pkg.name)}">&#x2B07; Install</button>` : ''}
            ${hasHistory && !notInstalled ? `<button class="action-btn secondary btn-rollback" data-name="${esc(pkg.name)}" title="Rollback">&#x21A9; Rollback</button>` : ''}
            ${!pkg.isUsed && pkg.source ? `<button class="action-btn danger btn-remove-req" data-name="${esc(pkg.name)}" data-source="${esc(pkg.source)}" title="Remove from ${esc(pkg.source)}">&#x1F5D1; Remove</button>` : ''}
          </div>
        </td>
      `;

      elTableBody.appendChild(tr);
    });

    // Attach row events after insert
    elTableBody.querySelectorAll('.pkg-check').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) {
          selectedPackages.add(cb.dataset.name);
        } else {
          selectedPackages.delete(cb.dataset.name);
        }
        updateBulkBar();
      });
    });

    elTableBody.querySelectorAll('[data-copy]').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        const text = el.dataset.copy;
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => showToast('✓ Copied to clipboard')).catch(() => showToast('⚠ Copy failed'));
      });
    });

    elTableBody.querySelectorAll('.pkg-name-link').forEach(el => {
      el.addEventListener('click', () => {
        const pkg = allPackages.find(p => p.name === el.dataset.name);
        if (pkg) showDetail(pkg);
      });
    });

    // PyPI external link icon
    elTableBody.querySelectorAll('.pkg-ext-link').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        const name = el.dataset.pypi;
        if (name) {
          vscode.postMessage({ type: 'openUrl', url: 'https://pypi.org/project/' + name });
        }
      });
    });

    elTableBody.querySelectorAll('.btn-update').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-spinner"></span>Updating…';
        vscode.postMessage({ type: 'updatePackage', name: btn.dataset.name });
      });
    });

    elTableBody.querySelectorAll('.btn-install').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-spinner"></span>Installing…';
        vscode.postMessage({ type: 'updatePackage', name: btn.dataset.name });
      });
    });

    elTableBody.querySelectorAll('.btn-rollback').forEach(btn => {
      btn.addEventListener('click', () => {
        const pkg = allPackages.find(p => p.name === btn.dataset.name);
        if (!pkg) return;
        const prev = pkg.allVersions && pkg.allVersions.length > 1
          ? pkg.allVersions[1]
          : null;
        if (!prev) return;
        btn.disabled = true;
        btn.innerHTML = '<span class="btn-spinner"></span>Rolling back…';
        vscode.postMessage({ type: 'rollbackPackage', name: btn.dataset.name, version: prev });
      });
    });

    elTableBody.querySelectorAll('.btn-remove-req').forEach(btn => {
      btn.addEventListener('click', () => {
        vscode.postMessage({
          type: 'removeFromRequirements',
          name: btn.dataset.name,
          source: btn.dataset.source,
        });
      });
    });
    } catch (err) {
      console.error('renderTable error:', err);
      elTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--vscode-errorForeground)">Error rendering package list. Please refresh.</td></tr>`;
    }
  }

  // ── Unused Packages Tab ───────────────────────────────────────────────────
  function renderUnused() {
    const unused = allPackages.filter(p => !p.isUsed);
    elUnusedBody.innerHTML = '';

    // Show scan diagnostics
    const statsEl = document.getElementById('scan-stats');
    if (statsEl) {
      if (window._scanStats) {
        const { filesScanned, modulesFound, workspaceRoot } = window._scanStats;
        const rootShort = workspaceRoot
          ? workspaceRoot.replace(/\\/g, '/').split('/').slice(-2).join('/')
          : '?';
        if (filesScanned === 0) {
          statsEl.innerHTML =
            `<span style="color:var(--color-update-available)">` +
            `&#9888; <strong>0 Python (.py) files found</strong> in <code>${rootShort}</code>. ` +
            `Make sure the correct Python project folder is open (File &rarr; Open Folder), then Refresh.` +
            `</span>`;
        } else {
          statsEl.innerHTML =
            `&#128269; Scanned <strong>${filesScanned}</strong> .py file${filesScanned !== 1 ? 's' : ''} ` +
            `in <code title="${workspaceRoot}">${rootShort}</code> &mdash; ` +
            `found <strong>${modulesFound}</strong> unique import${modulesFound !== 1 ? 's' : ''}.`;
        }
      } else {
        statsEl.textContent = '';
      }
    }

    // Update tab badge
    const tab = document.querySelector('.tab[data-tab="unused"]');
    if (tab) {
      tab.textContent = unused.length > 0
        ? `Unused Packages (${unused.length})`
        : 'Unused Packages';
    }

    if (unused.length === 0) {
      elUnusedEmpty.style.display = 'block';
      return;
    }
    elUnusedEmpty.style.display = 'none';

    unused.forEach(pkg => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="padding:5px 10px;border-bottom:1px solid var(--vscode-editorWidget-border,#333);">
          <strong>${esc(pkg.name)}</strong>
          ${pkg.summary ? `<div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:2px">${esc(pkg.summary)}</div>` : ''}
        </td>
        <td style="padding:5px 10px;border-bottom:1px solid var(--vscode-editorWidget-border,#333);">
          ${esc(pkg.installedVersion || '—')}
        </td>
        <td style="padding:5px 10px;border-bottom:1px solid var(--vscode-editorWidget-border,#333);">
          <span style="font-size:11px;color:var(--vscode-descriptionForeground)">${esc(pkg.source)}</span>
        </td>
        <td style="padding:5px 10px;border-bottom:1px solid var(--vscode-editorWidget-border,#333);">
          <span style="
            display:inline-flex;align-items:center;gap:4px;
            padding:2px 8px;border-radius:10px;font-size:11px;
            background:rgba(158,158,158,.15);color:#9E9E9E;
          ">&#128683; No imports found</span>
        </td>
      `;
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => showDetail(pkg));
      elUnusedBody.appendChild(tr);
    });
  }

  // ── History Tab ───────────────────────────────────────────────────────────
  function renderHistory() {
    const listEl = document.getElementById('history-list');
    const emptyEl = document.getElementById('history-empty');
    if (!listEl || !emptyEl) return;

    listEl.innerHTML = '';

    if (!historyEntries || historyEntries.length === 0) {
      emptyEl.style.display = 'block';
      listEl.style.display = 'none';
      return;
    }

    emptyEl.style.display = 'none';
    listEl.style.display = 'block';

    const actionLabels = {
      'pip-install':  'Updated / Installed',
      'detected':     'Detected',
      'pip-rollback': 'Rolled back',
    };

    // ── Date grouping ──────────────────────────────────────────────────────
    const now       = new Date();
    const startOfToday     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfToday.getDate() - 1);
    const startOfWeek      = new Date(startOfToday); startOfWeek.setDate(startOfToday.getDate() - 7);

    function dateGroup(dateStr) {
      try {
        const d = new Date(dateStr);
        if (d >= startOfToday)     return 'Today';
        if (d >= startOfYesterday) return 'Yesterday';
        if (d >= startOfWeek)      return 'This Week';
        return 'Earlier';
      } catch { return 'Earlier'; }
    }

    const groupOrder = ['Today', 'Yesterday', 'This Week', 'Earlier'];
    const groups = {};
    for (const entry of historyEntries) {
      const g = dateGroup(entry.installedAt);
      if (!groups[g]) groups[g] = [];
      groups[g].push(entry);
    }

    for (const groupName of groupOrder) {
      if (!groups[groupName]) continue;

      // Group header
      const header = document.createElement('div');
      header.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--vscode-descriptionForeground);padding:10px 0 4px;opacity:.7;';
      header.textContent = groupName;
      listEl.appendChild(header);

      for (const entry of groups[groupName]) {
        const div = document.createElement('div');
        div.className = 'history-entry';

        const dotClass = entry.source === 'pip-install'
          ? 'pip-install'
          : entry.source === 'pip-rollback' ? 'pip-rollback' : 'detected';

        let timeStr = '';
        try { timeStr = new Date(entry.installedAt).toLocaleString(); }
        catch { timeStr = entry.installedAt || ''; }

        const actionLabel = actionLabels[entry.source] || entry.source;

        div.innerHTML = `
          <div class="history-dot ${dotClass}"></div>
          <div style="flex:1">
            <div>
              <span class="history-action">${esc(entry.packageName)}</span>
              <span style="color:var(--vscode-descriptionForeground);margin-left:6px;font-size:11px;">${esc(actionLabel)}</span>
              <span style="margin-left:6px;font-family:monospace;font-size:11px;background:var(--vscode-badge-background);padding:1px 5px;border-radius:3px;">${esc(entry.version)}</span>
            </div>
            <div class="history-time">${esc(timeStr)}</div>
          </div>
        `;
        listEl.appendChild(div);
      }
    }
  }

  // ── Detail Panel ──────────────────────────────────────────────────────────
  function showDetail(pkg) {
    const normName = pkg.name.toLowerCase().replace(/[-_.]+/g, '-');
    elDetailName.textContent = pkg.name;

    const history = pkg.allVersions || [];
    const versionChips = history.slice(0, 20).map(v =>
      `<span class="version-chip" data-version="${esc(v)}" data-pkg="${esc(pkg.name)}" title="Install ${v}">${esc(v)}</span>`
    ).join('');

    const pkgConflicts = conflictsByPkg.get(normName) || [];
    const conflictsHtml = pkgConflicts.length > 0 ? `
      <div class="field">
        <label style="color:#f97316">&#x26A1; Dependency Conflicts (${pkgConflicts.length})</label>
        ${pkgConflicts.map(c => `<div class="vuln-card">
          <div class="vuln-id">${esc(c.package)} ${esc(c.version)} requires <code>${esc(c.requirement)}</code></div>
          <div class="vuln-desc">${
            c.conflictingVersion === 'not installed'
              ? `<strong>${esc(c.conflictingPackage)}</strong> is not installed`
              : `But <strong>${esc(c.conflictingPackage)} ${esc(c.conflictingVersion)}</strong> is installed`
          }</div>
        </div>`).join('')}
      </div>
    ` : '';

    const vulns = pkg.vulnerabilities && pkg.vulnerabilities.length > 0 ? pkg.vulnerabilities : [];
    const vulnHtml = vulns.length > 0 ? `
      <div class="field">
        <label style="color:var(--c-vuln)">&#x1F534; Security Vulnerabilities (${vulns.length})</label>
        ${vulns.map(v => {
          const cveIds = v.aliases && v.aliases.length > 0 ? v.aliases.join(', ') : '';
          const fixedIn = v.fixed_in && v.fixed_in.length > 0
            ? `Fixed in: ${v.fixed_in.join(', ')}`
            : 'No fix version listed';
          return `<div class="vuln-card">
            <div class="vuln-id">${esc(v.id)}${cveIds ? ` <span style="font-weight:400;opacity:.8">(${esc(cveIds)})</span>` : ''}</div>
            ${v.details ? `<div class="vuln-desc">${esc(v.details.slice(0, 240))}${v.details.length > 240 ? '…' : ''}</div>` : ''}
            <div class="vuln-fix">&#x1F4CC; ${esc(fixedIn)}</div>
          </div>`;
        }).join('')}
      </div>
    ` : '';

    const releaseDateHtml = pkg.releaseDate
      ? `<div class="field"><label>Released</label><div class="field-value">${esc(formatReleaseDate(pkg.releaseDate))}</div></div>`
      : '';

    const pypiLinkHtml = `<div class="field"><label>PyPI Page</label><div class="field-value"><span style="cursor:pointer;color:var(--vscode-textLink-foreground)" class="detail-pypi-link" data-name="${esc(pkg.name)}">${esc(pkg.name)} &#x2197;</span></div></div>`;

    const metaGridHtml = `
      <div class="detail-meta-grid">
        <div class="detail-meta-item">
          <div class="detail-meta-label">License</div>
          <div class="detail-meta-value">${esc(pkg.license || '—')}</div>
        </div>
        <div class="detail-meta-item">
          <div class="detail-meta-label">Python Requires</div>
          <div class="detail-meta-value">${esc(pkg.pythonRequires || '—')}</div>
        </div>
        <div class="detail-meta-item" style="grid-column:1/-1">
          <div class="detail-meta-label">Weekly Downloads</div>
          <div class="detail-meta-value">${pkg.weeklyDownloads > 0 ? pkg.weeklyDownloads.toLocaleString() : '—'}</div>
        </div>
      </div>
    `;

    elDetailBody.innerHTML = `
      <div class="field"><label>Status</label><div class="field-value">${statusBadge(pkg.status)}</div></div>
      ${pkg.summary ? `<div class="field"><label>Summary</label><div class="field-value" style="color:var(--vscode-descriptionForeground)">${esc(pkg.summary)}</div></div>` : ''}
      ${metaGridHtml}
      <div class="field"><label>Installed version</label><div class="field-value ver">${esc(pkg.installedVersion || 'Not installed')}</div></div>
      <div class="field"><label>Latest version</label><div class="field-value ver">${esc(pkg.latestVersion || '—')}</div></div>
      ${releaseDateHtml}
      <div class="field"><label>Pinned in file</label><div class="field-value">${esc(pkg.specifiedVersion || 'any')}</div></div>
      <div class="field"><label>Source file</label><div class="field-value">${esc(pkg.source || '—')}</div></div>
      ${pypiLinkHtml}
      ${pkg.requires && pkg.requires.length ? `<div class="field"><label>Requires (${pkg.requires.length})</label><div class="field-value" style="color:var(--vscode-descriptionForeground);line-height:1.7">${pkg.requires.map(r => `<code>${esc(r)}</code>`).join(' ')}</div></div>` : ''}
      ${conflictsHtml}
      ${vulnHtml}
      ${history.length ? `<div class="field"><label>Available versions</label><div style="margin-top:6px;line-height:1.8">${versionChips}</div></div>` : ''}
    `;

    // PyPI link in detail panel
    elDetailBody.querySelectorAll('.detail-pypi-link').forEach(el => {
      el.addEventListener('click', () => {
        vscode.postMessage({ type: 'openUrl', url: 'https://pypi.org/project/' + el.dataset.name });
      });
    });

    // Install a specific version on chip click
    elDetailBody.querySelectorAll('.version-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        vscode.postMessage({
          type: 'rollbackPackage',
          name: chip.dataset.pkg,
          version: chip.dataset.version,
        });
        elDetail.style.display = 'none';
      });
    });

    elDetail.style.display = 'block';
    elOverlay.style.display = 'block';
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function statusBadge(status) {
    const labels = {
      'up-to-date':       '&#x2705; Up to date',
      'update-available': '&#x26A0;&#xFE0F; Update available',
      'not-installed':    '&#x2B1C; Not installed',
      'unknown':          '&#x2753; Unknown',
    };
    return `<span class="badge ${esc(status || 'unknown')}">${labels[status] || '&#x2753; Unknown'}</span>`;
  }

  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showLoading(msg) {
    elLoadingMsg.textContent  = msg || 'Scanning workspace…';
    elLoading.style.display   = 'flex';
    elEmpty.style.display     = 'none';
    elGraph.style.display     = 'none';
    elList.style.display      = 'none';
    elUnused.style.display    = 'none';
    if (elHistory) elHistory.style.display = 'none';
  }

  function hideLoading() {
    elLoading.style.display = 'none';
  }

  function showEmpty() {
    elEmpty.style.display     = 'flex';
    elGraph.style.display     = 'none';
    elList.style.display      = 'none';
    elUnused.style.display    = 'none';
    if (elHistory) elHistory.style.display = 'none';
  }

  // Tell the extension the webview is ready to receive messages
  vscode.postMessage({ type: 'ready' });

  // Show loading state until first message arrives
  showLoading('Scanning workspace...');
})();
