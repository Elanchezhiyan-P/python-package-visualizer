import * as fs from 'fs';
import * as toml from '@iarna/toml';
import { ScannedPackage } from '../packageScanner.js';
import { normalizeName, keyToGroup, keyToEnvironment } from './utils.js';

/**
 * Parses pyproject.toml configuration files.
 * Extracts PEP 621 dependencies, optional dependencies, and Poetry group dependencies.
 * 
 * @param filePath The absolute path to the pyproject.toml file.
 * @returns An array of scanned packages found in the configuration.
 */
export function parsePyprojectToml(filePath: string): ScannedPackage[] {
  if (!fs.existsSync(filePath)) { return []; }
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = toml.parse(content) as Record<string, unknown>;
  const results: ScannedPackage[] = [];

  // PEP 621: [project] dependencies = ["requests>=2.0", ...]
  const projectDeps =
    (parsed as { project?: { dependencies?: unknown[] } })?.project
      ?.dependencies ?? [];
  for (const dep of projectDeps as string[]) {
    const m = dep.match(/^([A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?)(\[.*?\])?(.*)?$/);
    if (m) {
      results.push({
        name: normalizeName(m[1]),
        specifiedVersion: (m[4] ?? '').trim(),
        installedVersion: '',
        source: 'pyproject.toml',
        extras: m[3] ? m[3].slice(1, -1).split(',').map(e => e.trim()) : [],
        requires: [],
        group: 'main',
        environment: 'main',
      });
    }
  }

  // PEP 621: [project.optional-dependencies] sections
  const optionalDeps =
    (parsed as { project?: { 'optional-dependencies'?: Record<string, unknown[]> } })
      ?.project?.['optional-dependencies'] ?? {};
  for (const [sectionKey, deps] of Object.entries(optionalDeps)) {
    const grp = keyToGroup(sectionKey);
    for (const dep of deps as string[]) {
      const m = dep.match(/^([A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?)(\[.*?\])?(.*)?$/);
      if (m) {
        results.push({
          name: normalizeName(m[1]),
          specifiedVersion: (m[4] ?? '').trim(),
          installedVersion: '',
          source: 'pyproject.toml',
          extras: m[3] ? m[3].slice(1, -1).split(',').map(e => e.trim()) : [],
          requires: [],
          group: grp,
          environment: 'main',
        });
      }
    }
  }

  // Poetry: [tool.poetry.dependencies]
  const poetryDeps =
    (
      parsed as {
        tool?: { poetry?: { dependencies?: Record<string, unknown> } };
      }
    )?.tool?.poetry?.dependencies ?? {};
  for (const [pkgName, version] of Object.entries(poetryDeps)) {
    if (pkgName.toLowerCase() === 'python') {
      continue;
    }
    const spec =
      typeof version === 'string'
        ? version
        : (version as Record<string, string>)?.version ?? '';
    results.push({
      name: normalizeName(pkgName),
      specifiedVersion: spec,
      installedVersion: '',
      source: 'pyproject.toml',
      extras: [],
      requires: [],
      group: 'main',
      environment: 'main',
    });
  }

  // Poetry: [tool.poetry.dev-dependencies]
  const poetryDevDeps =
    (
      parsed as {
        tool?: { poetry?: { 'dev-dependencies'?: Record<string, unknown> } };
      }
    )?.tool?.poetry?.['dev-dependencies'] ?? {};
  for (const [pkgName, version] of Object.entries(poetryDevDeps)) {
    const spec =
      typeof version === 'string'
        ? version
        : (version as Record<string, string>)?.version ?? '';
    results.push({
      name: normalizeName(pkgName),
      specifiedVersion: spec,
      installedVersion: '',
      source: 'pyproject.toml',
      extras: [],
      requires: [],
      group: 'dev',
      environment: 'dev',
    });
  }

  // Poetry: [tool.poetry.group.<name>.dependencies]
  const poetryGroups =
    (
      parsed as {
        tool?: { poetry?: { group?: Record<string, { dependencies?: Record<string, unknown> }> } };
      }
    )?.tool?.poetry?.group ?? {};
  for (const [groupName, groupData] of Object.entries(poetryGroups)) {
    const grp = keyToGroup(groupName);
    const env = keyToEnvironment(groupName);
    for (const [pkgName, version] of Object.entries(groupData.dependencies ?? {})) {
      const spec =
        typeof version === 'string'
          ? version
          : (version as Record<string, string>)?.version ?? '';
      results.push({
        name: normalizeName(pkgName),
        specifiedVersion: spec,
        installedVersion: '',
        source: 'pyproject.toml',
        extras: [],
        requires: [],
        group: grp,
        environment: env,
      });
    }
  }

  return results;
}
