import * as fs from 'fs';
import * as toml from '@iarna/toml';
import { resolveImportToPackageNames } from '../import/packageMatcher.js';
import { normalizeName } from '../import/normalize.js';
import { relPath, walkWorkspaceFiles } from './fileWalk.js';
import type { UsageEvidence } from './types.js';

function addEvidence(
  map: Map<string, UsageEvidence[]>,
  pkg: string,
  hit: UsageEvidence
): void {
  const norm = normalizeName(pkg);
  const list = map.get(norm) ?? [];
  if (list.length < 5) {
    list.push(hit);
  }
  map.set(norm, list);
}

/** Extracts the module path from a setuptools/poetry entry-point target. */
function moduleFromEntryPointTarget(target: string): string | undefined {
  const trimmed = target.trim().replace(/^['"]|['"]$/g, '');
  const modulePath = trimmed.split(':')[0]?.trim();
  if (!modulePath) {
    return undefined;
  }
  return modulePath;
}

function collectEntryPointTargets(value: unknown, targets: string[]): void {
  if (typeof value === 'string') {
    targets.push(value);
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }

  for (const nested of Object.values(value as Record<string, unknown>)) {
    collectEntryPointTargets(nested, targets);
  }
}

function evidenceFromTargets(
  map: Map<string, UsageEvidence[]>,
  targets: string[],
  file: string,
  snippet: string
): void {
  for (const target of targets) {
    const modulePath = moduleFromEntryPointTarget(target);
    if (!modulePath) {
      continue;
    }

    for (const pkg of resolveImportToPackageNames(modulePath)) {
      addEvidence(map, pkg, {
        source: 'scripts-entry-point',
        file,
        snippet,
        strength: 'strong',
      });
    }
  }
}

function scanPyprojectScripts(workspaceRoot: string, map: Map<string, UsageEvidence[]>): void {
  const files = walkWorkspaceFiles(workspaceRoot, {
    extensions: new Set(['.toml']),
    basename: name => name === 'pyproject.toml',
  });

  for (const file of files) {
    let parsed: Record<string, unknown>;
    try {
      parsed = toml.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>;
    } catch {
      continue;
    }

    const rel = relPath(workspaceRoot, file);
    const project = (parsed as { project?: Record<string, unknown> })?.project ?? {};
    const tool = (parsed as { tool?: Record<string, unknown> })?.tool ?? {};
    const poetry = (tool.poetry as Record<string, unknown> | undefined) ?? {};

    const targets: string[] = [];

    collectEntryPointTargets(project.scripts, targets);
    collectEntryPointTargets(project['entry-points'], targets);
    collectEntryPointTargets(poetry.scripts, targets);

    if (targets.length > 0) {
      evidenceFromTargets(map, targets, rel, '[project.scripts] or entry-points');
    }
  }
}

function scanSetupCfgEntryPoints(workspaceRoot: string, map: Map<string, UsageEvidence[]>): void {
  const files = walkWorkspaceFiles(workspaceRoot, {
    extensions: new Set(['.cfg']),
    basename: name => name === 'setup.cfg',
  });

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const rel = relPath(workspaceRoot, file);
    const targets: string[] = [];
    let inEntryPoints = false;

    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim();
      if (line.startsWith('[')) {
        inEntryPoints = line.startsWith('[options.entry_points]') || line.startsWith('[options.entry-points]');
        continue;
      }
      if (!inEntryPoints || !line || line.startsWith('#') || line.startsWith(';')) {
        continue;
      }

      const eq = line.indexOf('=');
      if (eq === -1) {
        continue;
      }
      targets.push(line.slice(eq + 1).trim());
    }

    if (targets.length > 0) {
      evidenceFromTargets(map, targets, rel, '[options.entry_points]');
    }
  }
}

/** Detects packages referenced by console scripts and plugin entry points. */
export function detectScriptsEntryUsage(workspaceRoot: string): Map<string, UsageEvidence[]> {
  const evidence = new Map<string, UsageEvidence[]>();
  scanPyprojectScripts(workspaceRoot, evidence);
  scanSetupCfgEntryPoints(workspaceRoot, evidence);
  return evidence;
}
