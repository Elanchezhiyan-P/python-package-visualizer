/**
 * Add Package Modal Handlers for Python Package Visualizer.
 * Coordinates input queries to PyPI, handles status checks (already installed),
 * and structures results to present install packages options.
 *
 * WHY: Separating modal display transitions and search outcome formatting keeps the main 
 * orchestrator clean and prevents duplicate modal state-handling bugs.
 */

/**
 * Updates the modal results view to indicate the package is already present.
 *
 * @param {object} pkg - The existing package object.
 */
window.showAlreadyInstalled = function (pkg) {
  const elResult = document.getElementById('add-pkg-result');
  const elInstall = document.getElementById('add-pkg-install');
  if (!elResult || !elInstall) return;

  const esc = window.esc || (s => s);
  const needsUpdate = pkg.latestVersion && pkg.installedVersion && pkg.latestVersion !== pkg.installedVersion
    && pkg.status === 'update-available' && !pkg.updateBlockedByConflict;
  const conflictBlocked = pkg.updateBlockedByConflict || pkg.status === 'conflict-blocked';

  elResult.className = 'has-result is-installed';
  elResult.innerHTML = `
    <div class="apkg-row">
      <span class="apkg-name">${esc(pkg.name)}</span>
      <span class="apkg-ver">v${esc(pkg.installedVersion)}</span>
      <span class="apkg-installed-badge">&#x2713; Already installed</span>
    </div>
    <span class="apkg-installed-hint">${
      conflictBlocked
        ? `A newer version <strong>v${esc(pkg.latestVersion)}</strong> is available but blocked due to dependency conflicts. Open the Package List to revert or force update.`
        : needsUpdate
        ? `A newer version <strong>v${esc(pkg.latestVersion)}</strong> is available. Use the <em>Update</em> button in the Package List tab.`
        : `This package is already installed and up to date in your environment.`
    }</span>
  `;
  elInstall.disabled = true;
  elInstall.classList.add('is-installed');
  elInstall.innerHTML = '&#x2713; Installed';
  window.pendingInstallName = '';
  window.pendingInstallVersion = '';
};

/**
 * Resets the Add Package modal input results and buttons back to prompt defaults.
 */
window.resetAddPkgResult = function () {
  const elResult = document.getElementById('add-pkg-result');
  const elInstall = document.getElementById('add-pkg-install');
  if (elResult) {
    elResult.className = '';
    elResult.innerHTML = `<span>${window.t('addPkg.hint')} <strong>${window.t('addPkg.hintBold')}</strong> ${window.t('addPkg.orEnter')}</span>`;
  }
  if (elInstall) {
    elInstall.disabled = true;
    elInstall.classList.remove('is-installed');
    elInstall.innerHTML = window.t('addPkg.installBtn');
  }
};

/**
 * Triggers modal visual state changes and focuses input query field.
 */
window.showAddPkgModal = function () {
  const elModal = document.getElementById('add-pkg-modal');
  const elInput = document.getElementById('add-pkg-input');
  if (elModal) elModal.classList.add('open');
  if (elInput) {
    elInput.value = '';
    setTimeout(() => elInput.focus(), 80);
  }
  window.resetAddPkgResult();
  window.pendingInstallName = '';
  window.pendingInstallVersion = '';
};

/**
 * Closes the Add Package modal view.
 */
window.hideAddPkgModal = function () {
  document.getElementById('add-pkg-modal')?.classList.remove('open');
};

/**
 * Parses dynamic JSON outcomes from host PyPI queries and populates result rows.
 *
 * @param {object} msg - The PyPI search outcome payload.
 */
window.handlePypiSearchResult = function (msg) {
  const elResult = document.getElementById('add-pkg-result');
  const elInstall = document.getElementById('add-pkg-install');
  if (!elResult || !elInstall) return;

  if (!msg.found) {
    elResult.className = '';
    elResult.innerHTML = '<span class="apkg-error">&#x26A0;&nbsp; Package not found on PyPI. Check the spelling and try again.</span>';
    return;
  }

  const esc = window.esc || (s => s);
  const normSearch = msg.name.toLowerCase().replace(/[-_.]+/g, '-');
  const existing = window.allPackages.find(p =>
    p.name.toLowerCase().replace(/[-_.]+/g, '-') === normSearch &&
    p.installedVersion &&
    p.status !== 'not-installed'
  );

  if (existing) {
    window.showAlreadyInstalled(existing);
  } else {
    window.pendingInstallName = msg.name;
    window.pendingInstallVersion = msg.version || '';
    elResult.className = 'has-result';
    elResult.innerHTML = `
      <div class="apkg-row">
        <span class="apkg-name">${esc(msg.name)}</span>
        ${msg.version ? `<span class="apkg-ver">v${esc(msg.version)}</span>` : ''}
      </div>
      ${msg.summary ? `<span class="apkg-sum">${esc(msg.summary.slice(0, 200))}${msg.summary.length > 200 ? '…' : ''}</span>` : ''}
    `;
    elInstall.disabled = false;
    elInstall.classList.remove('is-installed');
    elInstall.innerHTML = window.t('addPkg.installBtn');
  }
};
