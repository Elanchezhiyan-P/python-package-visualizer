/**
 * Snapshots View Renderer.
 * Manages package environment snapshots, enabling saving, restoring, deleting,
 * and viewing snapshot detail states (packages + versions).
 */

/**
 * Compiles and renders the Environment Snapshots management layout.
 * Lists all snapshots saved in the workspace, with restore, delete, and view binds.
 * 
 * @returns {void}
 */
window.renderSnapshots = function () {
  const elViewSnapshots = document.getElementById('view-snapshots');
  if (!elViewSnapshots) return;
  const snaps = window.snapshots || [];

  const defaultName = `Snapshot ${new Date().toLocaleString()}`;
  const takeBtn = `
    <div style="display:flex;gap:8px;align-items:stretch;background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:8px;padding:12px;">
      <input id="snap-name-input" type="text" placeholder="Snapshot name..." value="${window.esc(defaultName)}"
        style="flex:1;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,var(--vscode-panel-border));border-radius:6px;padding:8px 12px;font-size:12px;font-family:inherit;outline:none;" />
      <button id="btn-take-snapshot-new" style="background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:8px 18px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;">
        \u{1F4F8} ${window.t('snap.take')}
      </button>
    </div>
  `;

  let bodyHtml;
  if (snaps.length === 0) {
    bodyHtml = `
      <div style="text-align:center;padding:80px 20px;background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px dashed var(--vscode-panel-border);border-radius:10px;margin-top:24px;">
        <div style="font-size:42px;margin-bottom:12px;opacity:.5;">\u{1F4F8}</div>
        <div style="font-size:14px;font-weight:600;color:var(--vscode-foreground);">${window.t('snap.noSnapshotsTitle')}</div>
        <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:6px;max-width:420px;margin-left:auto;margin-right:auto;line-height:1.5;">${window.t('snap.noSnapshots')}</div>
      </div>
    `;
  } else {
    bodyHtml = `<div style="display:grid;gap:12px;margin-top:20px;">` +
      snaps.map(s => {
        const date = s.createdAt ? new Date(s.createdAt).toLocaleString() : '';
        const pkgs = s.packages;
        let count = 0;
        if (Array.isArray(pkgs)) count = pkgs.length;
        else if (pkgs && typeof pkgs === 'object') count = Object.keys(pkgs).length;
        return `
          <div class="snap-card" data-snap-id="${window.esc(s.id || '')}">
            <div style="background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));border:1px solid var(--vscode-panel-border);border-radius:10px;padding:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
              <div style="flex:1;min-width:0;display:flex;align-items:center;gap:12px;">
                <div style="font-size:22px;flex-shrink:0;">\u{1F4F8}</div>
                <div style="min-width:0;flex:1;">
                  <div style="font-weight:600;font-size:13px;color:var(--vscode-foreground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${window.esc(s.name || 'Snapshot')}</div>
                  <div style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:4px;">${window.esc(date)} \u00B7 ${count} ${window.t('snap.packages')}</div>
                </div>
              </div>
              <div style="display:flex;gap:8px;flex-shrink:0;">
                <button class="snap-view-btn" data-id="${window.esc(s.id || '')}" style="background:rgba(168,85,247,.15);color:#a855f7;border:1px solid rgba(168,85,247,.3);padding:6px 12px;border-radius:4px;font-size:11px;cursor:pointer;font-family:inherit;font-weight:600;">${window.t('snap.view')}</button>
                <button class="snap-restore-btn" data-id="${window.esc(s.id || '')}" style="background:rgba(74,222,128,.15);color:#4ade80;border:1px solid rgba(74,222,128,.3);padding:6px 12px;border-radius:4px;font-size:11px;cursor:pointer;font-family:inherit;font-weight:600;">\u21BB ${window.t('snap.restore')}</button>
                <button class="snap-delete-btn" data-id="${window.esc(s.id || '')}" style="background:rgba(248,113,113,.15);color:#f87171;border:1px solid rgba(248,113,113,.3);padding:6px 12px;border-radius:4px;font-size:11px;cursor:pointer;font-family:inherit;font-weight:600;">\u{1F5D1} ${window.t('snap.delete')}</button>
              </div>
            </div>
            <div class="snap-detail-panel" data-for-id="${window.esc(s.id || '')}" style="display:none;"></div>
          </div>
        `;
      }).join('') +
      `</div>`;
  }

  elViewSnapshots.innerHTML = `
    <div style="max-width:900px;margin:0 auto;padding:24px;width:100%;box-sizing:border-box;">
      <div style="font-size:20px;font-weight:700;color:var(--vscode-foreground);margin-bottom:4px;">${window.t('tab.snapshots')}</div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:20px;">${window.t('snap.subtitle')}</div>
      ${takeBtn}
      ${bodyHtml}
    </div>
  `;

  // Wire up buttons
  const newBtn = document.getElementById('btn-take-snapshot-new');
  const nameInput = document.getElementById('snap-name-input');
  if (newBtn && nameInput) {
    const triggerSnapshot = () => {
      const name = nameInput.value.trim() || `Snapshot ${new Date().toLocaleString()}`;
      window.vscode.postMessage({ type: 'takeSnapshot', name });
    };
    newBtn.addEventListener('click', triggerSnapshot);
    nameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        triggerSnapshot();
      }
    });
  }

  // View / expand detail toggle
  elViewSnapshots.querySelectorAll('.snap-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (!id) return;
      const panel = elViewSnapshots.querySelector(`.snap-detail-panel[data-for-id="${CSS.escape(id)}"]`);
      if (!panel) return;

      const isOpen = panel.style.display !== 'none';
      if (isOpen) {
        panel.style.display = 'none';
        btn.textContent = window.t('snap.view');
      } else {
        // Build the package detail table from snapshot data
        const snap = snaps.find(s => s.id === id);
        if (!snap || !snap.packages) return;

        const entries = Array.isArray(snap.packages)
          ? snap.packages.map(p => [p.name || p, p.version || ''])
          : Object.entries(snap.packages);

        entries.sort((a, b) => a[0].localeCompare(b[0]));

        const rows = entries.map(([name, version]) => `
          <tr style="border-bottom:1px solid color-mix(in srgb, var(--vscode-panel-border) 40%, transparent);">
            <td style="padding:7px 14px;font-weight:600;font-size:12px;color:var(--vscode-foreground);">${window.esc(name)}</td>
            <td style="padding:7px 14px;font-family:var(--vscode-editor-font-family,monospace);font-size:11px;color:var(--vscode-descriptionForeground);">${window.esc(version)}</td>
          </tr>
        `).join('');

        panel.innerHTML = `
          <div style="
            margin-top:4px;background:var(--vscode-editor-background);border:1px solid var(--vscode-panel-border);
            border-top:none;border-radius:0 0 10px 10px;overflow:hidden;max-height:400px;overflow-y:auto;
          ">
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="background:color-mix(in srgb, var(--vscode-panel-border) 20%, transparent);">
                  <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('snap.detailPkg')}</th>
                  <th style="padding:10px 14px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;color:var(--vscode-descriptionForeground);letter-spacing:.5px;">${window.t('snap.detailVer')}</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <div style="padding:8px 14px;font-size:10px;color:var(--vscode-descriptionForeground);text-align:right;border-top:1px solid color-mix(in srgb, var(--vscode-panel-border) 40%, transparent);">
              ${entries.length} ${window.t('snap.packages')}
            </div>
          </div>
        `;
        panel.style.display = 'block';
        btn.textContent = window.t('snap.hide');
      }
    });
  });

  elViewSnapshots.querySelectorAll('.snap-restore-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (id) {
        window.vscode.postMessage({ type: 'restoreSnapshot', id, confirm: true });
      }
    });
  });
  elViewSnapshots.querySelectorAll('.snap-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (id) {
        window.vscode.postMessage({ type: 'deleteSnapshot', id, confirm: true });
      }
    });
  });
};
