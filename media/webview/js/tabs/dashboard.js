/**
 * Dashboard View Renderer.
 * Displays package health metrics, size footprints, download rates, and active/inactive maintainer breakdowns.
 */

/**
 * Renders the workspace dashboard health statistics panels.
 * Visualizes size footprint, download metrics, and custom requirement configurations.
 * Exposes functionality to select a manual requirements.txt file or clear the customized path.
 * 
 * @returns {void}
 */
window.renderDashboard = function () {
  const elDashboardView = document.getElementById('view-dashboard');
  if (!elDashboardView) return;

  const allPackages = window.allPackages || [];
  const scanStats = window.scanStats || window._scanStats || {};
  const totalPkgs      = allPackages.length;
  const withVulns      = allPackages.filter(p => (p.vulnerabilities || []).length > 0).length;
  const securityScore  = totalPkgs > 0 ? Math.round(((totalPkgs - withVulns) / totalPkgs) * 100) : 100;
  const outdated = allPackages.filter(p => p.status === 'update-available').length;

  const cards = [
    { color: '#60a5fa', icon: '&#x1F4E6;', label: window.t('dash.totalPackages'), val: totalPkgs, unit: outdated > 0 ? `${outdated} ${window.t('dash.outdated')}` : window.t('dash.allCurrent') },
    { color: '#fb923c', icon: '&#x1F512;', label: window.t('dash.securityScore'), val: securityScore, unit: withVulns === 0 ? window.t('dash.safe') : `${withVulns} vulnerable` },
  ];

  const cardHtml = cards.map(c => `
    <div style="position:relative;background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:10px;padding:18px;display:flex;flex-direction:column;gap:10px;overflow:hidden;min-height:120px;">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;background:${c.color};"></div>
      <div style="width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;background:${c.color}22;color:${c.color};">${c.icon}</div>
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--vscode-descriptionForeground);">${window.esc(c.label)}</div>
      <div style="display:flex;align-items:baseline;gap:8px;">
        <span style="font-size:28px;font-weight:700;color:var(--vscode-foreground);line-height:1;">${window.esc(String(c.val))}</span>
        <span style="font-size:12px;color:var(--vscode-descriptionForeground);">${window.esc(c.unit)}</span>
      </div>
    </div>
  `).join('');

  // Maintainer activity calculation
  const sixMonthsAgo = Date.now() - (6 * 30 * 24 * 60 * 60 * 1000);
  const maintainers = allPackages
    .filter(p => p.releaseDate)
    .map(pkg => {
      const released = new Date(pkg.releaseDate).getTime();
      return { name: pkg.name, date: pkg.releaseDate, active: !isNaN(released) && released > sixMonthsAgo };
    })
    .sort((a, b) => (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0))
    .slice(0, 20);

  let maintHtml;
  if (maintainers.length === 0) {
    maintHtml = `<div style="text-align:center;padding:50px 20px;color:var(--vscode-descriptionForeground);font-size:13px;">${window.t('dash.noMaintainerData')}</div>`;
  } else {
    maintHtml = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;">` +
      maintainers.map(m => `
        <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:8px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:10px;">
          <div style="min-width:0;flex:1;">
            <div style="font-weight:600;font-size:12.5px;color:var(--vscode-foreground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${window.esc(m.name)}</div>
            <div style="font-size:10.5px;color:var(--vscode-descriptionForeground);margin-top:2px;">${window.t('dash.lastRelease')} ${window.esc(m.date)}</div>
          </div>
          <span style="font-size:10px;font-weight:600;padding:4px 10px;border-radius:12px;white-space:nowrap;flex-shrink:0;background:${m.active ? 'rgba(74,222,128,.18)' : 'rgba(148,163,184,.15)'};color:${m.active ? '#4ade80' : '#94a3b8'};border:1px solid ${m.active ? 'rgba(74,222,128,.35)' : 'rgba(148,163,184,.3)'};">
            ${m.active ? window.t('dash.active') : window.t('dash.inactive')}
          </span>
        </div>
      `).join('') +
    `</div>`;
  }

  const isManual = !!scanStats.manualRequirementsPath;
  const depPaths = isManual
    ? [scanStats.manualRequirementsPath]
    : (scanStats.detectedDepFilePaths || []);

  const badgeLabel = isManual
    ? window.t('dash.manualPath')
    : `${window.t('dash.autoDetected')}${depPaths.length > 1 ? ` (${depPaths.length})` : ''}`;
  const badgeClass = isManual ? 'dash-dep-badge dash-dep-badge--manual' : 'dash-dep-badge dash-dep-badge--auto';

  const reqPathHtml = depPaths.length === 0
    ? `<span class="dash-dep-path dash-dep-path--muted">${window.esc(window.t('dash.autoDetectedDesc'))}</span>`
    : depPaths.map(p => `
        <button type="button" class="dash-dep-path dash-dep-path--copy" data-path="${window.esc(p)}" title="${window.esc(p + '\n' + (window.t('dash.copyPathTitle') || 'Click to copy'))}">
          ${window.esc(p)}
        </button>
      `).join('');

  const requirementsBannerHtml = `
    <div class="dash-dep-banner">
      <div class="dash-dep-banner-main">
        <div class="dash-dep-icon" style="background:${isManual ? 'rgba(74,222,128,.18)' : 'rgba(96,165,250,.18)'};color:${isManual ? '#4ade80' : '#60a5fa'};">
          ${isManual ? '&#x1F4DD;' : '&#x1F50D;'}
        </div>
        <div class="dash-dep-info">
          <div class="dash-dep-label">${window.t('dash.depFileSource')}</div>
          <div class="dash-dep-paths">${reqPathHtml}</div>
        </div>
      </div>
      <div class="dash-dep-actions">
        <span class="${badgeClass}">${window.esc(badgeLabel)}</span>
        <button type="button" id="btn-select-manual-req" class="dash-dep-btn dash-dep-btn--primary">
          ${window.t('dash.selectFile')}
        </button>
        ${isManual ? `
          <button type="button" id="btn-clear-manual-req" class="dash-dep-btn dash-dep-btn--danger">
            ${window.t('dash.clearCustomPath')}
          </button>
        ` : ''}
      </div>
    </div>
  `;

  elDashboardView.innerHTML = `
    <div style="max-width:1200px;margin:0 auto;width:100%;padding:24px;">
      <div style="font-size:20px;font-weight:700;margin-bottom:4px;color:var(--vscode-foreground);">${window.t('dash.title')}</div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:24px;">${window.t('dash.subtitle')}</div>
      ${requirementsBannerHtml}
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-bottom:32px;">${cardHtml}</div>
      <div style="font-size:14px;font-weight:700;color:var(--vscode-foreground);margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--vscode-panel-border);">${window.t('dash.maintainerActivity')}</div>
      ${maintHtml}
    </div>
  `;

  const btnSelect = elDashboardView.querySelector('#btn-select-manual-req');
  const btnClear = elDashboardView.querySelector('#btn-clear-manual-req');
  if (btnSelect) {
    btnSelect.addEventListener('click', () => {
      window.vscode.postMessage({ type: 'selectManualRequirements' });
    });
  }
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      window.vscode.postMessage({ type: 'clearManualRequirements' });
    });
  }

  elDashboardView.querySelectorAll('.dash-dep-path--copy').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pathText = btn.dataset.path || '';
      if (!pathText) return;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(pathText);
        } else {
          const ta = document.createElement('textarea');
          ta.value = pathText;
          ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        window.showCopyToast?.(window.t('toast.copied') || '✓ Copied');
      } catch {
        window.showCopyToast?.(window.t('toast.copyFailed') || '⚠ Copy failed');
      }
    });
  });
};
