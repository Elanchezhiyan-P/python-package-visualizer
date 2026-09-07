import * as fs from 'fs';
import { ScannedPackage } from '../packageScanner.js';
import { normalizeName, keyToGroup, keyToEnvironment } from './utils.js';

/**
 * Parses setup.py dependency specifications without executing the script.
 * Uses robust regular expressions to extract packages declared in `install_requires`
 * and `extras_require` variables to mitigate the risk of arbitrary code execution.
 * 
 * @param filePath The absolute path to the setup.py file.
 * @returns An array of scanned packages found in the configuration.
 */
export function parseSetupPy(filePath: string): ScannedPackage[] {
  if (!fs.existsSync(filePath)) { return []; }
  const content = fs.readFileSync(filePath, 'utf-8');
  const results: ScannedPackage[] = [];

  const blockMatch = content.match(/install_requires\s*=\s*\[([^\]]*)\]/s);
  if (blockMatch) {
    const depEntries = blockMatch[1].matchAll(
      /['"]([A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?)(\[.*?\])?([^'"]*)['"]/g
    );

    for (const m of depEntries) {
      results.push({
        name: normalizeName(m[1]),
        specifiedVersion: (m[4] ?? '').trim(),
        installedVersion: '',
        source: 'setup.py',
        extras: m[3] ? m[3].slice(1, -1).split(',').map(e => e.trim()) : [],
        requires: [],
        group: 'main',
        environment: 'main',
      });
    }
  }

  // Parse extras_require for dev/test/docs groups
  const extrasMatch = content.match(/extras_require\s*=\s*\{([^}]*)\}/s);
  if (extrasMatch) {
    // Find each key: [list] section
    const sectionRe = /['"]([^'"]+)['"]\s*:\s*\[([^\]]*)\]/gs;
    let sectionM: RegExpExecArray | null;
    while ((sectionM = sectionRe.exec(extrasMatch[1])) !== null) {
      const sectionKey = sectionM[1];
      const grp = keyToGroup(sectionKey);
      const env = keyToEnvironment(sectionKey);
      const depEntries = sectionM[2].matchAll(
        /['"]([A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?)(\[.*?\])?([^'"]*)['"]/g
      );
      for (const m of depEntries) {
        results.push({
          name: normalizeName(m[1]),
          specifiedVersion: (m[4] ?? '').trim(),
          installedVersion: '',
          source: 'setup.py',
          extras: m[3] ? m[3].slice(1, -1).split(',').map(e => e.trim()) : [],
          requires: [],
          group: grp,
          environment: env,
        });
      }
    }
  }

  return results;
}
