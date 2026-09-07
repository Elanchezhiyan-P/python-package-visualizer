import * as fs from 'fs';
import { ScannedPackage, DepFileType } from '../packageScanner.js';
import {
  normalizeName,
  keyToGroup,
  keyToEnvironment
} from './utils.js';

/**
 * Parses setup.cfg configuration files using standard INI section parsing.
 * Extracts dependencies declared in `install_requires` under `[options]` section,
 * and handles development/test dependencies declared under `[options.extras_require]`.
 * 
 * @param filePath The absolute path to the setup.cfg file.
 * @returns An array of scanned packages found in the configuration.
 */
export function parseSetupCfg(filePath: string): ScannedPackage[] {
  if (!fs.existsSync(filePath)) { return []; }
  const content = fs.readFileSync(filePath, 'utf-8');
  const results: ScannedPackage[] = [];

  // Split into INI sections by lines starting with [
  const sectionParts = content.split(/^(?=\[)/m);

  for (const part of sectionParts) {
    const headerMatch = part.match(/^\[([^\]]+)\]/);
    if (!headerMatch) { continue; }

    const sectionName = headerMatch[1].trim();
    const body = part.slice(headerMatch[0].length);

    if (sectionName === 'options') {
      const depsValue = extractIniKey(body, 'install_requires');
      if (depsValue) {
        for (const dep of splitSetupCfgDeps(depsValue)) {
          const pkg = parseSingleDep(dep, 'setup.cfg', 'main', 'main');
          if (pkg) { results.push(pkg); }
        }
      }
    } else if (sectionName === 'options.extras_require') {
      for (const { key, value } of extractIniPairs(body)) {
        const grp = keyToGroup(key);
        const env = keyToEnvironment(key);
        for (const dep of splitSetupCfgDeps(value)) {
          const pkg = parseSingleDep(dep, 'setup.cfg', grp, env);
          if (pkg) { results.push(pkg); }
        }
      }
    }
  }

  return results;
}

function parseSingleDep(
  dep: string,
  source: DepFileType,
  group: ScannedPackage['group'],
  environment: ScannedPackage['environment'] = 'main'
): ScannedPackage | null {
  const m = dep.match(
    /^([A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?)(\[([^\]]+)\])?(.*)?$/
  );
  if (!m) { return null; }
  return {
    name: normalizeName(m[1]),
    specifiedVersion: (m[5] ?? '').trim(),
    installedVersion: '',
    source,
    extras: m[4] ? m[4].split(',').map(e => e.trim()) : [],
    requires: [],
    group,
    environment,
  };
}

function extractIniKey(body: string, key: string): string | null {
  // Matches: key = value\n  continuation\n  continuation
  const re = new RegExp(`^${key}\\s*=\\s*(.*(?:\\n[ \\t]+.*)*)`, 'm');
  const m = body.match(re);
  return m ? m[1] : null;
}

function extractIniPairs(body: string): Array<{ key: string; value: string }> {
  const pairs: Array<{ key: string; value: string }> = [];
  const re = /^([\w-]+)\s*=\s*(.*(?:\n[ \t]+.*)*)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    pairs.push({ key: m[1], value: m[2] });
  }
  return pairs;
}

function splitSetupCfgDeps(value: string): string[] {
  return value.split(/[\n;]/)
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && /^[A-Za-z]/.test(l));
}
