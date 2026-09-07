/**
 * Sidebar Welcome and Settings View System.
 * Coordinates preferences updates and stats sync between the VS Code host and the sidebar panel.
 */

const vscode = acquireVsCodeApi();

/**
 * Dispatches web requests to open external urls via the host application.
 * 
 * @param {string} url - The target external URL to open.
 * @returns {void}
 */
function openUrl(url) {
  vscode.postMessage({ type: 'openUrl', url });
}

document.getElementById('btn-open').addEventListener('click', () =>
  vscode.postMessage({ type: 'openPanel' })
);

document.getElementById('link-docs').addEventListener('click', () =>
  openUrl('https://github.com/FaberVi/python-package-visualizer#readme')
);
document.getElementById('link-changelog').addEventListener('click', () =>
  openUrl('https://github.com/FaberVi/python-package-visualizer/blob/main/CHANGELOG.md')
);
document.getElementById('link-issue').addEventListener('click', () =>
  openUrl('https://github.com/FaberVi/python-package-visualizer/issues')
);
document.getElementById('link-star').addEventListener('click', () =>
  openUrl('https://github.com/FaberVi/python-package-visualizer')
);
document.getElementById('link-portfolio').addEventListener('click', () =>
  openUrl('https://codebyelan.in')
);
document.getElementById('link-github-author').addEventListener('click', () =>
  openUrl('https://github.com/Elanchezhiyan-P')
);
document.getElementById('link-linkedin').addEventListener('click', () =>
  openUrl('https://www.linkedin.com/in/elanchezhiyan-p/')
);
document.getElementById('link-github-maintainer').addEventListener('click', () =>
  openUrl('https://github.com/FaberVi')
);
document.getElementById('link-fork-repo').addEventListener('click', () =>
  openUrl('https://github.com/FaberVi/python-package-visualizer')
);

// ── Settings ─────────────────────────────────────────
const settingsState = {
  showImportCodeLens: true,
  showImportHover: true,
  autoCheckOnOpen: true,
  notifyOnOutdated: true,
  updateCheckSchedule: 'off',
  showFunctionMetrics: true,
  showMethodCallHover: true,
  showComplexityWarnings: true,
  showTypeHintCoverage: true,
  showDocstringWarnings: true,
  language: 'en',
};

/**
 * Returns the visible label for a custom select option.
 */
function getCustomSelectLabel(selectEl, value) {
  const option = selectEl.querySelector(`.custom-select-option[data-value="${value}"]`);
  return option ? option.textContent.trim() : value;
}

/**
 * Updates a custom select UI to reflect the chosen value.
 */
function setCustomSelectValue(selectEl, value) {
  const labelEl = selectEl.querySelector('.custom-select-label');
  const options = selectEl.querySelectorAll('.custom-select-option');
  options.forEach(option => {
    option.classList.toggle('selected', option.dataset.value === value);
  });
  if (labelEl) {
    labelEl.textContent = getCustomSelectLabel(selectEl, value);
  }
}

/**
 * Closes every open custom select dropdown.
 */
function closeAllCustomSelects(except) {
  document.querySelectorAll('.custom-select.open').forEach(selectEl => {
    if (selectEl !== except) {
      selectEl.classList.remove('open');
      const trigger = selectEl.querySelector('.custom-select-trigger');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }
  });
}

// Request current settings from extension
vscode.postMessage({ type: 'getSettings' });

/**
 * Applies current workspace configuration settings to the UI controls.
 * Ensures toggle switches and selection inputs align with the backend state.
 * 
 * @param {object} s - Current settings key-value mapping.
 * @returns {void}
 */
function applySettings(s) {
  Object.assign(settingsState, s);
  document.querySelectorAll('.toggle-switch').forEach(el => {
    const key = el.dataset.setting;
    if (settingsState[key]) el.classList.add('on');
    else el.classList.remove('on');
  });
  document.querySelectorAll('.custom-select').forEach(el => {
    const key = el.dataset.setting;
    if (settingsState[key]) setCustomSelectValue(el, settingsState[key]);
  });
}

// Toggle handler
document.querySelectorAll('.toggle-switch').forEach(el => {
  el.addEventListener('click', () => {
    const key = el.dataset.setting;
    const newVal = !settingsState[key];
    settingsState[key] = newVal;
    if (newVal) el.classList.add('on');
    else el.classList.remove('on');
    vscode.postMessage({ type: 'updateSetting', key, value: newVal });
  });
});

// Custom select handlers
document.querySelectorAll('.custom-select').forEach(selectEl => {
  const trigger = selectEl.querySelector('.custom-select-trigger');
  const options = selectEl.querySelectorAll('.custom-select-option');

  trigger?.addEventListener('click', (event) => {
    event.stopPropagation();
    const willOpen = !selectEl.classList.contains('open');
    closeAllCustomSelects(selectEl);
    selectEl.classList.toggle('open', willOpen);
    trigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  });

  options.forEach(option => {
    option.addEventListener('click', (event) => {
      event.stopPropagation();
      const key = selectEl.dataset.setting;
      const value = option.dataset.value;
      if (!key || !value) return;

      settingsState[key] = value;
      setCustomSelectValue(selectEl, value);
      selectEl.classList.remove('open');
      trigger?.setAttribute('aria-expanded', 'false');
      vscode.postMessage({ type: 'updateSetting', key, value });
    });
  });
});

document.addEventListener('click', () => closeAllCustomSelects());

window.addEventListener('message', event => {
  const msg = event.data;
  if (msg.type === 'sidebarStats') {
    document.getElementById('ls-ok').textContent     = msg.ok;
    document.getElementById('ls-update').textContent = msg.updates;
    document.getElementById('ls-vuln').textContent   = msg.vulnerable;
    document.getElementById('live-stats').classList.add('visible');

    const driftBox = document.getElementById('drift-stat-box');
    if (driftBox) {
      const driftedCount = msg.drifted !== undefined ? msg.drifted : 0;
      driftBox.classList.remove('warning', 'ok');

      if (driftedCount > 0) {
        driftBox.classList.add('warning');
        const txtTemplate = document.getElementById('txt-stats-drifted').textContent;
        driftBox.innerHTML = `<span class="drift-icon">⚠️</span> <span>${txtTemplate.replace('{count}', driftedCount)}</span>`;
      } else {
        driftBox.classList.add('ok');
        const txtTemplate = document.getElementById('txt-stats-all-aligned').textContent;
        driftBox.innerHTML = `<span class="drift-icon">✅</span> <span>${txtTemplate}</span>`;
      }
      driftBox.classList.add('visible');
    }
  }
  if (msg.type === 'settings') {
    applySettings(msg.settings);
  }
});
