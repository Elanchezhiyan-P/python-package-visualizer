// main.js — runs inside the VS Code webview sandbox (browser context)
// Receives messages from the extension host and drives all UI interactions.

(function () {
  'use strict';

  const vscode = acquireVsCodeApi();

  // ── State ───────────────────────────────────────────────────────────────
  let allPackages = [];
  let historyEntries = [];
  let activeTab = 'list';
  let sortCol = 'status';   // active sort column key
  let sortDir = 'asc';      // 'asc' | 'desc'
  let selectedPackages = new Set(); // Set of package names

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
  const elUpdateAll    = document.getElementById('btn-update-all');
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
        renderAll();
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
    }
  });

  // ── Button handlers ───────────────────────────────────────────────────────
  elRefresh.addEventListener('click', () => {
    vscode.postMessage({ type: 'refresh' });
    showLoading('Refreshing...');
  });

  elUpdateAll.addEventListener('click', () => {
    const toUpdate = allPackages
      .filter(p => p.status === 'update-available')
      .map(p => p.name);
    if (!toUpdate.length) return;
    elUpdateAll.disabled = true;
    elUpdateAll.textContent = `Updating ${toUpdate.length} packages…`;
    vscode.postMessage({ type: 'updateAllPackages', names: toUpdate });
  });

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
  elSearch.addEventListener('input', () => renderAll());
  elFilter.addEventListener('change', () => renderAll());
  if (elFilterGroup) elFilterGroup.addEventListener('change', () => renderAll());

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
    setTimeout(() => elCopyToast.classList.remove('show'), 2000);
  }

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
      updateBulkBar();
      renderAll();
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
      elAddPkgInstall.innerHTML = '&#x23F3; Installing…';
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
    // U → update all (not when typing)
    if (e.key === 'u' && !isInputFocused() && elUpdateAll && !elUpdateAll.disabled) {
      elUpdateAll.click();
      return;
    }
  });

  function isInputFocused() {
    const tag = document.activeElement && document.activeElement.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

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
      return matchSearch && matchStatus && matchGroup;
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

  function showTab(tab, filtered) {
    filtered = filtered || getFiltered();
    elGraph.style.display   = 'none';
    elList.style.display    = 'none';
    elUnused.style.display  = 'none';
    if (elHistory) elHistory.style.display = 'none';

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

    if (elUpdateAll) {
      elUpdateAll.style.display = updates > 0 ? 'inline-flex' : 'none';
      if (!elUpdateAll.disabled) {
        elUpdateAll.textContent = `\u2191 Update All (${updates})`;
      }
    }

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
    if (!packages.length) {
      canvas.innerHTML = '<div style="padding:40px;text-align:center;color:var(--vscode-descriptionForeground)">No packages to display.</div>';
      return;
    }

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
    elTableBody.innerHTML = '';

    if (!packages.length) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="6" style="text-align:center;padding:20px;color:var(--vscode-descriptionForeground)">No packages match your filter.</td>`;
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

      // Row accent + staggered animation
      tr.classList.add(`row-${pkg.status || 'unknown'}`);
      if (hasVuln) tr.classList.add('row-vulnerable');
      tr.style.animationDelay = `${i * 18}ms`;

      const latestDisplay = hasUpdate
        ? `<span class="ver ver-latest" data-copy="${esc(pkg.latestVersion)}" title="Click to copy" style="cursor:pointer">${esc(pkg.latestVersion)}</span>`
        : `<span class="ver">${esc(pkg.latestVersion || '—')}</span>`;

      const groupTag = grp !== 'main'
        ? `<span class="group-tag ${esc(grp)}">${esc(grp)}</span>`
        : '';

      const releaseDateDisplay = formatReleaseDate(pkg.releaseDate);

      const pinBtn = pkg.installedVersion && pkg.source
        ? `<button class="pin-btn" data-name="${esc(pkg.name)}" data-version="${esc(pkg.installedVersion)}" data-source="${esc(pkg.source)}" title="Pin to ==${esc(pkg.installedVersion)}">📌 Pin</button>`
        : '';

      tr.innerHTML = `
        <td class="col-check"><input type="checkbox" class="pkg-check" data-name="${esc(pkg.name)}" ${isSelected ? 'checked' : ''}></td>
        <td>
          <div class="pkg-name">
            <span class="pkg-name-link" data-name="${esc(pkg.name)}">${esc(pkg.name)}</span>
            <span class="pkg-ext-link" data-pypi="${esc(pkg.name)}" title="Open on PyPI">&#x2197;</span>
            ${pkg.source ? `<span class="pkg-source">${esc(pkg.source)}</span>` : ''}
            ${groupTag}
            ${hasVuln   ? `<span class="inline-tag cve" title="${pkg.vulnerabilities.length} vulnerabilit${pkg.vulnerabilities.length !== 1 ? 'ies' : 'y'}">&#x1F534; CVE</span>` : ''}
            ${!pkg.isUsed ? `<span class="inline-tag unused" title="No import found in project">&#x2298; unused?</span>` : ''}
          </div>
        </td>
        <td><span class="ver" data-copy="${esc(pkg.installedVersion || '')}" title="Click to copy" style="cursor:pointer">${esc(pkg.installedVersion || '—')}</span></td>
        <td>${latestDisplay}</td>
        <td>${statusBadge(pkg.status)}</td>
        <td><span style="font-size:11px;color:var(--vscode-descriptionForeground)">${esc(releaseDateDisplay)}</span></td>
        <td>
          <div class="act-group">
            ${hasUpdate    ? `<button class="action-btn success btn-update"  data-name="${esc(pkg.name)}" title="Update to ${esc(pkg.latestVersion)}">&#x2B06; Update</button>` : ''}
            ${notInstalled ? `<button class="action-btn primary btn-install" data-name="${esc(pkg.name)}" title="Install ${esc(pkg.name)}">&#x2B07; Install</button>` : ''}
            ${hasHistory && !notInstalled ? `<button class="action-btn secondary btn-rollback" data-name="${esc(pkg.name)}" title="Rollback">&#x21A9; Rollback</button>` : ''}
            ${pinBtn}
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
        navigator.clipboard.writeText(text).then(() => showToast('✓ Copied to clipboard')).catch(() => {});
      });
    });

    elTableBody.querySelectorAll('.pin-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        vscode.postMessage({
          type: 'pinVersion',
          name: btn.dataset.name,
          version: btn.dataset.version,
          source: btn.dataset.source,
        });
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
        btn.textContent = 'Updating…';
        vscode.postMessage({ type: 'updatePackage', name: btn.dataset.name });
      });
    });

    elTableBody.querySelectorAll('.btn-install').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.textContent = 'Installing…';
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
        btn.textContent = 'Rolling back…';
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
      'pip-install': 'Updated / Installed',
      'detected': 'Detected',
      'pip-rollback': 'Rolled back',
    };

    historyEntries.forEach(entry => {
      const div = document.createElement('div');
      div.className = 'history-entry';

      const dotClass = entry.source === 'pip-install'
        ? 'pip-install'
        : entry.source === 'pip-rollback'
          ? 'pip-rollback'
          : 'detected';

      let timeStr = '';
      try {
        const d = new Date(entry.installedAt);
        timeStr = d.toLocaleString();
      } catch {
        timeStr = entry.installedAt || '';
      }

      const actionLabel = actionLabels[entry.source] || entry.source;

      div.innerHTML = `
        <div class="history-dot ${dotClass}"></div>
        <div style="flex:1">
          <div>
            <span class="history-action">${esc(entry.packageName)}</span>
            <span style="color:var(--vscode-descriptionForeground); margin-left:6px; font-size:11px;">${esc(actionLabel)}</span>
            <span style="margin-left:6px; font-family:monospace; font-size:11px; background:var(--vscode-badge-background); padding:1px 5px; border-radius:3px;">${esc(entry.version)}</span>
          </div>
          <div class="history-time">${esc(timeStr)}</div>
        </div>
      `;
      listEl.appendChild(div);
    });
  }

  // ── Detail Panel ──────────────────────────────────────────────────────────
  function showDetail(pkg) {
    elDetailName.textContent = pkg.name;

    const history = pkg.allVersions || [];
    const versionChips = history.slice(0, 20).map(v =>
      `<span class="version-chip" data-version="${esc(v)}" data-pkg="${esc(pkg.name)}" title="Install ${v}">${esc(v)}</span>`
    ).join('');

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
