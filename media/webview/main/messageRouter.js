/** Handles inbound postMessage events from the extension host. */
window.setupMessageRouter = function () {
  window.addEventListener('message', event => {
    const msg = event.data;
    switch (msg.type) {
      case 'init':
      case 'update':
        window.hideLoading?.();
        window.allPackages = (msg.packages || []).map(p => ({
          ...p,
          requires: window.sanitizeRequiresList(p.requires),
        }));
        if (Array.isArray(msg.graphPackages)) {
          window.graphPackages = msg.graphPackages.map(p => ({
            ...p,
            requires: window.sanitizeRequiresList(p.requires),
          }));
        }
        window.depFilesEmpty = msg.depFilesEmpty || null;
        if (msg.scanStats) {
          window.scanStats = msg.scanStats;
        }
        if (msg.language && window.i18n[msg.language]) {
          window.currentLang = msg.language;
          try { localStorage.setItem('ppv-lang', window.currentLang); } catch (_) {}
          const langSel = document.getElementById('lang-select');
          if (langSel) langSel.value = window.currentLang;
        }
        window.vulnBannerDismissed = false;
        window.driftBannerDismissed = false;
        window.applyStaticTranslations();
        window.renderAll();
        if (msg.type === 'init') {
          setTimeout(() => window.startTour?.(), 1000);
        }
        break;

      case 'progress':
        window.showLoading?.(msg.message || 'Loading...');
        break;

      case 'history':
        window.historyEntries = msg.entries || [];
        if (window.activeTab === 'history') {
          window.renderHistory?.();
        }
        break;

      case 'pypiSearchResult':
        window.handlePypiSearchResult?.(msg);
        break;

      case 'conflicts':
        window.allConflicts = msg.conflicts || [];
        window.conflictsByPkg = new Map();
        for (const c of window.allConflicts) {
          const norm = n => String(n).toLowerCase().replace(/[-_.]+/g, '-');
          [norm(c.package), norm(c.conflictingPackage)].forEach(key => {
            if (!window.conflictsByPkg.has(key)) { window.conflictsByPkg.set(key, []); }
            window.conflictsByPkg.get(key).push(c);
          });
        }
        window.updateConflictStat?.();
        window.updateConflictBadge?.();
        if (window.activeTab === 'list') {
          window.renderTable?.(window.getFiltered());
        }
        if (window.activeTab === 'conflicts') {
          window.renderConflicts?.();
        }
        break;

      case 'pkgProgress':
        window.updateRowProgress?.(msg.name, msg.stage, msg.percent);
        break;

      case 'snapshots':
        window.snapshots = msg.snapshots || [];
        if (window.activeTab === 'snapshots') {
          window.renderSnapshots?.();
        }
        break;

      case 'venvHealth':
        window.venvHealthPending = false;
        window.venvHealthReport = msg.report || null;
        window.venvActiveProject = msg.activeProject || null;
        window.venvAvailableProjects = msg.availableProjects || [];
        if (window.activeTab === 'venv-health') {
          window.renderVenvHealth?.();
        }
        break;

      case 'ideCapabilities':
        window.cursorAiAvailable = Boolean(msg.enabled && msg.canOpenChat);
        window.cursorIdeName = msg.ideName || '';
        window.cursorAiUseAutoModel = msg.useAutoModel !== false;
        if (window.activeTab === 'unused') {
          window.renderUnused?.();
        }
        break;

      case 'unusedAiResult':
        window.renderUnusedAiResult?.(msg);
        break;
    }
  });
};
