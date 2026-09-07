/** Bulk selection bar and per-row progress helpers for the package table. */

window.updateBulkBar = function () {
  const elBulkBar = document.getElementById('bulk-bar');
  const elBulkCount = document.getElementById('bulk-count');
  const elCheckAll = document.getElementById('check-all');
  const elBulkInstall = document.getElementById('bulk-install');
  const elBulkUpdate = document.getElementById('bulk-update');
  const elBulkSync = document.getElementById('bulk-sync');

  if (!elBulkBar) return;

  const t = window.t || (k => k);

  if (window.selectedPackages.size > 0) {
    elBulkBar.classList.add('visible');
    if (elBulkCount) elBulkCount.textContent = `${window.selectedPackages.size} ${t('bulk.selected')}`;

    const selectedList = [...window.selectedPackages]
      .map(name => window.allPackages.find(p => p.name === name))
      .filter(Boolean);

    const installsCount = selectedList.filter(p => p.status === 'not-installed').length;
    const updatesCount = selectedList.filter(p => p.status === 'update-available' && !p.updateBlockedByConflict).length;
    const syncsCount = selectedList.filter(p => {
      if (p.specifiedVersion && p.installedVersion) {
        return window.hasDrift(p.specifiedVersion, p.installedVersion);
      }
      return false;
    }).length;

    if (elBulkInstall) {
      if (installsCount > 0) {
        elBulkInstall.style.display = '';
        elBulkInstall.textContent = `${t('bulk.installSelected')} (${installsCount})`;
      } else {
        elBulkInstall.style.display = 'none';
      }
    }

    if (elBulkUpdate) {
      if (updatesCount > 0) {
        elBulkUpdate.style.display = '';
        elBulkUpdate.textContent = `${t('bulk.updateSelected')} (${updatesCount})`;
      } else {
        elBulkUpdate.style.display = 'none';
      }
    }

    if (elBulkSync) {
      if (syncsCount > 0) {
        elBulkSync.style.display = '';
        elBulkSync.textContent = `${t('bulk.syncSelected')} (${syncsCount})`;
      } else {
        elBulkSync.style.display = 'none';
      }
    }
  } else {
    elBulkBar.classList.remove('visible');
  }

  if (elCheckAll) {
    const filtered = window.getFiltered();
    elCheckAll.checked = filtered.length > 0 && filtered.every(p => window.selectedPackages.has(p.name));
    elCheckAll.indeterminate = window.selectedPackages.size > 0 && !elCheckAll.checked;
  }
};

window.updateRowProgress = function (pkgName, stage, percent) {
  const tbody = document.getElementById('pkg-table-body');
  if (!tbody) return;
  const tr = tbody.querySelector(`tr[data-name="${CSS.escape(pkgName)}"]`);
  if (!tr) return;

  if (percent >= 100) {
    tr.removeAttribute('data-progress');
    tr.style.removeProperty('--row-progress');
    tr.querySelector('.progress-stage')?.remove();
    window.vscode.postMessage({ type: 'refresh' });
  } else {
    tr.setAttribute('data-progress', '1');
    tr.style.setProperty('--row-progress', `${percent}%`);
    const actGroup = tr.querySelector('.act-group');
    if (actGroup) {
      let stageEl = tr.querySelector('.progress-stage');
      if (!stageEl) {
        stageEl = document.createElement('span');
        stageEl.className = 'progress-stage';
        actGroup.appendChild(stageEl);
      }
      stageEl.textContent = stage;
    }
  }
};
