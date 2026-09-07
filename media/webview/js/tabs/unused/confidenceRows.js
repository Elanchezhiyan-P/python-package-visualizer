/**
 * Confidence / verdict helpers and unused-package table row HTML.
 */

/**
 * Translate machine-readable reason codes into localized human-readable strings.
 * @param {string[]} reasons - Array of reason codes from the backend.
 * @returns {string} Translated tooltip text.
 */
function translateReasons(reasons) {
  if (!reasons || reasons.length === 0) return '';
  return reasons.map(r => {
    if (r.startsWith('required-by:')) {
      const pkgs = r.replace('required-by:', '');
      return window.t('unused.reasonTransitive').replace('{pkg}', pkgs);
    }
    if (r.startsWith('group:')) {
      const group = r.replace('group:', '');
      return window.t('unused.reasonDevGroup').replace('{group}', group);
    }
    if (r === 'reverse-map') return window.t('unused.reasonReverseMap');
    if (r === 'high-downloads') return window.t('unused.reasonPopular');
    if (r === 'partial-match') return window.t('unused.reasonPartialMatch');
    if (r === 'weak-config-evidence') return window.t('unused.reasonWeakEvidence');
    if (r.startsWith('orphan-chain:')) {
      const root = r.replace('orphan-chain:', '');
      return window.t('unused.reasonOrphanChain').replace('{pkg}', root);
    }
    if (r.startsWith('optional-dep:')) {
      const parent = r.replace('optional-dep:', '');
      return window.t('unused.reasonOptionalDep').replace('{pkg}', parent);
    }
    return r;
  }).join('\n');
}

/**
 * Determine the color for a confidence value using a three-tier scale.
 * @param {number} confidence - 5–100 percentage.
 * @returns {{ color: string, bg: string, border: string, label: string }}
 */
function getConfidenceTier(confidence) {
  if (confidence >= 80) {
    return {
      color: '#f87171',
      bg: 'rgba(248,113,113,.15)',
      border: 'rgba(248,113,113,.4)',
      label: window.t('unused.highConfidence')
    };
  }
  if (confidence >= 50) {
    return {
      color: '#fb923c',
      bg: 'rgba(251,146,60,.12)',
      border: 'rgba(251,146,60,.4)',
      label: window.t('unused.mediumConfidence')
    };
  }
  return {
    color: '#4ade80',
    bg: 'rgba(74,222,128,.12)',
    border: 'rgba(74,222,128,.4)',
    label: window.t('unused.lowConfidence')
  };
}

function formatEvidence(evidence) {
  if (!evidence || evidence.length === 0) return '';
  return evidence.slice(0, 3).map(e => {
    const loc = e.line ? `${e.file}:${e.line}` : e.file;
    return `${e.source} @ ${loc}`;
  }).join('\n');
}

function getVerdictTier(pkg) {
  if (pkg.usageVerdict === 'uncertain') {
    return {
      color: '#facc15',
      bg: 'rgba(250,204,21,.12)',
      border: 'rgba(250,204,21,.4)',
      label: window.t('unused.verdictUncertain'),
    };
  }
  return getConfidenceTier(pkg.unusedConfidence ?? 100);
}

function buildRows(pkgs) {
  return pkgs.map(pkg => {
  const sourceShort = pkg.source ? String(pkg.source).split(/[\\/]/).pop() : '\u2014';
  const confidence = pkg.unusedConfidence ?? 100;
  const tier = getVerdictTier(pkg);
  const tooltip = [translateReasons(pkg.unusedReasons), formatEvidence(pkg.usageEvidence)]
    .filter(Boolean)
    .join('\n');
  const isChecked = window.selectedUnusedPackages?.has(pkg.name);

  return `
  <tr class="unused-row" data-pkg="${window.esc(pkg.name)}" style="border-bottom:1px solid color-mix(in srgb, var(--vscode-panel-border) 40%, transparent);">
    <td style="padding:12px 10px 12px 16px;width:36px;">
      <input type="checkbox" class="unused-pkg-check" data-name="${window.esc(pkg.name)}" ${isChecked ? 'checked' : ''}
        style="accent-color:#7c3aed;cursor:pointer;">
    </td>
    <td style="padding:12px 16px;">
      <div style="font-weight:600;color:var(--vscode-textLink-foreground);cursor:pointer;" class="pkg-name-link" data-pkg="${window.esc(pkg.name)}">${window.esc(pkg.name)}</div>
      ${pkg.summary ? `<div style="font-size:10px;color:var(--vscode-descriptionForeground);margin-top:3px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${window.esc(pkg.summary)}</div>` : ''}
    </td>
    <td style="padding:12px 16px;font-family:var(--vscode-editor-font-family,monospace);font-size:11px;color:var(--vscode-descriptionForeground);">${window.esc(pkg.installedVersion || '\u2014')}</td>
    <td style="padding:12px 16px;font-size:11px;color:var(--vscode-descriptionForeground);" title="${window.esc(pkg.source || '')}">${window.esc(sourceShort)}</td>
    <td style="padding:12px 14px;min-width:140px;" title="${window.esc(tooltip)}">
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="flex:1;height:6px;background:color-mix(in srgb, var(--vscode-panel-border) 30%, transparent);border-radius:3px;overflow:hidden;min-width:60px;">
          <div style="width:${confidence}%;height:100%;background:${tier.color};border-radius:3px;transition:width .3s ease;"></div>
        </div>
        <span style="font-size:11px;font-weight:700;color:${tier.color};min-width:32px;text-align:right;">${confidence}%</span>
      </div>
      <div style="font-size:9px;color:var(--vscode-descriptionForeground);margin-top:3px;">${window.esc(tier.label)}</div>
    </td>
    <td style="padding:12px 16px;text-align:right;white-space:nowrap;">
      <button class="unused-mark-used-btn" data-name="${window.esc(pkg.name)}" title="${window.esc(window.t('unused.markUsedTitle'))}"
        style="background:rgba(74,222,128,.15);color:#4ade80;border:1px solid rgba(74,222,128,.35);padding:5px 10px;border-radius:4px;font-size:11px;cursor:pointer;font-family:inherit;font-weight:600;margin-right:6px;">
        ${window.t('unused.markUsed')}
      </button>
      <button class="unused-remove-btn" data-name="${window.esc(pkg.name)}" data-source="${window.esc(pkg.source || '')}" style="background:rgba(248,113,113,.15);color:#f87171;border:1px solid rgba(248,113,113,.3);padding:5px 12px;border-radius:4px;font-size:11px;cursor:pointer;font-family:inherit;font-weight:600;">${window.t('btn.remove')}</button>
    </td>
  </tr>
  `;
  }).join('');
}
