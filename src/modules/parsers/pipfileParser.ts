import * as fs from 'fs';
import * as toml from '@iarna/toml';
import { ScannedPackage } from '../packageScanner.js';
import { normalizeName } from './utils.js';

/**
 * Parses Pipfile dependency configurations using TOML specification.
 * Extracts dependencies declared in the `[packages]` and `[dev-packages]` tables,
 * handling simple string constraints as well as detailed table options (e.g. extras).
 * 
 * @param filePath The absolute path to the Pipfile.
 * @param logger Optional logging utility to record parser warnings.
 * @returns An array of scanned packages found in the configuration.
 */
export function parsePipfile(
  filePath: string,
  logger?: { warn: (msg: string) => void }
): ScannedPackage[] {
  if (!fs.existsSync(filePath)) { return []; }
  const content = fs.readFileSync(filePath, 'utf-8');
  let parsed: Record<string, unknown>;
  try {
    parsed = toml.parse(content) as Record<string, unknown>;
  } catch (err) {
    if (logger) {
      logger.warn(`Failed to parse Pipfile as TOML: ${String(err)}`);
    }
    return [];
  }

  const results: ScannedPackage[] = [];
  const skip = new Set(['python_version', 'python_full_version']);

  const processSection = (
    section: Record<string, unknown>,
    group: 'main' | 'dev',
    environment: 'main' | 'dev'
  ): void => {
    for (const [pkgName, version] of Object.entries(section)) {
      if (skip.has(pkgName.toLowerCase())) { continue; }
      let spec = '';
      let extras: string[] = [];
      if (typeof version === 'string') {
        spec = version === '*' ? '' : version;
      } else if (typeof version === 'object' && version !== null) {
        const v = version as Record<string, unknown>;
        spec = typeof v['version'] === 'string' ? (v['version'] === '*' ? '' : v['version']) : '';
        if (Array.isArray(v['extras'])) {
          extras = (v['extras'] as unknown[]).map(String);
        }
      }
      results.push({
        name: normalizeName(pkgName),
        specifiedVersion: spec,
        installedVersion: '',
        source: 'Pipfile',
        extras,
        requires: [],
        group,
        environment,
      });
    }
  };

  const packages = parsed['packages'] as Record<string, unknown> | undefined;
  const devPackages = parsed['dev-packages'] as Record<string, unknown> | undefined;
  if (packages) { processSection(packages, 'main', 'main'); }
  if (devPackages) { processSection(devPackages, 'dev', 'dev'); }

  return results;
}
