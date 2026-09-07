/**
 * Dependency Conflict Detector Tab Renderer.
 * Visualizes pip check results with summary cards and per-conflict detail rows.
 * Leverages existing `window.allConflicts` data populated by the main message router.
 */

/**
 * Renders the Dependency Conflicts analysis view.
 * Shows summary cards for total conflicts, version mismatches, and missing dependencies,
 * followed by a detailed table of each conflict with links to the affected package detail panel.
 *
 * @returns {void}
 */
window.renderConflicts = function () {
  const el = document.getElementById('view-conflicts');
  if (!el) return;

  const conflicts = window.allConflicts || [];
  const allPackages = window.allPackages || [];

  // Sync tab badge
  const tabEl = document.querySelector('.tab[data-tab="conflicts"]');
  if (tabEl) {
    tabEl.textContent = conflicts.length > 0
      ? `${window.t('tab.conflicts')} (${conflicts.length})`
      : window.t('tab.conflicts');
  }

  if (conflicts.length === 0) {
    el.innerHTML = `<div style="max-width:900px;margin:0 auto;padding:24px;width:100%;box-sizing:border-box;">
      <div style="font-size:20px;font-weight:700;color:var(--vscode-foreground);margin-bottom:4px;">${window.t('conflicts.title')}</div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:24px;">${window.t('conflicts.subtitle')}</div>
      <div style="text-align:center;padding:80px 20px;background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px dashed var(--vscode-panel-border);border-radius:10px;">
        <div style="font-size:42px;margin-bottom:12px;opacity:.7;">✅</div>
        <div style="font-size:14px;font-weight:600;color:var(--vscode-foreground);">${window.t('conflicts.noConflicts')}</div>
        <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:6px;">${window.t('conflicts.noConflictsDesc')}</div>
      </div>
    </div>`;
    return;
  }

  // Classify conflicts
  const mismatches = conflicts.filter(c => c.conflictingVersion !== 'not installed');
  const missing = conflicts.filter(c => c.conflictingVersion === 'not installed');

  // Determine unique affected packages
  const affectedSet = new Set();
  for (const c of conflicts) {
    affectedSet.add(c.package.toLowerCase());
    affectedSet.add(c.conflictingPackage.toLowerCase());
  }

  const summaryCards = [
    { color: '#f87171', icon: '⚡', label: window.t('conflicts.totalConflicts'), val: conflicts.length },
    { color: '#fb923c', icon: '🔄', label: window.t('conflicts.mismatches'), val: mismatches.length },
    { color: '#a78bfa', icon: '❌', label: window.t('conflicts.missing'), val: missing.length },
    { color: '#60a5fa', icon: '📦', label: window.t('conflicts.affectedPkgs'), val: affectedSet.size },
  ];

  const cardsHtml = summaryCards.map(c => `
    <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-top:3px solid ${c.color};border-radius:10px;padding:14px 16px;text-align:center;">
      <div style="font-size:10px;text-transform:uppercase;font-weight:600;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${c.icon} ${window.esc(c.label)}</div>
      <div style="font-size:22px;font-weight:700;margin-top:4px;color:${c.color};">${c.val}</div>
    </div>
  `).join('');

  const rowsHtml = conflicts.map(c => {
    const isMissing = c.conflictingVersion === 'not installed';
    const typeColor = isMissing ? '#a78bfa' : '#fb923c';
    const typeLabel = isMissing ? window.t('conflicts.missingDep') : window.t('conflicts.versionMismatch');
    const pkgInfo = allPackages.find(
      p => p.name.toLowerCase().replace(/[-_.]+/g, '-') === c.package.toLowerCase().replace(/[-_.]+/g, '-')
    );
    let actionsHtml = '';
    const fixBtn = window.conflictFixButtonHtml
      ? window.conflictFixButtonHtml(c)
      : '';
    const extraParts = [];
    if (fixBtn) {
      extraParts.push(fixBtn);
    }
    if (pkgInfo?.updateBlockedByConflict) {
      if (pkgInfo.previousVersion) {
        extraParts.push(`<button class="action-btn rollback-btn" data-name="${window.esc(pkgInfo.name)}" data-version="${window.esc(pkgInfo.previousVersion)}" data-due-incompat="1">${window.t('btn.revertPrevious')}</button>`);
      }
      if (pkgInfo.latestVersion && pkgInfo.latestVersion !== 'unknown') {
        extraParts.push(`<button class="action-btn force-update-btn" data-name="${window.esc(pkgInfo.name)}">${window.t('btn.forceUpdate')}</button>`);
      }
    }
    if (extraParts.length) {
      actionsHtml = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">${extraParts.join('')}</div>`;
    }

    return `
    <div class="conflict-row" style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-left:3px solid ${typeColor};border-radius:8px;padding:14px 16px;margin-bottom:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="conflict-pkg-link" data-pkg="${window.esc(c.package)}" style="font-weight:700;font-size:13px;color:var(--vscode-textLink-foreground);cursor:pointer;">${window.esc(c.package)}</span>
          <span style="font-family:var(--vscode-editor-font-family,monospace);font-size:11px;color:var(--vscode-descriptionForeground);">${window.esc(c.version)}</span>
        </div>
        <span style="font-size:9px;font-weight:700;padding:3px 8px;border-radius:10px;text-transform:uppercase;letter-spacing:.5px;background:${typeColor}22;color:${typeColor};border:1px solid ${typeColor}55;">${typeLabel}</span>
      </div>
      <div style="font-size:12px;color:var(--vscode-foreground);line-height:1.6;">
        ${window.t('conflicts.requires')} <code style="background:var(--vscode-textCodeBlock-background);padding:2px 6px;border-radius:3px;font-size:11px;">${window.esc(c.requirement)}</code>
        ${isMissing
          ? `, <span style="color:#a78bfa;font-weight:600;">${window.esc(c.conflictingPackage)}</span> ${window.t('conflicts.notInstalled')}`
          : `, ${window.t('conflicts.butHave')} <span class="conflict-pkg-link" data-pkg="${window.esc(c.conflictingPackage)}" style="color:var(--vscode-textLink-foreground);cursor:pointer;font-weight:600;">${window.esc(c.conflictingPackage)}</span> <code style="background:var(--vscode-textCodeBlock-background);padding:2px 6px;border-radius:3px;font-size:11px;">${window.esc(c.conflictingVersion)}</code>`
        }
      </div>
      ${actionsHtml}
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="max-width:1100px;margin:0 auto;padding:24px;width:100%;box-sizing:border-box;">
      <div style="font-size:20px;font-weight:700;color:var(--vscode-foreground);margin-bottom:4px;">${window.t('conflicts.title')}</div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:20px;">${window.t('conflicts.subtitle')}</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">${cardsHtml}</div>
      ${rowsHtml}
    </div>
  `;

  // Wire package name links to open detail panel
  el.querySelectorAll('.conflict-pkg-link').forEach(link => {
    link.addEventListener('click', () => {
      const pkg = allPackages.find(p => p.name.toLowerCase().replace(/[-_.]+/g, '-') === link.dataset.pkg);
      if (pkg && typeof window.showDetail === 'function') window.showDetail(pkg);
    });
  });

  el.querySelectorAll('.rollback-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const name = btn.dataset.name;
      const version = btn.dataset.version;
      if (name && version) {
        window.showVersionInstallConfirmDialog?.(name, version, () => {
          btn.disabled = true;
          window.vscode.postMessage({
            type: 'rollbackPackage',
            name,
            version,
            dueToIncompatibility: true,
          });
        });
      }
    });
  });

  el.querySelectorAll('.force-update-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const name = btn.dataset.name;
      if (!name) return;
      window.showForceUpdateConfirmDialog?.(name, () => {
        btn.disabled = true;
        window.vscode.postMessage({ type: 'forceUpdatePackage', name });
      });
    });
  });

  window.wireConflictFixButtons?.(el);
};

/**
 * Syncs the tab badge reflecting the count of detected conflicts.
 *
 * @returns {void}
 */
window.updateConflictBadge = function () {
  const count = (window.allConflicts || []).length;
  const tab = document.querySelector('.tab[data-tab="conflicts"]');
  if (tab) {
    tab.textContent = count > 0 ? `${window.t('tab.conflicts')} (${count})` : window.t('tab.conflicts');
  }
};
