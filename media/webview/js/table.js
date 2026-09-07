/**
 * Package List Table Renderer for Python Package Visualizer.
 * Orchestrates row HTML generation and event binding (see table/* modules).
 */

window.renderTable = function (filtered) {
  const tbody = document.getElementById('pkg-table-body');
  const countEl = document.getElementById('result-count');
  if (!tbody) return;

  tbody.innerHTML = '';

  const esc = window.esc || (s => s);
  const helpers = {
    esc,
    healthRingHtml: window.healthRingHtml || (() => ''),
    statusBadge: window.statusBadge || (s => s),
    isMajorJump: window.isMajorJump || (() => false),
    isChecked: '',
  };

  if (countEl) {
    if (filtered.length === window.allPackages.length) {
      countEl.innerHTML = `${window.t('result.showing')} <strong>${filtered.length}</strong> ${window.t('result.of')} <strong>${window.allPackages.length}</strong> ${window.t('result.packages')}`;
    } else {
      countEl.innerHTML = `${window.t('result.showing')} <strong>${filtered.length}</strong> ${window.t('result.of')} <strong>${window.allPackages.length}</strong> ${window.t('result.packages')} <button id="btn-clear-filters" class="clear-link">${window.t('result.clear')}</button>`;
      document.getElementById('btn-clear-filters')?.addEventListener('click', () => {
        window.clearFilters();
      });
    }
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="padding:40px 20px;text-align:center;color:var(--vscode-descriptionForeground)">
          <div style="font-size:24px;margin-bottom:8px;">🔍</div>
          <strong>${window.t('empty.noMatch')}</strong>
          <p style="margin-top:6px;font-size:11px;">${window.t('empty.tryClearing')}</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(pkg => {
    helpers.isChecked = window.selectedPackages.has(pkg.name) ? 'checked' : '';
    return window.buildTableRowHtml(pkg, helpers);
  }).join('');

  window.bindTableRowEvents(tbody);
};
