/**
 * Package identity, download/date formatting, health, size, and license helpers.
 */

/** PEP 503 package name normalization (matches backend normalizeName). */
window.normalizePkgName = function (name) {
  return String(name ?? '').toLowerCase().replace(/[-_.]+/g, '-');
};

/** True when a string is pip show metadata, not a real package name (matches backend). */
window.isPipMetadataToken = function (value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) {
    return true;
  }
  if (/^required-by\b/i.test(raw) || /^requires\b/i.test(raw) || raw.includes('required-by')) {
    return true;
  }
  return false;
};

/** Drops pip show metadata accidentally parsed as dependency names (matches backend). */
window.sanitizeRequiresList = function (requires) {
  return (requires ?? [])
    .map(r => String(r).trim())
    .filter(r => r.length > 0 && !window.isPipMetadataToken(r))
    .map(r => window.normalizePkgName(r))
    .filter(r => r.length > 0 && !window.isPipMetadataToken(r));
};

/**
 * Formats package weekly download numbers into a concise human-readable string.
 * This ensures the layout is not cluttered by large digit counts.
 * 
 * @param {number} n - The raw download count.
 * @returns {string} Formatted download representation (e.g. 1.2M, 50K, 150).
 */
window.formatDownloads = function (n) {
  if (!n || n <= 0) return '';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
};

/**
 * Converts standard release date strings into localized US short format.
 * This is used to maintain a clean timeline and column width.
 * 
 * @param {string} dateStr - Raw release date (YYYY-MM-DD).
 * @returns {string} The formatted local date string.
 */
window.formatReleaseDate = function (dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
};

/**
 * Computes an overall health score (0-100) based on severity factors.
 * Factoring in security vulnerabilities, updates, and package decay.
 * 
 * @param {object} pkg - The package object.
 * @returns {number} The final calculated health score.
 */
window.healthScore = function (pkg) {
  let s = 100;
  if (pkg.vulnerabilities && pkg.vulnerabilities.length > 0) s -= 30;
  if (pkg.status === 'update-available') s -= 20;
  if (pkg.status === 'unknown' || pkg.status === 'not-installed') s -= 10;
  if (pkg.releaseDate) {
    const days = (Date.now() - new Date(pkg.releaseDate + 'T00:00:00').getTime()) / 86400000;
    if (days > 730) s -= 20;
    else if (days > 365) s -= 10;
  }
  return Math.max(0, Math.min(100, s));
};

/**
 * Generates dynamic SVG markup for package health rings.
 * Visually communicates health scores with adaptive color zones.
 * 
 * @param {object} pkg - The package object.
 * @returns {string} SVG HTML template.
 */
window.healthRingHtml = function (pkg) {
  const score = window.healthScore(pkg);
  const r = 9, circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const cls = score >= 80 ? 'health-score-good' : score >= 50 ? 'health-score-warn' : 'health-score-bad';
  return `<svg class="health-ring ${cls}" width="24" height="24" viewBox="0 0 24 24" title="Health: ${score}/100">
    <circle class="track" cx="12" cy="12" r="${r}"/>
    <circle class="fill" cx="12" cy="12" r="${r}"
      stroke-dasharray="${circ.toFixed(2)}"
      stroke-dashoffset="${offset.toFixed(2)}"
      transform="rotate(-90 12 12)"/>
    <text class="health-score-text" x="12" y="12">${score}</text>
  </svg>`;
};

/**
 * Returns a size categorizing class based on install bytes size.
 * Tints row columns differently for high disk-usage packages.
 * 
 * @param {number} bytes - Install size in bytes.
 * @returns {string} The corresponding CSS layout tint class.
 */
