/**
 * Package table confirmation dialogs.
 */

/**
 * Confirm before Align/Sync. Optionally warns when sync would tighten a range to `==`.
 * @param {() => void} onSync
 * @param {Array<{ name?: string, specifiedVersion?: string }>|undefined} packages
 */
window.showSyncConfirmDialog = function (onSync, packages) {
  document.getElementById('sync-confirm-dialog')?.remove();

  const t = window.t || (k => k);
  const list = Array.isArray(packages) ? packages : [];
  const tightenCount = list.filter(p =>
    window.wouldTightenToExactPin?.(p?.specifiedVersion ?? '')
  ).length;
  const rangeWarning = tightenCount > 0
    ? `<div style="font-size:12px;color:var(--vscode-editorWarning-foreground,#d29922);margin-bottom:16px;line-height:1.5;padding:8px 10px;border-radius:6px;background:rgba(210,153,34,.1);border:1px solid rgba(210,153,34,.35);">
        ${t('sync.rangeTightenWarning').replace('{n}', String(tightenCount))}
      </div>`
    : '';

  const dialog = document.createElement('div');
  dialog.id = 'sync-confirm-dialog';
  dialog.style.cssText = `
    position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,.55);backdrop-filter:blur(4px);opacity:0;transition:opacity .15s ease;
  `;
  dialog.innerHTML = `
    <div style="
      background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));
      border:1px solid var(--vscode-panel-border);border-radius:12px;padding:28px 32px;
      max-width:420px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.4);
    ">
      <div style="font-size:16px;font-weight:700;color:var(--vscode-foreground);margin-bottom:8px;">
        ${t('sync.confirmTitle')}
      </div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:12px;line-height:1.5;">
        ${t('sync.confirmMessage')}
      </div>
      ${rangeWarning}
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="sync-dialog-snapshot" style="
          flex:1;min-width:120px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);
          border:none;padding:9px 14px;border-radius:6px;font-size:12px;font-weight:600;
          cursor:pointer;font-family:inherit;
        ">${t('sync.snapshotFirst')}</button>
        <button id="sync-dialog-direct" style="
          flex:1;min-width:120px;background:rgba(96,165,250,.15);color:#60a5fa;
          border:1px solid rgba(96,165,250,.3);padding:9px 14px;border-radius:6px;
          font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;
        ">${t('sync.justSync')}</button>
        <button id="sync-dialog-cancel" style="
          flex:1;min-width:80px;background:transparent;color:var(--vscode-descriptionForeground);
          border:1px solid var(--vscode-panel-border);padding:9px 14px;border-radius:6px;
          font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;
        ">${t('sync.cancel')}</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);
  requestAnimationFrame(() => { dialog.style.opacity = '1'; });

  const onKeydown = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKeydown, true);

  const close = () => {
    dialog.remove();
    document.removeEventListener('keydown', onKeydown, true);
  };

  document.getElementById('sync-dialog-snapshot').addEventListener('click', () => {
    close();
    const snapName = `Pre-sync ${new Date().toLocaleString()}`;
    window.vscode.postMessage({ type: 'takeSnapshot', name: snapName });
    const onSnapshotDone = (event) => {
      if (event.data?.type === 'snapshots') {
        window.removeEventListener('message', onSnapshotDone);
        onSync();
      }
    };
    window.addEventListener('message', onSnapshotDone);
  });

  document.getElementById('sync-dialog-direct').addEventListener('click', () => {
    close();
    onSync();
  });

  document.getElementById('sync-dialog-cancel').addEventListener('click', close);
  dialog.addEventListener('click', e => {
    if (e.target === dialog) close();
  });
};

window.showForceUpdateConfirmDialog = function (packageName, onConfirm) {
  document.getElementById('force-update-confirm-dialog')?.remove();

  const t = window.t || (k => k);
  const dialog = document.createElement('div');
  dialog.id = 'force-update-confirm-dialog';
  dialog.style.cssText = `
    position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,.55);backdrop-filter:blur(4px);opacity:0;transition:opacity .15s ease;
  `;
  dialog.innerHTML = `
    <div style="
      background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));
      border:1px solid var(--vscode-panel-border);border-radius:12px;padding:28px 32px;
      max-width:440px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.4);
    ">
      <div style="font-size:16px;font-weight:700;color:var(--vscode-foreground);margin-bottom:8px;">
        ${t('forceUpdate.confirmTitle')}
      </div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:20px;line-height:1.5;">
        ${t('forceUpdate.confirmMessage').replace('{name}', window.esc(packageName))}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="force-update-confirm" style="
          flex:1;min-width:120px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);
          border:none;padding:9px 14px;border-radius:6px;font-size:12px;font-weight:600;
          cursor:pointer;font-family:inherit;
        ">${t('btn.forceUpdate')}</button>
        <button id="force-update-cancel" style="
          flex:1;min-width:80px;background:transparent;color:var(--vscode-descriptionForeground);
          border:1px solid var(--vscode-panel-border);padding:9px 14px;border-radius:6px;
          font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;
        ">${t('sync.cancel')}</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);
  requestAnimationFrame(() => { dialog.style.opacity = '1'; });

  const close = () => dialog.remove();
  document.getElementById('force-update-confirm')?.addEventListener('click', () => {
    close();
    onConfirm();
  });
  document.getElementById('force-update-cancel')?.addEventListener('click', close);
  dialog.addEventListener('click', e => {
    if (e.target === dialog) close();
  });
};

