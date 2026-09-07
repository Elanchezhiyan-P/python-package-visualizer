/**
 * Update History View Renderer.
 * Groups environment operations (installations, rollbacks, updates) into chronological buckets.
 */

/**
 * Compiles and renders a chronological history list of updates and rollbacks.
 * Groups events together under Today, Yesterday, This Week, and Earlier headers.
 * 
 * @returns {void}
 */
window.renderHistory = function () {
  const elHistoryView = document.getElementById('view-history');
  if (!elHistoryView) return;

  const historyEntries = window.historyEntries || [];

  const wrapStart = `<div style="max-width:820px;margin:0 auto;width:100%;padding:24px;">
    <div style="font-size:20px;font-weight:700;margin-bottom:4px;color:var(--vscode-foreground);">${window.t('history.title')}</div>
    <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:24px;">${window.t('history.subtitle')}</div>`;
  const wrapEnd = `</div>`;

  if (!historyEntries || historyEntries.length === 0) {
    elHistoryView.innerHTML = wrapStart + `
      <div style="text-align:center;padding:80px 20px;color:var(--vscode-descriptionForeground);background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px dashed var(--vscode-panel-border);border-radius:8px;">
        <div style="font-size:42px;margin-bottom:12px;opacity:.5;">&#x1F553;</div>
        <div style="font-size:14px;font-weight:600;color:var(--vscode-foreground);">${window.t('history.noHistory')}</div>
        <div style="font-size:11px;margin-top:6px;">${window.t('history.noHistoryDesc')}</div>
      </div>
    ` + wrapEnd;
    return;
  }

  const now              = new Date();
  const startOfToday     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday); startOfYesterday.setDate(startOfToday.getDate() - 1);
  const startOfWeek      = new Date(startOfToday); startOfWeek.setDate(startOfToday.getDate() - 7);

  /** Categorizes dynamic timestamps into relative date group headers */
  function dateGroup(dateStr) {
    try {
      const d = new Date(dateStr);
      if (d >= startOfToday)     return 'Today';
      if (d >= startOfYesterday) return 'Yesterday';
      if (d >= startOfWeek)      return 'This Week';
      return 'Earlier';
    } catch { return 'Earlier'; }
  }

  const actionMeta = {
    'pip-install':  { label: window.t('history.installedUpdated'), icon: '&#x2B07;',  color: '#4ade80' },
    'pip-rollback': { label: window.t('history.rolledBack'),         icon: '&#x21A9;',  color: '#60a5fa' },
    'detected':     { label: window.t('history.detected'),            icon: '&#x1F4CC;', color: '#94a3b8' },
  };

  const groupOrder = ['Today', 'Yesterday', 'This Week', 'Earlier'];
  const groups = {};
  for (const entry of historyEntries) {
    const g = dateGroup(entry.installedAt);
    if (!groups[g]) groups[g] = [];
    groups[g].push(entry);
  }

  let html = wrapStart;
  for (const groupName of groupOrder) {
    if (!groups[groupName]) continue;
    html += `<div style="font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--vscode-descriptionForeground);padding:14px 0 8px;opacity:.7;">${groupName}</div>`;
    html += `<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:8px;">`;

    for (const entry of groups[groupName]) {
      const meta = actionMeta[entry.source] || actionMeta.detected;
      let timeStr = '';
      try { timeStr = new Date(entry.installedAt).toLocaleString(); } catch { timeStr = entry.installedAt || ''; }

      html += `
        <div style="display:flex;gap:12px;padding:12px 14px;background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-left:3px solid ${meta.color};border-radius:0 8px 8px 0;">
          <div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;background:${meta.color}22;color:${meta.color};">${meta.icon}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span style="font-weight:600;font-size:13px;color:var(--vscode-foreground);">${window.esc(entry.packageName)}</span>
              <span style="font-size:11px;color:var(--vscode-descriptionForeground);">${meta.label} to</span>
              <code style="font-family:var(--vscode-editor-font-family,monospace);font-size:11px;background:var(--vscode-badge-background);color:var(--vscode-badge-foreground);padding:2px 7px;border-radius:4px;">${window.esc(entry.version)}</code>
            </div>
            <div style="font-size:10.5px;color:var(--vscode-descriptionForeground);margin-top:4px;">${window.esc(timeStr)}</div>
          </div>
        </div>
      `;
    }
    html += `</div>`;
  }
  html += wrapEnd;
  elHistoryView.innerHTML = html;
};
