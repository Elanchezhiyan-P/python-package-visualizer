/**
 * License Compliance View Renderer.
 * Groups packages by normalized license label with risk classification,
 * search, filters, and collapsible full-text when PyPI returns legal blobs.
 */

window._licFilters = window._licFilters || { risk: 'all', search: '' };
window._licExpanded = window._licExpanded || {};

window.renderLicenses = function () {
  const elViewLicenses = document.getElementById('view-licenses');
  if (!elViewLicenses) return;

  const t = window.t || (k => k);
  const allPackages = window.allPackages || [];
  const filters = window._licFilters;
  const normalize = window.normalizeLicenseDisplay || ((raw) => ({
    label: raw || t('lic.licenseUnknown'),
    raw: raw || '',
    isLong: false,
  }));

  const riskMap = {
    low: ['mit', 'bsd-3-clause', 'bsd-2-clause', 'bsd', 'apache-2.0', 'apache-2', 'apache', 'isc', 'mpl-2.0', 'psf', 'unlicense', 'cc0'],
    medium: ['lgpl', 'epl', 'cddl', 'mpl'],
    high: ['agpl', 'gpl', 'commercial', 'proprietary'],
  };

  /**
   * Classify license risk with word-boundary checks so LGPL ≠ GPL and MPL-2.0 stays low.
   * @param {string} licenseLabel
   * @returns {'low'|'medium'|'high'|'unknown'}
   */
  function classifyLicense(licenseLabel) {
    if (!licenseLabel || licenseLabel === 'UNKNOWN' || licenseLabel === 'Unknown' || /^see /i.test(licenseLabel)) {
      return 'unknown';
    }
    const lower = String(licenseLabel).toLowerCase();

    // Specific before generic: AGPL/GPL (not LGPL), then LGPL/MPL/EPL, then permissive
    if (/\bagpl\b/.test(lower) || (/\bgpl\b/.test(lower) && !/\blgpl\b/.test(lower))) {
      return 'high';
    }
    if (/\bcommercial\b/.test(lower) || /\bproprietary\b/.test(lower)) {
      return 'high';
    }
    if (/\blgpl\b/.test(lower) || /\bepl\b/.test(lower) || /\bcddl\b/.test(lower)) {
      return 'medium';
    }
    // MPL-2.0 is permissive-ish / low; bare MPL without 2 → medium
    if (/\bmpl-?2(\.0)?\b/.test(lower)) {
      return 'low';
    }
    if (/\bmpl\b/.test(lower)) {
      return 'medium';
    }
    if (riskMap.low.some(k => lower.includes(k))) {
      return 'low';
    }
    return 'unknown';
  }

  /** @type {Record<string, { risk: string, label: string, packages: object[], samples: string[] }>} */
  const groups = {};
  for (const pkg of allPackages) {
    const raw = pkg.license || '';
    const { label, raw: rawText, isLong } = normalize(raw || t('lic.licenseUnknown'));
    const key = label.toLowerCase();
    if (!groups[key]) {
      groups[key] = {
        risk: classifyLicense(label),
        label,
        packages: [],
        samples: [],
        hasLongText: false,
      };
    }
    groups[key].packages.push(pkg);
    if (isLong && rawText && groups[key].samples.length < 1) {
      groups[key].samples.push(rawText);
      groups[key].hasLongText = true;
    } else if (!isLong && rawText && rawText !== label && groups[key].samples.length < 1) {
      // Keep short alternate wording only if useful — skip duplicates of the label.
    }
  }

  const riskColor = { low: '#4ade80', medium: '#fb923c', high: '#f87171', unknown: '#94a3b8' };
  const riskLabel = {
    low: t('lic.riskLow'),
    medium: t('lic.riskMedium'),
    high: t('lic.riskHigh'),
    unknown: t('lic.riskUnknown'),
  };

  const formatPackageCount = (n) => (
    n === 1 ? t('lic.packageOne') : t('lic.packageMany').replace('{n}', String(n))
  );

  const searchLower = filters.search.trim().toLowerCase();
  const matchesSearch = (pkg) => !searchLower || pkg.name.toLowerCase().includes(searchLower);

  const counts = { all: allPackages.length, low: 0, medium: 0, high: 0, unknown: 0 };
  for (const group of Object.values(groups)) {
    counts[group.risk] += group.packages.length;
  }

  const sortedGroups = Object.entries(groups)
    .filter(([, group]) => filters.risk === 'all' || group.risk === filters.risk)
    .map(([key, group]) => {
      const filteredPkgs = group.packages.filter(matchesSearch);
      return [key, { ...group, packages: filteredPkgs }];
    })
    .filter(([, group]) => group.packages.length > 0)
    .sort((a, b) => {
      const order = { high: 0, medium: 1, unknown: 2, low: 3 };
      const diff = order[a[1].risk] - order[b[1].risk];
      if (diff !== 0) return diff;
      return b[1].packages.length - a[1].packages.length;
    });

  const summaryCards = [
    { key: 'all', label: t('lic.total'), count: counts.all, className: '', color: undefined },
    { key: 'low', label: t('lic.lowRisk'), count: counts.low, className: 'lic-summary-card--low', color: '#4ade80' },
    { key: 'medium', label: t('lic.mediumRisk'), count: counts.medium, className: 'lic-summary-card--medium', color: '#fb923c' },
    { key: 'high', label: t('lic.highRisk'), count: counts.high, className: 'lic-summary-card--high', color: '#f87171' },
    { key: 'unknown', label: t('lic.unknownRisk'), count: counts.unknown, className: 'lic-summary-card--unknown', color: '#94a3b8' },
  ];

  const summaryHtml = summaryCards.map(card => `
    <button type="button" class="lic-summary-card ${card.className} ${filters.risk === card.key ? 'active' : ''}" data-risk-filter="${card.key}">
      <div class="lic-summary-label">${window.esc(card.label)}</div>
      <div class="lic-summary-value" style="color:${card.color || 'var(--vscode-foreground)'};">${card.count}</div>
    </button>
  `).join('');

  const filterPills = [
    { key: 'all', label: t('lic.filterAll') },
    { key: 'high', label: t('lic.riskHigh') },
    { key: 'medium', label: t('lic.riskMedium') },
    { key: 'low', label: t('lic.riskLow') },
    { key: 'unknown', label: t('lic.riskUnknown') },
  ].map(p => `
    <button type="button" class="lic-filter-pill ${filters.risk === p.key ? 'active' : ''}" data-risk-filter="${p.key}">${window.esc(p.label)}</button>
  `).join('');

  const groupsHtml = sortedGroups.map(([key, group]) => {
    const color = riskColor[group.risk];
    const label = riskLabel[group.risk];
    const expanded = !!window._licExpanded[key];
    const fullText = group.samples[0] || '';
    const showToggle = group.hasLongText && fullText;

    const pkgListHtml = group.packages.map(p => `
      <div class="lic-pkg-row" data-pkg="${window.esc(p.name)}">
        <span class="lic-pkg-name">${window.esc(p.name)}</span>
        <span class="lic-pkg-version">${window.esc(p.installedVersion || '—')}</span>
      </div>
    `).join('');

    const fullTextHtml = showToggle ? `
      <div class="lic-fulltext-wrap">
        <button type="button" class="lic-fulltext-toggle" data-lic-key="${window.esc(key)}" aria-expanded="${expanded ? 'true' : 'false'}">
          ${window.esc(expanded ? t('lic.hideFullText') : t('lic.showFullText'))}
        </button>
        ${expanded ? `<pre class="lic-fulltext">${window.esc(fullText)}</pre>` : ''}
      </div>
    ` : '';

    return `
      <div class="lic-group" style="border-left:3px solid ${color};">
        <div class="lic-group-header">
          <div class="lic-group-title-block">
            <div class="lic-group-name" title="${window.esc(group.label)}">${window.esc(group.label)}</div>
            <div class="lic-group-meta">${window.esc(formatPackageCount(group.packages.length))}</div>
          </div>
          <span class="lic-risk-badge" style="background:${color}22;color:${color};border:1px solid ${color}55;">${window.esc(label)}</span>
        </div>
        ${fullTextHtml}
        ${pkgListHtml}
      </div>
    `;
  }).join('');

  const bodyContent = allPackages.length === 0
    ? `<div class="lic-empty">${window.esc(t('lic.noData'))}</div>`
    : sortedGroups.length === 0
      ? `<div class="lic-no-results">${window.esc(t('lic.noResults'))}</div>`
      : groupsHtml;

  elViewLicenses.innerHTML = `
    <div class="lic-page">
      <div class="lic-header-title">${window.esc(t('lic.title'))}</div>
      <div class="lic-header-subtitle">${window.esc(t('lic.subtitle'))}</div>
      <div class="lic-hint">
        <span class="lic-hint-icon">ℹ️</span>
        <span>${window.esc(t('lic.riskHint'))}</span>
      </div>
      <div class="lic-summary">${summaryHtml}</div>
      <div class="lic-toolbar">
        <input type="search" class="lic-search" id="lic-search-input" placeholder="${window.esc(t('lic.searchPlaceholder'))}" value="${window.esc(filters.search)}" />
        <div class="lic-filter-pills">${filterPills}</div>
      </div>
      ${bodyContent}
    </div>
  `;

  const applyRiskFilter = (risk) => {
    window._licFilters.risk = risk;
    window.renderLicenses();
  };

  elViewLicenses.querySelectorAll('[data-risk-filter]').forEach(btn => {
    btn.addEventListener('click', () => applyRiskFilter(btn.dataset.riskFilter));
  });

  const searchInput = elViewLicenses.querySelector('#lic-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      window._licFilters.search = searchInput.value;
      window.renderLicenses();
      const next = elViewLicenses.querySelector('#lic-search-input');
      if (next) {
        next.focus();
        next.setSelectionRange(next.value.length, next.value.length);
      }
    });
  }

  elViewLicenses.querySelectorAll('.lic-fulltext-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = btn.dataset.licKey;
      if (!key) return;
      window._licExpanded[key] = !window._licExpanded[key];
      window.renderLicenses();
    });
  });

  elViewLicenses.querySelectorAll('.lic-pkg-row').forEach(row => {
    row.addEventListener('click', () => {
      const pkg = allPackages.find(p => p.name === row.dataset.pkg);
      if (pkg && typeof window.showDetail === 'function') window.showDetail(pkg);
    });
  });
};
