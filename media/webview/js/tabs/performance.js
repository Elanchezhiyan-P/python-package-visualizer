/**
 * Install Performance View Renderer.
 * Measures package install times and files sizes, providing clean analytics regarding install bottlenecks.
 */

/**
 * Compiles and renders installation speeds and file-size bar rankings.
 * Shows timed installs when available; otherwise ranks packages by PyPI wheel size.
 *
 * @param {Array<object>} filtered - The filtered set of package items.
 * @returns {void}
 */
window.renderPerformance = function (filtered) {
  const elPerfView = document.getElementById('view-performance');
  if (!elPerfView) return;

  const allPackages = window.allPackages || [];
  const tracked = allPackages.filter(p => p.installTime && p.installTime > 0);
  const sized = allPackages.filter(p => p.installSize && p.installSize > 0);
  const fastCount = tracked.filter(p => p.installTime <= 1).length;
  const modCount  = tracked.filter(p => p.installTime > 1 && p.installTime <= 5).length;
  const slowCount = tracked.filter(p => p.installTime > 5).length;

  const formatSize = (bytes) => {
    if (!bytes || bytes <= 0) return '—';
    const mb = bytes / (1024 * 1024);
    if (mb >= 0.1) return `${mb.toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  const summaryHtml = `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
      <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:10px;text-transform:uppercase;font-weight:600;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('perf.fast')} (&lt;1s)</div>
        <div style="font-size:26px;font-weight:700;margin-top:6px;color:#4ade80;">${fastCount}</div>
      </div>
      <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:10px;text-transform:uppercase;font-weight:600;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('perf.moderate')} (1-5s)</div>
        <div style="font-size:26px;font-weight:700;margin-top:6px;color:#fb923c;">${modCount}</div>
      </div>
      <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:10px;text-transform:uppercase;font-weight:600;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('perf.slow')} (&gt;5s)</div>
        <div style="font-size:26px;font-weight:700;margin-top:6px;color:#f87171;">${slowCount}</div>
      </div>
    </div>
  `;

  let bodyHtml;
  if (tracked.length > 0) {
    const maxTime = Math.max(...tracked.map(p => p.installTime));
    const sorted = [...tracked].sort((a, b) => b.installTime - a.installTime).slice(0, 20);

    const rows = sorted.map(pkg => {
      const time = pkg.installTime;
      let color = '#4ade80', label = window.t('perf.fast');
      if (time > 5)      { color = '#f87171'; label = window.t('perf.slow'); }
      else if (time > 1) { color = '#fb923c'; label = window.t('perf.moderate'); }
      const widthPct = Math.max(10, (time / maxTime) * 100);
      return `
        <tr style="border-bottom:1px solid color-mix(in srgb, var(--vscode-panel-border) 40%, transparent);">
          <td style="padding:14px 16px;font-weight:600;">${window.esc(pkg.name)}</td>
          <td style="padding:14px 16px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="width:${widthPct}px;height:6px;border-radius:3px;background:${color};min-width:20px;"></div>
              <span>${time.toFixed(2)}s</span>
            </div>
          </td>
          <td style="padding:14px 16px;"><span style="display:inline-block;padding:3px 10px;border-radius:12px;font-size:10px;font-weight:600;background:${color}22;color:${color};">${label}</span></td>
          <td style="padding:14px 16px;text-align:right;color:var(--vscode-descriptionForeground);">${formatSize(pkg.installSize)}</td>
        </tr>
      `;
    }).join('');

    bodyHtml = `
      <table style="width:100%;border-collapse:collapse;background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:var(--vscode-editorGroupHeader-tabsBackground);">
            <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--vscode-descriptionForeground);">${window.t('perf.package')}</th>
            <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--vscode-descriptionForeground);">${window.t('perf.installTime')}</th>
            <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--vscode-descriptionForeground);">${window.t('perf.speed')}</th>
            <th style="padding:12px 16px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--vscode-descriptionForeground);">${window.t('perf.sizeMB')}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  } else if (sized.length > 0) {
    const maxSize = Math.max(...sized.map(p => p.installSize));
    const sorted = [...sized].sort((a, b) => b.installSize - a.installSize).slice(0, 20);
    const rows = sorted.map(pkg => {
      const widthPct = Math.max(10, (pkg.installSize / maxSize) * 100);
      return `
        <tr style="border-bottom:1px solid color-mix(in srgb, var(--vscode-panel-border) 40%, transparent);">
          <td style="padding:14px 16px;font-weight:600;">${window.esc(pkg.name)}</td>
          <td style="padding:14px 16px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <div style="width:${widthPct}px;height:6px;border-radius:3px;background:var(--vscode-charts-blue,#60a5fa);min-width:20px;"></div>
              <span>${formatSize(pkg.installSize)}</span>
            </div>
          </td>
          <td style="padding:14px 16px;text-align:right;color:var(--vscode-descriptionForeground);">—</td>
        </tr>
      `;
    }).join('');

    bodyHtml = `
      <div style="margin-bottom:12px;padding:10px 14px;border-radius:6px;background:color-mix(in srgb, var(--vscode-editorInfo-foreground,#3794ff) 12%, transparent);color:var(--vscode-foreground);font-size:12px;">
        ${window.t('perf.sizeOnlyHint')}
      </div>
      <table style="width:100%;border-collapse:collapse;background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:var(--vscode-editorGroupHeader-tabsBackground);">
            <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--vscode-descriptionForeground);">${window.t('perf.package')}</th>
            <th style="padding:12px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--vscode-descriptionForeground);">${window.t('perf.sizeMB')}</th>
            <th style="padding:12px 16px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--vscode-descriptionForeground);">${window.t('perf.installTime')}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  } else {
    bodyHtml = `
      <div style="text-align:center;padding:80px 20px;color:var(--vscode-descriptionForeground);background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px dashed var(--vscode-panel-border);border-radius:8px;">
        <div style="font-size:42px;margin-bottom:12px;opacity:.5;">&#x23F1;&#xFE0F;</div>
        <div style="font-size:14px;font-weight:600;color:var(--vscode-foreground);">${window.t('perf.noData')}</div>
        <div style="font-size:11px;margin-top:6px;">${window.t('perf.noDataDesc')}</div>
      </div>
    `;
  }

  elPerfView.innerHTML = `
    <div style="max-width:1000px;margin:0 auto;width:100%;padding:24px;">
      <div style="font-size:20px;font-weight:700;margin-bottom:4px;color:var(--vscode-foreground);">${window.t('perf.title')}</div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:12px;">${window.t('perf.subtitle')}</div>
      <div style="margin-bottom:20px;padding:10px 14px;border-radius:6px;border:1px solid color-mix(in srgb, var(--vscode-editorInfo-foreground,#3794ff) 35%, var(--vscode-panel-border));background:color-mix(in srgb, var(--vscode-editorInfo-foreground,#3794ff) 10%, transparent);color:var(--vscode-foreground);font-size:12px;line-height:1.45;">
        ${window.t('perf.trackingNote')}
      </div>
      ${summaryHtml}
      ${bodyHtml}
    </div>
  `;
};
