/** DOM event bindings for the webview shell. */
window.setupDomListeners = function () {
  // Show loading spinner immediately on start
  window.showLoading?.(window.t('loading.scanning') || 'Scanning workspace…');

  const elRefresh = document.getElementById('btn-refresh');
  const elBtnSafeMode = document.getElementById('btn-safe-mode');
  const elLangSelect = document.getElementById('lang-select');
  const elSearch = document.getElementById('search');
  const elFilter = document.getElementById('filter-status');
  const elFilterGroup = document.getElementById('filter-group');
  const elDetailClose = document.getElementById('detail-close');
  const elOverlay = document.getElementById('overlay');
  const elBtnExport = document.getElementById('btn-export');
  const elExportMenu = document.getElementById('export-menu');
  const elExportWrap = document.getElementById('export-wrap');
  const elBulkInstall = document.getElementById('bulk-install');
  const elBulkUpdate = document.getElementById('bulk-update');
  const elBulkSync = document.getElementById('bulk-sync');
  const elBulkDeselect = document.getElementById('bulk-deselect');
  const elCheckAll = document.getElementById('check-all');
  const elBtnAddPkg = document.getElementById('btn-add-pkg');
  const elAddPkgClose = document.getElementById('add-pkg-close');
  const elAddPkgCancel = document.getElementById('add-pkg-cancel');
  const elAddPkgModal = document.getElementById('add-pkg-modal');
  const elAddPkgInput = document.getElementById('add-pkg-input');
  const elAddPkgSearch = document.getElementById('add-pkg-search');
  const elAddPkgInstall = document.getElementById('add-pkg-install');
  const elEmptySelectManual = document.getElementById('empty-select-manual');
  const elEmptyRefresh = document.getElementById('empty-refresh');

  elEmptySelectManual?.addEventListener('click', () => {
    window.vscode.postMessage({ type: 'selectManualRequirements' });
  });
  elEmptyRefresh?.addEventListener('click', () => {
    elRefresh?.click();
  });

  // Welcome Tour step binders
  document.getElementById('tour-next')?.addEventListener('click', () => {
    window.tourStep++;
    window.showTourStep();
  });
  document.getElementById('tour-skip')?.addEventListener('click', window.endTour);

  // Refresh binder
  elRefresh?.addEventListener('click', () => {
    window.vscode.postMessage({ type: 'refresh' });
    window.showLoading?.('Refreshing...');
  });

  // Safe Mode toggle binder
  if (elBtnSafeMode) {
    elBtnSafeMode.addEventListener('click', () => {
      window.safeMode = !window.safeMode;
      try { localStorage.setItem('ppv-safeMode', String(window.safeMode)); } catch (_) {}
      elBtnSafeMode.classList.toggle('active', window.safeMode);
      elBtnSafeMode.title = window.safeMode
        ? 'Safe Mode ON — major-version updates blocked'
        : 'Safe Mode: block major-version updates';
      window.vscode.postMessage({ type: 'updateSetting', key: 'safeMode', value: window.safeMode });
      if (window.activeTab === 'list') {
        window.renderTable?.(window.getFiltered());
      }
    });
  }

  // Language selector
  if (elLangSelect) {
    elLangSelect.value = window.currentLang;
    elLangSelect.addEventListener('change', () => {
      window.setLanguage?.(elLangSelect.value);
    });
  }

  // Sliding side-panel details drawer closer binds
  const closeDetail = () => {
    const elDetail = document.getElementById('detail-panel');
    const elOverlayPanel = document.getElementById('overlay');
    if (elDetail) elDetail.style.display = 'none';
    if (elOverlayPanel) elOverlayPanel.style.display = 'none';
  };
  elDetailClose?.addEventListener('click', closeDetail);
  elOverlay?.addEventListener('click', () => {
    closeDetail();
    window.hideAddPkgModal?.();
  });

  // Search box and filtering listeners
  elSearch?.addEventListener('input', () => {
    window.searchQuery = elSearch.value;
    window.renderAll();
  });

  elFilter?.addEventListener('change', () => {
    if (window.activeCardFilter) {
      window.activeCardFilter = null;
      document.querySelectorAll('.stat-card.clickable').forEach(c => c.classList.remove('selected'));
    }
    window.activeFilterStatus = elFilter.value;
    updateFilterIndicators();
    window.renderAll();
  });

  elFilterGroup?.addEventListener('change', () => {
    window.activeFilterGroup = elFilterGroup.value;
    updateFilterIndicators();
    window.renderAll();
  });

  function updateFilterIndicators() {
    if (elFilter) elFilter.classList.toggle('active', elFilter.value !== 'all');
    if (elFilterGroup) elFilterGroup.classList.toggle('active', elFilterGroup.value !== 'all');
  }

  // Stats-card filtering binds
  document.querySelectorAll('.stat-card.clickable').forEach(card => {
    card.addEventListener('click', () => {
      const f = card.dataset.filter;
      const isActive = window.activeCardFilter === f;

      document.querySelectorAll('.stat-card.clickable').forEach(c => c.classList.remove('selected'));

      if (isActive) {
        window.activeCardFilter = null;
        if (elFilter) elFilter.value = 'all';
        window.activeFilterStatus = 'all';
      } else {
        window.activeCardFilter = f;
        card.classList.add('selected');
        if (f === 'vuln' || f === 'conflict' || f === 'stale') {
          if (elFilter) elFilter.value = 'all';
          window.activeFilterStatus = 'all';
        } else {
          if (elFilter) elFilter.value = f;
          window.activeFilterStatus = f;
        }
      }
      updateFilterIndicators();
      window.renderAll();
    });
  });

  // Table headers click sort binds
  document.querySelectorAll('th[data-col]').forEach(th => {
    th.querySelector('.th-inner')?.addEventListener('click', () => {
      const col = th.dataset.col;
      if (window.sortCol === col) {
        window.sortDir = window.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        window.sortCol = col;
        window.sortDir = 'asc';
      }
      window.updateSortHeaders();
      window.renderAll();
    });
  });

  // Tab switching links click binds
  document.querySelectorAll('#tab-bar .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('#tab-bar .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      window.activeTab = tab.dataset.tab;
      window.showTab?.(window.activeTab, window.getFiltered());
    });
  });

  // Tools menu dropdown open/close
  if (elBtnExport && elExportMenu) {
    const closeExportMenu = () => {
      elExportMenu.classList.remove('open');
      elExportWrap?.classList.remove('open');
    };
    const openExportMenu = () => {
      elExportMenu.classList.add('open');
      elExportWrap?.classList.add('open');
    };
    const toggleExportMenu = () => {
      elExportMenu.classList.contains('open') ? closeExportMenu() : openExportMenu();
    };

    elBtnExport.addEventListener('click', e => {
      e.stopPropagation();
      toggleExportMenu();
    });

    document.addEventListener('click', e => {
      if (elExportWrap && !elExportWrap.contains(e.target)) {
        closeExportMenu();
      }
      const rowMenu = document.getElementById('pkg-row-context-menu');
      if (rowMenu && !rowMenu.contains(e.target)) {
        window.hidePackageRowContextMenu?.();
      }
    });

    document.querySelectorAll('.export-item').forEach(item => {
      item.addEventListener('click', e => {
        e.stopPropagation();
        const action = item.dataset.action;
        closeExportMenu();
        if (action) {
          if (action === 'export-md')        window.vscode.postMessage({ type: 'exportReport', format: 'markdown' });
          else if (action === 'export-json') window.vscode.postMessage({ type: 'exportReport', format: 'json' });
          else if (action === 'gen-requirements') window.vscode.postMessage({ type: 'generateRequirements' });
          else if (action === 'gen-setup-bash')   window.vscode.postMessage({ type: 'generateSetupScript', format: 'bash' });
          else if (action === 'gen-setup-ps')     window.vscode.postMessage({ type: 'generateSetupScript', format: 'powershell' });
          else if (action === 'gen-setup-md')     window.vscode.postMessage({ type: 'generateSetupScript', format: 'markdown' });
          else if (action === 'migrate-uv-manual') window.vscode.postMessage({ type: 'migrateToUv', mode: 'manual' });
          else if (action === 'migrate-uv-auto')   window.vscode.postMessage({ type: 'migrateToUv', mode: 'automatic' });
          else if (action === 'migrate-poetry')   window.vscode.postMessage({ type: 'migrateToPoetry' });
        }
      });
    });
  }

  // Bulk actions updates triggers
  elBulkInstall?.addEventListener('click', () => {
    const names = [...window.selectedPackages].filter(name => {
      const pkg = window.allPackages.find(p => p.name === name);
      return pkg && pkg.status === 'not-installed';
    });
    if (names.length) {
      window.vscode.postMessage({ type: 'bulkInstall', names });
    }
    window.selectedPackages.clear();
    window.updateBulkBar();
    window.renderAll();
  });

  elBulkUpdate?.addEventListener('click', () => {
    const names = [...window.selectedPackages].filter(name => {
      const pkg = window.allPackages.find(p => p.name === name);
      return pkg && pkg.status === 'update-available' && !pkg.updateBlockedByConflict;
    });
    if (names.length) {
      window.vscode.postMessage({ type: 'bulkUpdate', names });
    }
    window.selectedPackages.clear();
    window.updateBulkBar();
    window.renderAll();
  });

  elBulkSync?.addEventListener('click', () => {
    const packagesToSync = [...window.selectedPackages]
      .map(name => {
        const pkg = window.allPackages.find(p => p.name === name);
        if (!pkg?.specifiedVersion || !pkg.installedVersion) return null;
        if (!window.hasDrift(pkg.specifiedVersion, pkg.installedVersion)) return null;
        return {
          name: pkg.name,
          source: pkg.source || '',
          specifiedVersion: pkg.specifiedVersion,
        };
      })
      .filter(Boolean);

    if (!packagesToSync.length) return;

    window.showSyncConfirmDialog(() => {
      window.vscode.postMessage({ type: 'bulkSync', packages: packagesToSync });
      window.selectedPackages.clear();
      window.updateBulkBar();
      window.renderAll();
    }, packagesToSync);
  });

  elBulkDeselect?.addEventListener('click', () => {
    window.selectedPackages.clear();
    window.updateBulkBar();
    window.renderAll();
  });

  elCheckAll?.addEventListener('change', () => {
    const filtered = window.getFiltered();
    if (elCheckAll.checked) {
      filtered.forEach(p => window.selectedPackages.add(p.name));
    } else {
      filtered.forEach(p => window.selectedPackages.delete(p.name));
    }
    window.renderAll();
    window.updateBulkBar();
  });

  // Modal displays controls
  elBtnAddPkg?.addEventListener('click', window.showAddPkgModal);
  elAddPkgClose?.addEventListener('click', window.hideAddPkgModal);
  elAddPkgCancel?.addEventListener('click', window.hideAddPkgModal);
  elAddPkgModal?.addEventListener('click', e => {
    if (e.target === elAddPkgModal) window.hideAddPkgModal();
  });

  elAddPkgInput?.addEventListener('input', () => {
    const query = elAddPkgInput.value.trim();
    if (!query) { window.resetAddPkgResult?.(); return; }
    const norm = query.toLowerCase().replace(/[-_.]+/g, '-');
    const existing = window.allPackages.find(p =>
      p.name.toLowerCase().replace(/[-_.]+/g, '-') === norm &&
      p.installedVersion && p.status !== 'not-installed'
    );
    if (existing) {
      window.showAlreadyInstalled?.(existing);
    } else {
      window.resetAddPkgResult?.();
    }
  });

  elAddPkgInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') elAddPkgSearch?.click();
  });

  elAddPkgSearch?.addEventListener('click', () => {
    const query = elAddPkgInput.value.trim();
    if (!query) return;
    const norm = query.toLowerCase().replace(/[-_.]+/g, '-');
    const existing = window.allPackages.find(p =>
      p.name.toLowerCase().replace(/[-_.]+/g, '-') === norm &&
      p.installedVersion && p.status !== 'not-installed'
    );
    if (existing) { window.showAlreadyInstalled?.(existing); return; }

    const elResult = document.getElementById('add-pkg-result');
    if (elResult) elResult.innerHTML = '<span style="opacity:.6">Searching PyPI…</span>';
    if (elAddPkgInstall) {
      elAddPkgInstall.disabled = true;
      elAddPkgInstall.classList.remove('is-installed');
      elAddPkgInstall.innerHTML = window.t('addPkg.installBtn');
    }
    window.vscode.postMessage({ type: 'searchPypi', query });
  });

  elAddPkgInstall?.addEventListener('click', () => {
    if (!window.pendingInstallName) return;
    if (elAddPkgInstall) {
      elAddPkgInstall.disabled = true;
      elAddPkgInstall.innerHTML = `<span class="btn-spinner"></span>${window.t('btn.installing')}`;
    }
    window.vscode.postMessage({
      type: 'installNew',
      name: window.pendingInstallName,
      version: window.pendingInstallVersion || undefined
    });
    window.hideAddPkgModal?.();
  });

  // Welcome banner button clicks jumps
  document.getElementById('vuln-banner-jump')?.addEventListener('click', () => {
    window.activeCardFilter = 'vuln';
    document.querySelectorAll('.stat-card.clickable').forEach(c => c.classList.remove('selected'));
    document.getElementById('stat-vuln-card')?.classList.add('selected');
    window.renderAll();
  });
  document.getElementById('vuln-banner-dismiss')?.addEventListener('click', () => {
    window.vulnBannerDismissed = true;
    document.getElementById('vuln-banner')?.classList.remove('visible');
  });
  document.getElementById('drift-banner-view')?.addEventListener('click', () => {
    // Show only drift packages by filtering specifically
    window.activeCardFilter = null;
    document.querySelectorAll('.stat-card.clickable').forEach(c => c.classList.remove('selected'));
    // Filter down requirements vs installed difference
    const listTable = window.computeDrift ? window.computeDrift(window.allPackages) : [];
    window.renderTable?.(listTable);
  });
  document.getElementById('drift-banner-dismiss')?.addEventListener('click', () => {
    window.driftBannerDismissed = true;
    document.getElementById('drift-banner')?.classList.remove('visible');
  });

  // Keyboard shortcut listener overrides
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeDetail();
      window.hideAddPkgModal?.();
      window.hidePackageRowContextMenu?.();
      return;
    }
    // R key -> Re-scan workspace dependencies (when not in input)
    if (e.key === 'r' && !isInputFocused()) {
      window.vscode.postMessage({ type: 'refresh' });
      window.showLoading?.('Refreshing…');
      return;
    }
    // Forward slash or Ctrl+F -> focus search input
    if ((e.key === '/' || (e.ctrlKey && e.key === 'f')) && !isInputFocused()) {
      e.preventDefault();
      document.getElementById('search')?.focus();
      return;
    }
  });

  function isInputFocused() {
    const tag = document.activeElement && document.activeElement.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  // Initial column header carets
  window.updateSortHeaders();

  // Send ready notification signal back to Visualizer Host Code Panel
  window.initPackageRowContextMenu?.();
  window.vscode.postMessage({ type: 'ready' });
};