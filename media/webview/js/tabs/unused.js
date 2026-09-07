/**
 * Unused Package Analytics and Badge Synchronization.
 * Evaluates declared dependencies against static import scan metrics.
 */

/**
 * Compiles and renders the Unused Packages checklist.
 * Compares import graph scans against packages declared in requirements files.
 * Displays a multi-signal confidence score per package.
 * 
 * @returns {void}
 */
window.renderUnused = function () {
  const elUnused = document.getElementById('view-unused');
  if (!elUnused) return;

  const allPackages = window.allPackages || [];
  const unused = allPackages.filter(p => !p.isUsed);
  const manuallyUsed = allPackages.filter(p => p.manuallyMarkedUsed);
  const totalScanned = allPackages.length;
  const stats = window.scanStats || window._scanStats || {};
  const filesScanned = stats.filesScanned || 0;
  const workspaceRoot = stats.workspaceRoot || '';
  const rootShort = workspaceRoot
    ? workspaceRoot.replace(/\\/g, '/').split('/').slice(-2).join('/')
    : '';

  // Sync the sidebar tab badge indicator
  const tabEl = document.querySelector('.tab[data-tab="unused"]');
  if (tabEl) {
    tabEl.textContent = unused.length > 0
      ? `${window.t('tab.unused')} (${unused.length})`
      : window.t('tab.unused');
  }

  function buildManualUsedSection(pkgs) {
    if (!pkgs.length) return '';
    const rows = pkgs.map(pkg => {
      const sourceShort = pkg.source ? String(pkg.source).split(/[\\/]/).pop() : '\u2014';
      return `
        <tr style="border-bottom:1px solid color-mix(in srgb, var(--vscode-panel-border) 40%, transparent);">
          <td style="padding:12px 16px;">
            <div style="font-weight:600;color:var(--vscode-textLink-foreground);cursor:pointer;" class="pkg-name-link" data-pkg="${window.esc(pkg.name)}">${window.esc(pkg.name)}</div>
          </td>
          <td style="padding:12px 16px;font-family:var(--vscode-editor-font-family,monospace);font-size:11px;color:var(--vscode-descriptionForeground);">${window.esc(pkg.installedVersion || '\u2014')}</td>
          <td style="padding:12px 16px;font-size:11px;color:var(--vscode-descriptionForeground);" title="${window.esc(pkg.source || '')}">${window.esc(sourceShort)}</td>
          <td style="padding:12px 16px;text-align:right;white-space:nowrap;">
            <button class="unused-unmark-used-btn" data-name="${window.esc(pkg.name)}" title="${window.esc(window.t('unused.unmarkUsedTitle'))}"
              style="background:rgba(148,163,184,.12);color:var(--vscode-foreground);border:1px solid var(--vscode-panel-border);padding:5px 12px;border-radius:4px;font-size:11px;cursor:pointer;font-family:inherit;font-weight:600;">
              ${window.t('unused.unmarkUsed')}
            </button>
          </td>
        </tr>`;
    }).join('');

    return `
      <div style="margin-bottom:8px;font-size:13px;font-weight:700;color:#4ade80;">${window.t('unused.sectionManualUsed')}</div>
      <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-bottom:12px;line-height:1.45;">${window.t('unused.sectionManualUsedHint')}</div>
      <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid rgba(74,222,128,.35);border-radius:10px;overflow:hidden;margin-bottom:20px;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:var(--vscode-editorGroupHeader-tabsBackground);">
              <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.title')}</th>
              <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.version')}</th>
              <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.sourceFile')}</th>
              <th style="padding:12px 16px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.actions')}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function wireManualUsedButtons(rootEl) {
    rootEl.querySelectorAll('.unused-mark-used-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const name = btn.dataset.name;
        if (name) {
          window.vscode.postMessage({ type: 'markPackageManuallyUsed', name });
        }
      });
    });
    rootEl.querySelectorAll('.unused-unmark-used-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const name = btn.dataset.name;
        if (name) {
          window.vscode.postMessage({ type: 'unmarkPackageManuallyUsed', name });
        }
      });
    });
    rootEl.querySelectorAll('.pkg-name-link').forEach(el => {
      el.addEventListener('click', () => {
        const pkgName = el.dataset.pkg;
        const pkg = allPackages.find(p => p.name === pkgName);
        if (pkg && typeof window.showDetail === 'function') window.showDetail(pkg);
      });
    });
  }

  if (unused.length === 0) {
    window.selectedUnusedPackages?.clear();
    elUnused.innerHTML = `<div style="max-width:900px;margin:0 auto;padding:24px;width:100%;box-sizing:border-box;">
      <div style="font-size:20px;font-weight:700;color:var(--vscode-foreground);margin-bottom:4px;">${window.t('unused.title')}</div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:24px;">${window.t('unused.subtitle')}</div>
      <div style="text-align:center;padding:48px 20px;background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px dashed var(--vscode-panel-border);border-radius:10px;margin-bottom:20px;">
        <div style="font-size:42px;margin-bottom:12px;opacity:.7;">\u2705</div>
        <div style="font-size:14px;font-weight:600;color:var(--vscode-foreground);">${window.t('unused.allUsed')}</div>
        <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:6px;">Scanned ${filesScanned} file${filesScanned !== 1 ? 's' : ''} across ${totalScanned} package${totalScanned !== 1 ? 's' : ''}${rootShort ? ' in <code>' + window.esc(rootShort) + '</code>' : ''}</div>
      </div>
      ${buildManualUsedSection(manuallyUsed)}
    </div>`;
    wireManualUsedButtons(elUnused);
    return;
  }

  // Sort by confidence descending (highest risk first)
  const sorted = [...unused].sort((a, b) => (b.unusedConfidence ?? 100) - (a.unusedConfidence ?? 100));
  const likelyUnused = sorted.filter(p => p.usageVerdict !== 'uncertain');
  const uncertain = sorted.filter(p => p.usageVerdict === 'uncertain');

  // Drop selections for packages no longer unused
  if (window.selectedUnusedPackages) {
    const unusedNames = new Set(unused.map(p => p.name));
    for (const name of [...window.selectedUnusedPackages]) {
      if (!unusedNames.has(name)) {
        window.selectedUnusedPackages.delete(name);
      }
    }
  }

  // Compute tier counts for summary cards
  const highCount = sorted.filter(p => p.usageVerdict !== 'uncertain' && (p.unusedConfidence ?? 100) >= 80).length;
  const mediumCount = sorted.filter(p => {
    if (p.usageVerdict === 'uncertain') return false;
    const c = p.unusedConfidence ?? 100;
    return c >= 50 && c < 80;
  }).length;
  const uncertainCount = uncertain.length;
  const lowCount = sorted.filter(p => p.usageVerdict !== 'uncertain' && (p.unusedConfidence ?? 100) < 50).length;

  const likelyRowsHtml = buildRows(likelyUnused);
  const uncertainRowsHtml = buildRows(uncertain);
  const selectedCount = window.selectedUnusedPackages?.size ?? 0;

  const tableHeadCheckbox = `
              <th style="padding:12px 10px 12px 16px;width:36px;">
                <input type="checkbox" class="unused-check-all" data-section="__SECTION__" title="${window.esc(window.t('unused.selectAll'))}"
                  style="accent-color:#7c3aed;cursor:pointer;">
              </th>`;

  elUnused.innerHTML = `
    <div style="max-width:1100px;margin:0 auto;padding:24px;width:100%;box-sizing:border-box;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:4px;flex-wrap:wrap;">
        <div style="font-size:20px;font-weight:700;color:var(--vscode-foreground);">${window.t('unused.title')}</div>
        ${window.cursorAiAvailable ? `
          <button id="btn-cursor-ai-unused" style="background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;">
            ✨ ${window.t('unused.cursorAiUncertainBtn')}
          </button>
        ` : ''}
      </div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:12px;">${window.t('unused.subtitle')}</div>
      ${window.cursorAiAvailable ? `
        <div style="background:rgba(124,58,237,.08);border:1px solid rgba(124,58,237,.25);border-left:3px solid #7c3aed;border-radius:6px;padding:10px 14px;margin-bottom:16px;font-size:11px;color:var(--vscode-foreground);line-height:1.5;">
          ${window.t(window.cursorAiUseAutoModel !== false ? 'unused.cursorAiHint' : 'unused.cursorAiHintNoAuto').replace('{ide}', window.esc(window.cursorIdeName || 'Cursor'))}
        </div>
      ` : ''}
      <div id="unused-ai-result" style="display:none;margin-bottom:16px;"></div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
        <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:10px;padding:14px 16px;text-align:center;">
          <div style="font-size:10px;text-transform:uppercase;font-weight:600;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.totalScanned')}</div>
          <div style="font-size:22px;font-weight:700;margin-top:4px;color:var(--vscode-foreground);">${totalScanned}</div>
        </div>
        <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-top:3px solid #f87171;border-radius:10px;padding:14px 16px;text-align:center;">
          <div style="font-size:10px;text-transform:uppercase;font-weight:600;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">🔴 ${window.t('unused.highConfidence')}</div>
          <div style="font-size:22px;font-weight:700;margin-top:4px;color:#f87171;">${highCount}</div>
        </div>
        <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-top:3px solid #fb923c;border-radius:10px;padding:14px 16px;text-align:center;">
          <div style="font-size:10px;text-transform:uppercase;font-weight:600;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">🟠 ${window.t('unused.mediumConfidence')}</div>
          <div style="font-size:22px;font-weight:700;margin-top:4px;color:#fb923c;">${mediumCount}</div>
        </div>
        <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-top:3px solid #4ade80;border-radius:10px;padding:14px 16px;text-align:center;">
          <div style="font-size:10px;text-transform:uppercase;font-weight:600;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">🟡 ${window.t('unused.verdictUncertain')}</div>
          <div style="font-size:22px;font-weight:700;margin-top:4px;color:#facc15;">${uncertainCount}</div>
        </div>
      </div>

      <div style="background:rgba(251,146,60,.08);border:1px solid rgba(251,146,60,.3);border-left:3px solid #fb923c;border-radius:6px;padding:12px 16px;margin-bottom:20px;font-size:11px;color:var(--vscode-foreground);line-height:1.5;">
        <strong>${window.t('unused.headsUp')}</strong> ${window.t('unused.headsUpText')} <code>importlib</code>. ${window.t('unused.alwaysCheck')}
      </div>

      <div id="unused-bulk-bar" style="display:${selectedCount > 0 ? 'flex' : 'none'};align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px;padding:10px 14px;border-radius:8px;background:rgba(124,58,237,.08);border:1px solid rgba(124,58,237,.25);">
        <span id="unused-bulk-count" style="font-size:12px;font-weight:600;color:var(--vscode-foreground);">${window.t('unused.selectedCount').replace('{n}', String(selectedCount))}</span>
        <button id="unused-bulk-remove" type="button" style="background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">
          ${window.t('unused.removeSelected')} (${selectedCount})
        </button>
        <button id="unused-bulk-select-all" type="button" style="background:transparent;color:var(--vscode-textLink-foreground);border:1px solid var(--vscode-panel-border);border-radius:6px;padding:6px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">
          ${window.t('unused.selectAll')}
        </button>
        <button id="unused-bulk-deselect" type="button" style="background:transparent;color:var(--vscode-descriptionForeground);border:1px solid var(--vscode-panel-border);border-radius:6px;padding:6px 10px;font-size:11px;font-weight:600;cursor:pointer;font-family:inherit;">
          ${window.t('unused.deselectAll')}
        </button>
      </div>

      ${likelyUnused.length ? `
      <div style="margin-bottom:12px;font-size:13px;font-weight:700;color:#f87171;">${window.t('unused.sectionLikelyUnused')}</div>
      <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:10px;overflow:hidden;margin-bottom:20px;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:var(--vscode-editorGroupHeader-tabsBackground);">
              ${tableHeadCheckbox.replace('__SECTION__', 'likely')}
              <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.title')}</th>
              <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.version')}</th>
              <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.sourceFile')}</th>
              <th style="padding:12px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.confidence')}</th>
              <th style="padding:12px 16px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.actions')}</th>
            </tr>
          </thead>
          <tbody>${likelyRowsHtml}</tbody>
        </table>
      </div>
      ` : ''}

      ${uncertain.length ? `
      <div style="margin-bottom:12px;font-size:13px;font-weight:700;color:#facc15;">${window.t('unused.sectionUncertain')}</div>
      <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid rgba(250,204,21,.35);border-radius:10px;overflow:hidden;margin-bottom:20px;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:var(--vscode-editorGroupHeader-tabsBackground);">
              ${tableHeadCheckbox.replace('__SECTION__', 'uncertain')}
              <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.title')}</th>
              <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.version')}</th>
              <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.sourceFile')}</th>
              <th style="padding:12px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.confidence')}</th>
              <th style="padding:12px 16px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.actions')}</th>
            </tr>
          </thead>
          <tbody>${uncertainRowsHtml}</tbody>
        </table>
      </div>
      ` : ''}

      ${buildManualUsedSection(manuallyUsed)}

      <div style="display:none;background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:10px;overflow:hidden;">
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:var(--vscode-editorGroupHeader-tabsBackground);">
              ${tableHeadCheckbox.replace('__SECTION__', 'likely')}
              <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.title')}</th>
              <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.version')}</th>
              <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.sourceFile')}</th>
              <th style="padding:12px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.confidence')} <span title="${window.esc(window.t('unused.confidenceTip'))}" style="cursor:help;opacity:.6;font-size:9px;">?</span></th>
              <th style="padding:12px 16px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('unused.actions')}</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    </div>
  `;

  wireManualUsedButtons(elUnused);

  const likelyNames = likelyUnused.map(p => p.name);
  const uncertainNames = uncertain.map(p => p.name);
  const allUnusedNames = sorted.map(p => p.name);
  window.bindUnusedTabEvents(elUnused, unused, likelyNames, uncertainNames, allUnusedNames);
};

/**
 * Syncs the sidebar tab badge reflecting count of possibly unused packages.
 * 
 * @param {Array<object>} packages - The raw package list.
 * @returns {void}
 */
window.updateUnusedBadge = function (packages) {
  const count = packages.filter(p => !p.isUsed).length;
  const tab = document.querySelector('.tab[data-tab="unused"]');
  if (tab) {
    tab.textContent = count > 0 ? `${window.t('tab.unused')} (${count})` : window.t('tab.unused');
  }
};

/**
 * Renders the result banner after Cursor AI analysis is triggered.
 * @param {object} result
 */
window.renderUnusedAiResult = function (result) {
  const el = document.getElementById('unused-ai-result');
  const btn = document.getElementById('btn-cursor-ai-unused');
  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `✨ ${window.t('unused.cursorAiBtn')}`;
  }
  if (!el || !result) return;

  window.lastUnusedAiResult = result;
  const refCount = Object.keys(result.referenceHits || {}).length;
  const candidates = result.candidates || [];
  el.style.display = 'block';
  el.innerHTML = `
    <div style="background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.3);border-radius:6px;padding:10px 14px;font-size:11px;color:var(--vscode-foreground);display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <span>
        ${window.t('unused.cursorAiSent').replace('{n}', result.analyzed)}
        ${refCount > 0 ? ` ${window.t('unused.cursorAiRefs').replace('{n}', refCount)}` : ''}
      </span>
      ${candidates.length ? `
        <button id="btn-apply-unused-removals" type="button" style="
          background:linear-gradient(135deg,#dc2626,#b91c1c);color:#fff;border:none;border-radius:6px;
          padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;
        ">${window.t('unused.applyRemovalsBtn')}</button>
      ` : ''}
    </div>
  `;

  document.getElementById('btn-apply-unused-removals')?.addEventListener('click', () => {
    if (typeof window.showUnusedRemoveConfirmDialog !== 'function') return;
    window.showUnusedRemoveConfirmDialog(candidates, selected => {
      window.vscode.postMessage({
        type: 'bulkRemoveUnusedConfirmed',
        userInitiated: true,
        packages: selected,
      });
    }, { mode: 'ai' });
  });
};
