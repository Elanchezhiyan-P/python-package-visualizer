/**
 * Unified Entry Point and State Router for Python Package Visualizer.
 * Coordinates renderAll, message routing, and DOM bootstrap.
 */

window.renderAll = function () {
  const filtered = window.getFiltered();

  if (!(window.allPackages || []).length) {
    window.showEmpty?.(window.depFilesEmpty);
    return;
  }

  const elEmpty = document.getElementById('empty-state');
  if (elEmpty) elEmpty.style.display = 'none';

  if (typeof window.updateStats === 'function') {
    window.updateStats(window.allPackages);
  }
  if (typeof window.updateConflictStat === 'function') {
    window.updateConflictStat();
  }
  if (typeof window.updateConflictBadge === 'function') {
    window.updateConflictBadge();
  }
  if (typeof window.updateUnusedBadge === 'function') {
    window.updateUnusedBadge(window.allPackages);
  }
  if (typeof window.showTab === 'function') {
    window.showTab(window.activeTab, filtered);
  }

  window.updateBulkBar();
};

window.setupMessageRouter?.();
document.addEventListener('DOMContentLoaded', () => {
  window.setupDomListeners?.();
});
