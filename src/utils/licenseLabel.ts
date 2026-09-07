/**
 * Short display label for license strings (hover / status).
 * Mirrors the webview normalizeLicenseDisplay intent without pulling DOM helpers.
 */

const MAX = 40;

const PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bAGPL[- ]?v?3\b|\bGNU Affero General Public License\b/i, label: 'AGPL-3.0' },
  { re: /\bLGPL\b/i, label: 'LGPL' },
  { re: /\bGPL[- ]?v?3\b|\bGeneral Public License\b.*\b3\b/i, label: 'GPL-3.0' },
  { re: /\bGPL\b/i, label: 'GPL' },
  { re: /\bApache[- ]?2/i, label: 'Apache-2.0' },
  { re: /\bBSD[- ]?3|\bRedistribution and use in source and binary forms\b/i, label: 'BSD-3-Clause' },
  { re: /\bBSD\b/i, label: 'BSD' },
  { re: /\bMIT\b|\bExpat\b|\bPermission is hereby granted, free of charge\b/i, label: 'MIT' },
  { re: /\bMPL[- ]?2/i, label: 'MPL-2.0' },
  { re: /\bPSF\b|\bPython Software Foundation\b/i, label: 'PSF' },
];

export function shortLicenseLabel(raw: string | undefined | null): string {
  const text = String(raw ?? '').trim();
  if (!text) {
    return '';
  }
  for (const { re, label } of PATTERNS) {
    if (re.test(text)) {
      return label;
    }
  }
  if (text.length <= MAX && !/[\r\n]/.test(text)) {
    return text;
  }
  const firstLine = text.split(/\r?\n/).map(l => l.trim()).find(Boolean) || text;
  return firstLine.length > MAX ? `${firstLine.slice(0, MAX - 1).trim()}…` : firstLine;
}
