/**
 * Unused-tab bulk bar, section check-all, and post-render event wiring.
 */

window.updateUnusedBulkBar = function () {
  const bar = document.getElementById('unused-bulk-bar');
  const countEl = document.getElementById('unused-bulk-count');
  const removeBtn = document.getElementById('unused-bulk-remove');
  if (!bar) return;

  const size = window.selectedUnusedPackages?.size ?? 0;
  if (size > 0) {
    bar.style.display = 'flex';
    if (countEl) {
      countEl.textContent = window.t('unused.selectedCount').replace('{n}', String(size));
    }
    if (removeBtn) {
      removeBtn.textContent = `${window.t('unused.removeSelected')} (${size})`;
    }
  } else {
    bar.style.display = 'none';
  }
};

window.syncUnusedSectionCheckAll = function (section, pkgNames) {
  const checkAll = document.querySelector(`.unused-check-all[data-section="${section}"]`);
  if (!checkAll || pkgNames.length === 0) return;

  const selectedInSection = pkgNames.filter(name => window.selectedUnusedPackages.has(name)).length;
  checkAll.checked = selectedInSection === pkgNames.length;
  checkAll.indeterminate = selectedInSection > 0 && selectedInSection < pkgNames.length;
};

window.bindUnusedTabEvents = function (elUnused, unused, likelyNames, uncertainNames, allUnusedNames) {
  const cursorBtn = document.getElementById('btn-cursor-ai-unused');
  if (cursorBtn) {
    cursorBtn.addEventListener('click', () => {
      cursorBtn.disabled = true;
      cursorBtn.textContent = window.t('unused.cursorAiRunning');
      window.vscode.postMessage({ type: 'cursorAnalyzeUnused', userInitiated: true });
    });
  }

  // Wire up Remove buttons
  elUnused.querySelectorAll('.unused-remove-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const name = btn.dataset.name;
      const source = btn.dataset.source;
      if (name) {
        window.vscode.postMessage({ type: 'removeFromRequirements', name, source });
      }
    });
  });

  elUnused.querySelectorAll('.unused-pkg-check').forEach(chk => {
    chk.addEventListener('change', () => {
      const name = chk.dataset.name;
      if (!name) return;
      if (chk.checked) {
        window.selectedUnusedPackages.add(name);
      } else {
        window.selectedUnusedPackages.delete(name);
      }
      window.updateUnusedBulkBar();
      const rowSection = likelyNames.includes(name) ? 'likely' : 'uncertain';
      window.syncUnusedSectionCheckAll(rowSection, rowSection === 'likely' ? likelyNames : uncertainNames);
    });
  });

  elUnused.querySelectorAll('.unused-check-all').forEach(checkAll => {
    checkAll.addEventListener('change', () => {
      const section = checkAll.dataset.section;
      const names = section === 'likely' ? likelyNames : uncertainNames;
      names.forEach(name => {
        if (checkAll.checked) {
          window.selectedUnusedPackages.add(name);
        } else {
          window.selectedUnusedPackages.delete(name);
        }
      });
      elUnused.querySelectorAll('.unused-pkg-check').forEach(chk => {
        const name = chk.dataset.name;
        if (names.includes(name)) {
          chk.checked = checkAll.checked;
        }
      });
      window.updateUnusedBulkBar();
      window.syncUnusedSectionCheckAll(section, names);
    });
  });

  window.syncUnusedSectionCheckAll('likely', likelyNames);
  window.syncUnusedSectionCheckAll('uncertain', uncertainNames);

  document.getElementById('unused-bulk-select-all')?.addEventListener('click', () => {
    allUnusedNames.forEach(name => window.selectedUnusedPackages.add(name));
    elUnused.querySelectorAll('.unused-pkg-check').forEach(chk => { chk.checked = true; });
    elUnused.querySelectorAll('.unused-check-all').forEach(chk => {
      chk.checked = true;
      chk.indeterminate = false;
    });
    window.updateUnusedBulkBar();
  });

  document.getElementById('unused-bulk-deselect')?.addEventListener('click', () => {
    window.selectedUnusedPackages.clear();
    elUnused.querySelectorAll('.unused-pkg-check').forEach(chk => { chk.checked = false; });
    elUnused.querySelectorAll('.unused-check-all').forEach(chk => {
      chk.checked = false;
      chk.indeterminate = false;
    });
    window.updateUnusedBulkBar();
  });

  document.getElementById('unused-bulk-remove')?.addEventListener('click', () => {
    if (window.selectedUnusedPackages.size === 0) return;
    const candidates = unused
      .filter(p => window.selectedUnusedPackages.has(p.name))
      .map(p => ({
        name: p.name,
        source: p.source || '',
        confidence: p.unusedConfidence ?? 100,
        hasReferenceHits: false,
        suggestedRemove: p.usageVerdict !== 'uncertain' && (p.unusedConfidence ?? 100) >= 80,
      }));
    if (!candidates.length || typeof window.showUnusedRemoveConfirmDialog !== 'function') return;
    window.showUnusedRemoveConfirmDialog(candidates, selected => {
      window.selectedUnusedPackages.clear();
      window.vscode.postMessage({
        type: 'bulkRemoveUnusedConfirmed',
        userInitiated: true,
        packages: selected,
      });
    }, { mode: 'manual' });
  });
};
