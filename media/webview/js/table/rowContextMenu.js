/** Right-click context menu for package list rows. */

function ensureRowContextMenuEl() {
  let el = document.getElementById('pkg-row-context-menu');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'pkg-row-context-menu';
  el.className = 'pkg-row-context-menu';
  el.setAttribute('role', 'menu');
  document.body.appendChild(el);
  return el;
}

window.hidePackageRowContextMenu = function () {
  const el = document.getElementById('pkg-row-context-menu');
  if (el) el.classList.remove('open');
};

window.buildPackageRowMenuItems = function (pkg) {
  const t = window.t || (k => k);
  const items = [];

  items.push({ id: 'detail', label: t('menu.viewDetails') });

  const canUpdate = pkg.status === 'update-available';
  const isUpdateIgnored = pkg.status === 'update-ignored';
  const isConflictBlocked = pkg.status === 'conflict-blocked' || pkg.updateBlockedByConflict;
  const isMajor = window.isMajorJump?.(pkg.installedVersion, pkg.latestVersion) ?? false;
  const isLocked = window.safeMode && isMajor;

  let hasDrift = false;
  if (pkg.specifiedVersion && pkg.installedVersion && window.hasDrift?.(pkg.specifiedVersion, pkg.installedVersion)) {
    hasDrift = true;
  }

  const actionItems = [];

  if (canUpdate) {
    actionItems.push({
      id: 'update',
      label: t('btn.update'),
      disabled: isLocked,
      title: isLocked ? t('tag.majorLockTitle') : '',
    });
    actionItems.push({ id: 'ignore', label: t('btn.ignoreUpdate') });
  } else if (isUpdateIgnored) {
    actionItems.push({ id: 'unignore', label: t('btn.unignoreUpdate') });
  } else if (isConflictBlocked) {
    if (pkg.previousVersion) {
      actionItems.push({ id: 'revert', label: t('btn.revertPrevious') });
    }
    if (pkg.latestVersion && pkg.latestVersion !== 'unknown') {
      actionItems.push({ id: 'force-update', label: t('btn.forceUpdate') });
    }
  } else if (pkg.status === 'not-installed') {
    actionItems.push({ id: 'install', label: t('btn.install') });
  }

  if (hasDrift) {
    actionItems.push({ id: 'sync', label: t('btn.sync') });
  }

  if (pkg.pinnedVersion) {
    actionItems.push({ id: 'unpin', label: t('btn.unpin') });
  } else if (pkg.installedVersion) {
    actionItems.push({ id: 'pin', label: t('btn.pin') });
  }

  if (actionItems.length) {
    items.push({ separator: true });
    actionItems.forEach(item => items.push(item));
  }

  items.push({ separator: true });
  items.push({ id: 'pypi', label: t('menu.openPypi') });

  return items;
};

window.runPackageRowMenuAction = function (actionId, pkg) {
  const vscode = window.vscode;
  if (!pkg || !vscode) return;

  switch (actionId) {
    case 'detail':
      window.showDetail?.(pkg);
      break;
    case 'update':
      vscode.postMessage({ type: 'updatePackage', name: pkg.name });
      break;
    case 'install':
      vscode.postMessage({ type: 'installNew', name: pkg.name });
      break;
    case 'sync':
      const packagesMeta = [{ name: pkg.name, specifiedVersion: pkg.specifiedVersion || '' }];
      window.showSyncConfirmDialog?.(() => {
        vscode.postMessage({
          type: 'syncRequirementsToInstalled',
          name: pkg.name,
          source: pkg.source || '',
        });
      }, packagesMeta);
      break;
    case 'ignore':
      if (pkg.latestVersion) {
        vscode.postMessage({
          type: 'ignorePackageUpdate',
          name: pkg.name,
          latestVersion: pkg.latestVersion,
        });
      }
      break;
    case 'unignore':
      vscode.postMessage({ type: 'unignorePackageUpdate', name: pkg.name });
      break;
    case 'pin':
      window.showPinVersionDialog?.(pkg, version => {
        vscode.postMessage({
          type: 'pinPackageToVersion',
          name: pkg.name,
          version,
          source: pkg.source || '',
        });
      });
      break;
    case 'unpin':
      vscode.postMessage({ type: 'unpinPackage', name: pkg.name });
      break;
    case 'revert':
      if (!pkg.previousVersion) return;
      window.showVersionInstallConfirmDialog?.(pkg.name, pkg.previousVersion, () => {
        vscode.postMessage({
          type: 'rollbackPackage',
          name: pkg.name,
          version: pkg.previousVersion,
          dueToIncompatibility: true,
        });
      });
      break;
    case 'force-update':
      window.showForceUpdateConfirmDialog?.(pkg.name, () => {
        vscode.postMessage({ type: 'forceUpdatePackage', name: pkg.name });
      });
      break;
    case 'pypi':
      vscode.postMessage({ type: 'openUrl', url: `https://pypi.org/project/${pkg.name}` });
      break;
    default:
      break;
  }
};

window.showPackageRowContextMenu = function (clientX, clientY, pkg) {
  const menu = ensureRowContextMenuEl();
  const items = window.buildPackageRowMenuItems(pkg);
  const esc = window.esc || (s => String(s ?? ''));

  menu.innerHTML = items.map(item => {
    if (item.separator) {
      return '<div class="pkg-row-context-sep" role="separator"></div>';
    }
    const disabled = item.disabled ? ' disabled' : '';
    const title = item.title ? ` title="${esc(item.title)}"` : '';
    return `<button type="button" class="pkg-row-context-item" role="menuitem" data-action="${esc(item.id)}"${disabled}${title}>${esc(item.label)}</button>`;
  }).join('');

  menu.querySelectorAll('.pkg-row-context-item:not([disabled])').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      window.runPackageRowMenuAction(btn.dataset.action, pkg);
      window.hidePackageRowContextMenu();
    });
  });

  menu.classList.add('open');
  menu.style.visibility = 'hidden';
  const rect = menu.getBoundingClientRect();
  menu.style.visibility = '';
  const pad = 8;
  let left = clientX;
  let top = clientY;
  if (left + rect.width > window.innerWidth - pad) {
    left = Math.max(pad, window.innerWidth - rect.width - pad);
  }
  if (top + rect.height > window.innerHeight - pad) {
    top = Math.max(pad, window.innerHeight - rect.height - pad);
  }
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
};

window.initPackageRowContextMenu = function () {
  const tbody = document.getElementById('pkg-table-body');
  if (!tbody || tbody.dataset.ctxMenuBound === '1') return;
  tbody.dataset.ctxMenuBound = '1';

  tbody.addEventListener('contextmenu', e => {
    const row = e.target.closest('.pkg-row');
    if (!row) return;
    e.preventDefault();
    const pkg = window.allPackages?.find(p => p.name === row.dataset.name);
    if (!pkg) return;
    window.showPackageRowContextMenu(e.clientX, e.clientY, pkg);
  });
};
