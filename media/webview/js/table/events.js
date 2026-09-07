/** Binds interactive listeners on rendered package table rows. */
window.bindTableRowEvents = function (tbody) {
  tbody.querySelectorAll('.pkg-check').forEach(chk => {
    chk.addEventListener('change', e => {
      e.stopPropagation();
      const name = chk.dataset.name;
      if (chk.checked) {
        window.selectedPackages.add(name);
      } else {
        window.selectedPackages.delete(name);
      }
      window.updateBulkBar();
    });
  });

  tbody.querySelectorAll('.pkg-detail-trigger').forEach(trigger => {
    trigger.addEventListener('click', e => {
      e.stopPropagation();
      const pkg = window.allPackages.find(p => p.name === trigger.dataset.name);
      if (pkg && typeof window.showDetail === 'function') {
        window.showDetail(pkg);
      }
    });
  });

  tbody.querySelectorAll('.rollback-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const name = btn.dataset.name;
      const version = btn.dataset.version;
      if (name && version) {
        window.showVersionInstallConfirmDialog?.(name, version, () => {
          btn.disabled = true;
          btn.innerHTML = `<span class="btn-spinner"></span>${window.t('btn.reverting')}`;
          window.vscode.postMessage({
            type: 'rollbackPackage',
            name,
            version,
            dueToIncompatibility: btn.dataset.dueIncompat === '1',
          });
        });
      }
    });
  });

  tbody.querySelectorAll('.force-update-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const name = btn.dataset.name;
      if (!name) return;
      window.showForceUpdateConfirmDialog?.(name, () => {
        btn.disabled = true;
        btn.innerHTML = `<span class="btn-spinner"></span>${window.t('btn.updating')}`;
        window.vscode.postMessage({ type: 'forceUpdatePackage', name });
      });
    });
  });

  tbody.querySelectorAll('.update-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const name = btn.dataset.name;
      if (name) {
        btn.disabled = true;
        btn.innerHTML = `<span class="btn-spinner"></span>${window.t('btn.updating')}`;
        window.vscode.postMessage({ type: 'updatePackage', name });
      }
    });
  });

  tbody.querySelectorAll('.ignore-update-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const name = btn.dataset.name;
      const latestVersion = btn.dataset.latest;
      if (name && latestVersion) {
        btn.disabled = true;
        window.vscode.postMessage({ type: 'ignorePackageUpdate', name, latestVersion });
      }
    });
  });

  tbody.querySelectorAll('.unignore-update-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const name = btn.dataset.name;
      if (name) {
        btn.disabled = true;
        window.vscode.postMessage({ type: 'unignorePackageUpdate', name });
      }
    });
  });

  tbody.querySelectorAll('.install-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const name = btn.dataset.name;
      if (name) {
        btn.disabled = true;
        btn.innerHTML = `<span class="btn-spinner"></span>${window.t('btn.installing')}`;
        window.vscode.postMessage({ type: 'installNew', name });
      }
    });
  });

  tbody.querySelectorAll('.sync-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const name = btn.dataset.name;
      const source = btn.dataset.source;
      if (name) {
        const pkg = window.allPackages.find(p => p.name === name);
        const packagesMeta = pkg
          ? [{ name: pkg.name, specifiedVersion: pkg.specifiedVersion || '' }]
          : [];
        window.showSyncConfirmDialog(() => {
          btn.disabled = true;
          btn.innerHTML = `<span class="btn-spinner"></span>...`;
          window.vscode.postMessage({ type: 'syncRequirementsToInstalled', name, source });
        }, packagesMeta);
      }
    });
  });

  tbody.querySelectorAll('.pin-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const name = btn.dataset.name;
      const pkg = window.allPackages.find(p => p.name === name);
      if (!pkg) return;
      window.showPinVersionDialog?.(pkg, version => {
        btn.disabled = true;
        window.vscode.postMessage({
          type: 'pinPackageToVersion',
          name: pkg.name,
          version,
          source: pkg.source || '',
        });
      });
    });
  });

  tbody.querySelectorAll('.unpin-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const name = btn.dataset.name;
      if (name) {
        btn.disabled = true;
        window.vscode.postMessage({ type: 'unpinPackage', name });
      }
    });
  });
};