window.showVersionInstallConfirmDialog = function (packageName, version, onConfirm) {
  document.getElementById('version-install-confirm-dialog')?.remove();

  const t = window.t || (k => k);
  const dialog = document.createElement('div');
  dialog.id = 'version-install-confirm-dialog';
  dialog.style.cssText = `
    position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,.55);backdrop-filter:blur(4px);opacity:0;transition:opacity .15s ease;
  `;
  dialog.innerHTML = `
    <div style="
      background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));
      border:1px solid var(--vscode-panel-border);border-radius:12px;padding:28px 32px;
      max-width:440px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.4);
    ">
      <div style="font-size:16px;font-weight:700;color:var(--vscode-foreground);margin-bottom:8px;">
        ${t('versionInstall.confirmTitle')}
      </div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:20px;line-height:1.5;">
        ${t('versionInstall.confirmMessage')
          .replace('{name}', window.esc(packageName))
          .replace('{version}', window.esc(version))}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="version-install-confirm" style="
          flex:1;min-width:120px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);
          border:none;padding:9px 14px;border-radius:6px;font-size:12px;font-weight:600;
          cursor:pointer;font-family:inherit;
        ">${t('versionInstall.confirmBtn')}</button>
        <button id="version-install-cancel" style="
          flex:1;min-width:80px;background:transparent;color:var(--vscode-descriptionForeground);
          border:1px solid var(--vscode-panel-border);padding:9px 14px;border-radius:6px;
          font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;
        ">${t('sync.cancel')}</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);
  requestAnimationFrame(() => { dialog.style.opacity = '1'; });

  const close = () => dialog.remove();
  document.getElementById('version-install-confirm')?.addEventListener('click', () => {
    close();
    onConfirm();
  });
  document.getElementById('version-install-cancel')?.addEventListener('click', close);
  dialog.addEventListener('click', e => {
    if (e.target === dialog) close();
  });
};

/**
 * Pin a package to a chosen PyPI version (install if needed + == in file + hold updates).
 * @param {object} pkg
 * @param {(version: string) => void} onConfirm
 */
window.showPinVersionDialog = function (pkg, onConfirm) {
  document.getElementById('pin-version-dialog')?.remove();

  const t = window.t || (k => k);
  const esc = window.esc || (s => String(s ?? ''));
  const installed = pkg.installedVersion || '';
  const versions = [...(pkg.allVersions || [])];
  if (installed && !versions.includes(installed)) {
    versions.unshift(installed);
  }
  if (!versions.length) {
    return;
  }

  const optionsHtml = versions.map(v => {
    const selected = v === installed ? ' selected' : '';
    const label = v === installed ? `${esc(v)} (${t('pin.installedSuffix')})` : esc(v);
    return `<option value="${esc(v)}"${selected}>${label}</option>`;
  }).join('');

  const tightenWarning = window.wouldTightenToExactPin?.(pkg.specifiedVersion ?? '')
    ? `<div style="font-size:12px;color:var(--vscode-editorWarning-foreground,#d29922);margin-bottom:16px;line-height:1.5;padding:8px 10px;border-radius:6px;background:rgba(210,153,34,.1);border:1px solid rgba(210,153,34,.35);">
        ${t('pin.rangeTightenWarning')}
      </div>`
    : '';

  const dialog = document.createElement('div');
  dialog.id = 'pin-version-dialog';
  dialog.style.cssText = `
    position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;
    background:rgba(0,0,0,.55);backdrop-filter:blur(4px);opacity:0;transition:opacity .15s ease;
  `;
  dialog.innerHTML = `
    <div style="
      background:var(--vscode-editorWidget-background,var(--vscode-sideBar-background));
      border:1px solid var(--vscode-panel-border);border-radius:12px;padding:28px 32px;
      max-width:440px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.4);
    ">
      <div style="font-size:16px;font-weight:700;color:var(--vscode-foreground);margin-bottom:8px;">
        ${t('pin.dialogTitle')}
      </div>
      <div style="font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:12px;line-height:1.5;">
        ${t('pin.dialogMessage').replace('{name}', esc(pkg.name))}
      </div>
      ${tightenWarning}
      <label style="display:block;font-size:11px;font-weight:600;margin-bottom:6px;color:var(--vscode-descriptionForeground);">
        ${t('pin.versionLabel')}
      </label>
      <select id="pin-version-select" class="pin-version-select">${optionsHtml}</select>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button id="pin-dialog-confirm" style="
          flex:1;min-width:120px;background:var(--vscode-button-background);color:var(--vscode-button-foreground);
          border:none;padding:9px 14px;border-radius:6px;font-size:12px;font-weight:600;
          cursor:pointer;font-family:inherit;
        ">${t('pin.confirmBtn')}</button>
        <button id="pin-dialog-cancel" style="
          flex:1;min-width:80px;background:transparent;color:var(--vscode-descriptionForeground);
          border:1px solid var(--vscode-panel-border);padding:9px 14px;border-radius:6px;
          font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;
        ">${t('sync.cancel')}</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);
  requestAnimationFrame(() => { dialog.style.opacity = '1'; });

  const onKeydown = (e) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKeydown, true);

  const close = () => {
    dialog.remove();
    document.removeEventListener('keydown', onKeydown, true);
  };

  document.getElementById('pin-dialog-confirm')?.addEventListener('click', () => {
    const select = document.getElementById('pin-version-select');
    const version = select && select.value;
    close();
    if (version) onConfirm(version);
  });
  document.getElementById('pin-dialog-cancel')?.addEventListener('click', close);
  dialog.addEventListener('click', e => {
    if (e.target === dialog) close();
  });
};

