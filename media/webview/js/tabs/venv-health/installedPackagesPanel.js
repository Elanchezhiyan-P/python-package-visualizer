/**
 * Installed-packages panel HTML and wiring for the Environment Health tab.
 */

/**
 * Formats a byte count for display in the environment tab.
 * @param {number} bytes
 * @returns {string}
 */
function formatDiskSize(bytes) {
  if (!bytes || bytes <= 0) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildInstalledPackagesHtml(report) {
  // ── Installed packages panel (collapsible with toggle button) ────────
  let installedHtml = '';
  const pkgs = report.installedPackages || [];
  if (pkgs.length > 0) {
    // Sort alphabetically for initial render
    const sorted = [...pkgs].sort((a, b) => a.name.localeCompare(b.name));
    const outdatedCount = sorted.filter(p => p.latestVersion).length;

    const pkgRows = sorted.map(p => {
      const isOutdated = !!p.latestVersion;
      const latestCell = isOutdated
        ? `<span style="color:#e8a317;font-weight:600;">↑ ${window.esc(p.latestVersion)}</span>`
        : `<span style="color:#3cba54;opacity:.7;">✓</span>`;
      const actionCell = isOutdated
        ? `<button class="venv-update-btn" data-pkg="${window.esc(p.name)}" style="background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:5px;padding:4px 10px;font-size:10px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px;transition:opacity .2s;" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">↑ ${window.t('venv.updateBtn')}</button>`
        : '';
      const sizeCell = p.diskSizeBytes ? formatDiskSize(p.diskSizeBytes) : '—';
      return `
      <tr class="venv-pkg-row" data-name="${window.esc(p.name.toLowerCase())}" style="${isOutdated ? 'background:color-mix(in srgb, #e8a317 6%, transparent);' : ''}">
        <td style="padding:8px 14px;font-weight:600;font-size:12px;color:var(--vscode-foreground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${window.esc(p.name)}</td>
        <td style="padding:8px 14px;font-family:var(--vscode-editor-font-family,monospace);font-size:11px;color:var(--vscode-descriptionForeground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${window.esc(p.version)}</td>
        <td style="padding:8px 14px;font-family:var(--vscode-editor-font-family,monospace);font-size:11px;color:var(--vscode-descriptionForeground);white-space:nowrap;">${sizeCell}</td>
        <td style="padding:8px 14px;font-family:var(--vscode-editor-font-family,monospace);font-size:11px;white-space:nowrap;">${latestCell}</td>
        <td style="padding:8px 14px;text-align:center;white-space:nowrap;">${actionCell}</td>
      </tr>`;
    }).join('');

    const outdatedBadge = outdatedCount > 0
      ? ` <span style="background:#e8a317;color:#1e1e1e;border-radius:10px;padding:1px 8px;font-size:10px;font-weight:700;margin-left:8px;">${outdatedCount} ${window.t('venv.outdated')}</span>`
      : '';

    installedHtml = `
    <div style="margin-top:20px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--vscode-panel-border);">
        <div style="font-size:14px;font-weight:700;color:var(--vscode-foreground);">${window.t('venv.installedPkgs')} (${pkgs.length})${outdatedBadge}</div>
        <button id="btn-toggle-installed" style="background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;border-radius:6px;padding:7px 14px;font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:opacity 0.2s;" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
          📋 ${window.t('venv.showPkgs')}
        </button>
      </div>
      <div id="venv-installed-panel" style="display:none;">
        <div style="margin-bottom:10px;display:flex;justify-content:flex-end;align-items:center;gap:8px;">
          ${outdatedCount > 0 ? `<button id="btn-update-all-venv" style="background:#e8a317;color:#1e1e1e;border:none;border-radius:6px;padding:6px 14px;font-size:11px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:opacity .2s;white-space:nowrap;" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">↑ ${window.t('venv.updateAll')}</button>` : ''}
          <input id="venv-pkg-search" type="text" placeholder="${window.t('venv.searchPkgs')}"
            style="background:var(--vscode-input-background);color:var(--vscode-input-foreground);
            border:1px solid var(--vscode-input-border,var(--vscode-panel-border));border-radius:6px;
            padding:6px 12px;font-size:11px;font-family:inherit;outline:none;width:220px;" />
        </div>
        <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:10px;overflow:hidden;">
          <div style="max-height:400px;overflow-y:auto;">
            <table style="width:100%;border-collapse:collapse;table-layout:fixed;">
              <thead style="position:sticky;top:0;z-index:1;">
                <tr style="background:var(--vscode-editorGroupHeader-tabsBackground);">
                  <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;width:32%;">${window.t('venv.pkgName')}</th>
                  <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;width:16%;">${window.t('venv.pkgVersion')}</th>
                  <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;width:14%;">${window.t('venv.pkgDiskSize')}</th>
                  <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;width:18%;">${window.t('venv.pkgLatest')}</th>
                  <th style="padding:10px 14px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;width:20%;">${window.t('venv.pkgActions')}</th>
                </tr>
              </thead>
              <tbody id="venv-pkg-tbody">${pkgRows}</tbody>
            </table>
          </div>
          <div style="padding:8px 14px;font-size:10px;color:var(--vscode-descriptionForeground);text-align:right;border-top:1px solid color-mix(in srgb, var(--vscode-panel-border) 40%, transparent);">
            <span id="venv-pkg-count">${pkgs.length}</span> ${window.t('venv.packages')}
          </div>
        </div>
      </div>
    </div>`;
  }
  return installedHtml;
}

function bindInstalledPackagesPanel(el, report) {
  // Wire up installed packages toggle button
  const btnToggle = el.querySelector('#btn-toggle-installed');
  const installedPanel = el.querySelector('#venv-installed-panel');
  if (btnToggle && installedPanel) {
    btnToggle.addEventListener('click', () => {
      const isHidden = installedPanel.style.display === 'none';
      installedPanel.style.display = isHidden ? 'block' : 'none';
      btnToggle.innerHTML = isHidden
        ? `▴ ${window.t('venv.hidePkgs')}`
        : `📋 ${window.t('venv.showPkgs')}`;
    });
  }

  // Wire up per-package update buttons
  el.querySelectorAll('.venv-update-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pkgName = btn.dataset.pkg;
      if (!pkgName) return;
      btn.disabled = true;
      btn.innerHTML = `<span class="btn-spinner"></span>${window.t('venv.updating')}`;
      window.vscode.postMessage({ type: 'updatePackage', name: pkgName });
      setTimeout(() => { window.venvHealthReport = null; }, 500);
    });
  });

  // Wire up "Update All" button
  const btnUpdateAll = el.querySelector('#btn-update-all-venv');
  if (btnUpdateAll) {
    btnUpdateAll.addEventListener('click', () => {
      btnUpdateAll.disabled = true;
      btnUpdateAll.innerHTML = `<span class="btn-spinner"></span>${window.t('venv.updatingAll')}`;
      // Disable all individual update buttons too
      el.querySelectorAll('.venv-update-btn').forEach(btn => {
        btn.disabled = true;
        btn.innerHTML = `<span class="btn-spinner"></span>${window.t('venv.updating')}`;
      });
      // WHY: Send a single batch message instead of N individual updatePackage messages.
      // The backend handler runs pip sequentially, avoiding parallel pip processes
      // that can cause lock conflicts or venv corruption.
      const outdated = (report.installedPackages || []).filter(p => p.latestVersion);
      const names = outdated.map(p => p.name);
      window.vscode.postMessage({ type: 'updateAllPackages', names });
      setTimeout(() => { window.venvHealthReport = null; }, 500);
    });
  }

  // Wire up installed packages search with debounce
  const searchInput = el.querySelector('#venv-pkg-search');
  if (searchInput) {
    let debounceTimer = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const query = searchInput.value.toLowerCase().trim();
        const rows = el.querySelectorAll('.venv-pkg-row');
        let visible = 0;
        rows.forEach(row => {
          const name = row.dataset.name || '';
          const isMatch = !query || name.includes(query);
          row.style.display = isMatch ? '' : 'none';
          if (isMatch) visible++;
        });
        const countEl = el.querySelector('#venv-pkg-count');
        if (countEl) countEl.textContent = String(visible);
      }, 250);
    });
  }
}
