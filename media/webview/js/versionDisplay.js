/**
 * Version comparison, exact-pin, and drift helpers for Python Package Visualizer.
 */

/**
 * Determines whether a version difference constitutes a major semver jump.
 * This is used by Safe Mode to block potentially breaking version changes.
 * 
 * @param {string} installed - The installed version.
 * @param {string} latest - The latest available version.
 * @returns {boolean} True if latest version has a higher major component.
 */
window.isMajorJump = function (installed, latest) {
  if (!installed || !latest) return false;
  const maj = v => parseInt((v || '0').replace(/[^\d.].*/, '').split('.')[0], 10) || 0;
  return maj(latest) > maj(installed);
};

/**
 * Extracts the first version number from any PEP 440 comparison clause (install hint).
 * Not an exact-pin check — use extractExactPinnedVersion / hasDrift for drift.
 *
 * @param {string} specifiedVersion - The raw constraint string (e.g. "==1.2.3", ">=2.0").
 * @returns {string|null} The extracted version string, or null if no version could be parsed.
 */
window.extractPinnedVersion = function (specifiedVersion) {
  if (!specifiedVersion) return null;
  const m = specifiedVersion.match(/[=!<>~^]+\s*([\d][^\s,;]*)/);
  return m ? m[1] : null;
};

/**
 * Version from a sole exact pin (`==1.2.3` / `===1.2.3`). Ranges/wildcards return null.
 * @param {string} specifiedVersion
 * @returns {string|null}
 */
window.extractExactPinnedVersion = function (specifiedVersion) {
  if (!specifiedVersion || !String(specifiedVersion).trim()) return null;
  const core = String(specifiedVersion).split(';')[0].trim();
  if (!core || core.includes(',')) return null;
  const m = core.match(/^===?\s*([^\s,]+)\s*$/);
  if (!m) return null;
  if (m[1].includes('*')) return null;
  return m[1];
};

/** @param {string} specifiedVersion @returns {boolean} */
window.isExactPin = function (specifiedVersion) {
  return window.extractExactPinnedVersion(specifiedVersion) !== null;
};

/**
 * True when Align would rewrite a non-exact specifier to `==installed`.
 * @param {string} specifiedVersion
 * @returns {boolean}
 */
window.wouldTightenToExactPin = function (specifiedVersion) {
  return !window.isExactPin(specifiedVersion ?? '');
};

/**
 * Splits a version into numeric core + remaining suffix (pre/post/dev tags).
 * @param {string} version
 * @returns {{ core: string, suffix: string }}
 */
window.splitVersionParts = function (version) {
  const trimmed = String(version ?? '').trim();
  const m = trimmed.match(/^(\d+(?:\.\d+)*)(.*)$/);
  if (!m) return { core: trimmed, suffix: '' };
  const parts = m[1].split('.').map(p => String(parseInt(p, 10)));
  while (parts.length > 1 && parts[parts.length - 1] === '0') {
    parts.pop();
  }
  return { core: parts.join('.'), suffix: m[2].toLowerCase() };
};

window.normalizeVersionCore = function (version) {
  return window.splitVersionParts(version).core;
};

/** @param {string} a @param {string} b @returns {boolean} */
window.versionsEquivalent = function (a, b) {
  const pa = window.splitVersionParts(a);
  const pb = window.splitVersionParts(b);
  return pa.core === pb.core && pa.suffix === pb.suffix;
};

/**
 * Drift = exact pin in the file differs from the installed version.
 * Flexible constraints (`>=`, `~=`, ranges) never count as drift.
 * @param {string} specifiedVersion
 * @param {string} installedVersion
 * @returns {boolean}
 */
window.hasDrift = function (specifiedVersion, installedVersion) {
  const pinned = window.extractExactPinnedVersion(specifiedVersion);
  return pinned !== null && !window.versionsEquivalent(pinned, installedVersion);
};

/**
 * Identifies packages whose exact pin differs from the installed version.
 *
 * @param {Array<object>} packages - List of package objects.
 * @returns {Array<object>} Filtered list of packages with mismatched exact pins.
 */
window.computeDrift = function (packages) {
  return packages.filter(pkg => {
    if (!pkg.installedVersion || !pkg.specifiedVersion) return false;
    return window.hasDrift(pkg.specifiedVersion, pkg.installedVersion);
  });
};

/**
 * Exact pin version for drift display (req: X vs installed).
 *
 * @param {object} pkg - The package object.
 * @returns {string} The exact pin version or specified version placeholder.
 */
window.getDriftReqVersion = function (pkg) {
  return window.extractExactPinnedVersion(pkg.specifiedVersion) || pkg.specifiedVersion || '?';
};