window.sizeTintClass = function (bytes) {
  if (!bytes || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  if (mb > 50)  return 'size-xl';
  if (mb > 10)  return 'size-lg';
  if (mb > 1)   return 'size-md';
  return '';
};

/**
 * Assesses the potential risk of a license string for commercial compliance.
 * Colors indicators red for AGPL/GPL copyleft licenses.
 * 
 * @param {string} license - The raw license identifier.
 * @returns {string} Category ('safe' | 'caution' | 'restricted' | 'unknown').
 */
window.getLicenseRisk = function (license) {
  if (!license) return 'unknown';
  const lower = String(license).toLowerCase();
  if (/\bagpl\b/.test(lower) || (/\bgpl\b/.test(lower) && !/\blgpl\b/.test(lower))) return 'restricted';
  if (/\bcommercial\b/.test(lower) || /\bproprietary\b/.test(lower)) return 'restricted';
  if (/\blgpl\b/.test(lower) || /\bepl\b/.test(lower) || /\bcddl\b/.test(lower)) return 'caution';
  if (/\bmpl-?2(\.0)?\b/.test(lower)) return 'safe';
  if (/\bmpl\b/.test(lower) || /\beupl\b/.test(lower)) return 'caution';
  if (/\bmit\b|\bbsd\b|\bapache\b|\bisc\b|\bunlicense\b|\bpsf\b|\bwtfpl\b|\bcc0\b/.test(lower)) return 'safe';
  return 'unknown';
};

/**
 * Normalizes a raw PyPI license field into a short display label.
 * PyPI often returns the full legal text instead of an SPDX id — that must not
 * be used as a group title or detail primary value.
 *
 * @param {string} raw
 * @returns {{ label: string, raw: string, isLong: boolean }}
 */
window.normalizeLicenseDisplay = function (raw) {
  const text = String(raw ?? '').trim();
  if (!text || text === 'UNKNOWN') {
    return { label: 'Unknown', raw: text, isLong: false };
  }

  const MAX_LABEL = 40;
  const isLong =
    text.length > MAX_LABEL ||
    /\r|\n/.test(text) ||
    /^copyright\b/i.test(text) ||
    /\bredistribution and use\b/i.test(text) ||
    /\bpermission is hereby granted\b/i.test(text) ||
    /\ball rights reserved\b/i.test(text) ||
    /\bthe software is provided\b/i.test(text) ||
    /\bas is\b/i.test(text) && text.length > 60;

  const patterns = [
    { re: /\bAGPL[- ]?v?3\b|\bGNU Affero General Public License\b/i, label: 'AGPL-3.0' },
    { re: /\bAGPL[- ]?v?2\b/i, label: 'AGPL-2.0' },
    { re: /\bLGPL[- ]?v?3\b|\bLesser General Public License\b.*\b3/i, label: 'LGPL-3.0' },
    { re: /\bLGPL[- ]?v?2\.?1?\b|\bLesser General Public License\b/i, label: 'LGPL-2.1' },
    { re: /\bGPL[- ]?v?3\b|\bGeneral Public License\b.*\bversion 3\b/i, label: 'GPL-3.0' },
    { re: /\bGPL[- ]?v?2\b|\bGeneral Public License\b.*\bversion 2\b/i, label: 'GPL-2.0' },
    { re: /\bMPL[- ]?2\.0\b|\bMozilla Public License\b/i, label: 'MPL-2.0' },
    { re: /\bApache[- ]?2\.0\b|\bApache License\b.*\b2\.0\b|\bApache Software License\b/i, label: 'Apache-2.0' },
    { re: /\bBSD[- ]?3[- ]Clause\b|\b3[- ]Clause BSD\b|\bBSD 3-Clause\b|\brevised BSD\b|\bBSD\s*\(\s*3[- ]?clause\s*\)/i, label: 'BSD-3-Clause' },
    { re: /\bBSD[- ]?2[- ]Clause\b|\b2[- ]Clause BSD\b|\bBSD 2-Clause\b|\bSimplified BSD\b|\bBSD\s*\(\s*2[- ]?clause\s*\)/i, label: 'BSD-2-Clause' },
    { re: /\bRedistribution and use in source and binary forms\b/i, label: 'BSD-3-Clause' },
    { re: /\bBSD\b/i, label: 'BSD' },
    { re: /\bMIT\b|\bExpat\b|\bPermission is hereby granted, free of charge\b/i, label: 'MIT' },
    { re: /\bISC\b/i, label: 'ISC' },
    { re: /\bPSF\b|\bPython Software Foundation\b/i, label: 'PSF' },
    { re: /\bUnlicense\b/i, label: 'Unlicense' },
    { re: /\bCC0\b/i, label: 'CC0-1.0' },
    { re: /\bEPL[- ]?2\.0\b|\bEclipse Public License\b/i, label: 'EPL-2.0' },
    { re: /\bproprietary\b|\bcommercial\b/i, label: 'Proprietary' },
  ];

  const clampLabel = (label) => {
    const s = String(label || '').trim();
    if (s.length <= MAX_LABEL) return s;
    return `${s.slice(0, MAX_LABEL - 1).trim()}…`;
  };

  for (const { re, label } of patterns) {
    if (re.test(text)) {
      // Matched SPDX-like id: still mark as long when raw body is the full legal text
      return { label, raw: text, isLong: isLong || text.length > label.length + 10 };
    }
  }

  if (isLong) {
    const firstLine = text.split(/\r?\n/).map(l => l.trim()).find(Boolean) || text;
    return { label: clampLabel(firstLine), raw: text, isLong: true };
  }

  return { label: clampLabel(text), raw: text, isLong: text.length > MAX_LABEL };
};
