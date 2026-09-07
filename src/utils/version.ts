/**
 * Shared version constraint parsing utilities.
 * Centralizes the regex logic to extract pinned versions from PEP 440 specifiers,
 * preventing duplication across handlers.
 *
 * Model:
 * - Drift = exact pin (`==` / `===`) in the file differs from the installed version
 * - Align/Sync = rewrite the file to `==installed` (may tighten a range; warn in UI)
 * - Flexible constraints (`>=`, `~=`, multi-clause ranges) are not drift
 * - Post-update auto-sync only rewrites exact pins (never silent range→==)
 */

/** Regex matching any PEP 440 comparison operator + version (first clause). */
const VERSION_CONSTRAINT_RE = /[=!<>~^]+\s*([\d][^\s,;]*)/;

/** Sole exact-equality pin after stripping environment markers. */
const EXACT_PIN_RE = /^===?\s*([^\s,]+)\s*$/;

/**
 * Splits a version into numeric core + remaining suffix (pre/post/dev tags).
 * Trailing .0 on the core are stripped for equivalence (1.0.0 ≈ 1.0).
 */
function splitVersionParts(version: string): { core: string; suffix: string } {
  const trimmed = version.trim();
  const m = trimmed.match(/^(\d+(?:\.\d+)*)(.*)$/);
  if (!m) {
    return { core: trimmed, suffix: '' };
  }
  const parts = m[1].split('.').map(p => String(parseInt(p, 10)));
  while (parts.length > 1 && parts[parts.length - 1] === '0') {
    parts.pop();
  }
  return { core: parts.join('.'), suffix: m[2].toLowerCase() };
}

/**
 * Returns true when two version strings refer to the same release (loose PEP 440 compare).
 * Pre-release / post / dev suffixes must match (1.0.0a1 ≠ 1.0.0).
 */
export function versionsEquivalent(a: string, b: string): boolean {
  const pa = splitVersionParts(a);
  const pb = splitVersionParts(b);
  return pa.core === pb.core && pa.suffix === pb.suffix;
}

/**
 * Strips PEP 508 environment markers (`; python_version >= "3.10"`).
 */
function stripMarkers(specifiedVersion: string): string {
  return specifiedVersion.split(';')[0].trim();
}

/**
 * Extracts the first version number found in any comparison clause.
 * Useful as a hint (e.g. install), not as an exact-pin check.
 * For example, `"==1.2.3"` → `"1.2.3"`, `">=2.0,<3.0"` → `"2.0"`.
 *
 * @param specifiedVersion - The raw constraint string from requirements files.
 * @returns The extracted version string, or null if no version could be parsed.
 */
export function extractPinnedVersion(specifiedVersion: string): string | null {
  if (!specifiedVersion) {
    return null;
  }
  const m = specifiedVersion.match(VERSION_CONSTRAINT_RE);
  return m ? m[1] : null;
}

/**
 * Returns the version from a sole exact pin (`==1.2.3` / `===1.2.3`).
 * Multi-clause, ranges, and wildcards (`==1.2.*`) return null.
 */
export function extractExactPinnedVersion(specifiedVersion: string): string | null {
  if (!specifiedVersion?.trim()) {
    return null;
  }
  const core = stripMarkers(specifiedVersion);
  if (!core || core.includes(',')) {
    return null;
  }
  const m = core.match(EXACT_PIN_RE);
  if (!m) {
    return null;
  }
  // Wildcards are not sole exact pins for drift/sync purposes
  if (m[1].includes('*')) {
    return null;
  }
  return m[1];
}

/**
 * True when the specifier is a sole exact equality pin.
 */
export function isExactPin(specifiedVersion: string): boolean {
  return extractExactPinnedVersion(specifiedVersion) !== null;
}

/**
 * True when Align/Sync would change a non-exact specifier into `==installed`
 * (bare name, range, compatible-release, multi-clause, etc.).
 */
export function wouldTightenToExactPin(specifiedVersion: string): boolean {
  return !isExactPin(specifiedVersion ?? '');
}

/**
 * Determines whether a package has version drift — i.e. an exact pin (`==`)
 * in the requirements file differs from the actually installed version.
 * Range / flexible constraints never count as drift (installed may still satisfy them).
 *
 * @param specifiedVersion - The constraint from the requirements file.
 * @param installedVersion - The currently installed version.
 * @returns True if an exact pin differs from the installed version.
 */
export function hasDrift(specifiedVersion: string, installedVersion: string): boolean {
  const pinned = extractExactPinnedVersion(specifiedVersion);
  return pinned !== null && !versionsEquivalent(pinned, installedVersion);
}

/**
 * Simplified PEP 440-aware version comparator (numeric segments only).
 * Returns negative if a < b, 0 if equal, positive if a > b.
 */
export function compareVersions(a: string, b: string): number {
  const normalize = (v: string): number[] =>
    v
      .replace(/[^0-9.]/g, '')
      .split('.')
      .map(Number);

  const pa = normalize(a);
  const pb = normalize(b);
  const len = Math.max(pa.length, pb.length);

  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

/** True when an ignored PyPI release still covers the current latest (no new actionable update). */
export function isUpdateSuppressedByIgnore(ignoredVersion: string, latestVersion: string): boolean {
  if (!ignoredVersion || !latestVersion || latestVersion === 'unknown') {
    return false;
  }
  return compareVersions(ignoredVersion, latestVersion) >= 0;
}
