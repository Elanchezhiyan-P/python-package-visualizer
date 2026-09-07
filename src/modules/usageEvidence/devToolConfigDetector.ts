import * as fs from 'fs';
import * as toml from '@iarna/toml';
import { normalizeName } from '../import/normalize.js';
import { relPath, walkWorkspaceFiles } from './fileWalk.js';
import type { UsageEvidence } from './types.js';

/** Maps pyproject [tool.*] sections to the CLI packages they activate. */
const TOOL_SECTION_PACKAGES: Record<string, string> = {
  mypy: 'mypy',
  pylint: 'pylint',
  black: 'black',
  bandit: 'bandit',
  ruff: 'ruff',
  isort: 'isort',
  flake8: 'flake8',
  coverage: 'coverage',
};

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

function scanPyprojectTools(workspaceRoot: string, map: Map<string, UsageEvidence[]>): void {
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

    const tool = (parsed as { tool?: Record<string, unknown> })?.tool ?? {};
    const rel = relPath(workspaceRoot, file);

    for (const [section, pkg] of Object.entries(TOOL_SECTION_PACKAGES)) {
      if (tool[section] !== undefined) {
        addEvidence(map, pkg, {
          source: 'dev-tool-config',
          file: rel,
          snippet: `[tool.${section}]`,
          strength: 'strong',
        });
      }
    }
  }
}

function scanSetupCfg(workspaceRoot: string, map: Map<string, UsageEvidence[]>): void {
  const files = walkWorkspaceFiles(workspaceRoot, {
    extensions: new Set(['.cfg']),
    basename: name => name === 'setup.cfg',
  });

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const rel = relPath(workspaceRoot, file);

    for (const [section, pkg] of Object.entries(TOOL_SECTION_PACKAGES)) {
      const markers = [`[${section}]`, `[tool:${section}]`, `[mypy_`];
      if (section === 'mypy') {
        if (content.includes('[mypy]') || content.includes('[mypy-')) {
          addEvidence(map, pkg, {
            source: 'dev-tool-config',
            file: rel,
            snippet: '[mypy]',
            strength: 'strong',
          });
        }
        continue;
      }

      if (markers.some(m => content.includes(m))) {
        addEvidence(map, pkg, {
          source: 'dev-tool-config',
          file: rel,
          snippet: `[${section}]`,
          strength: 'strong',
        });
      }
    }
  }
}

/** Detects dev/lint tools referenced in pyproject.toml or setup.cfg. */
export function detectDevToolConfigUsage(workspaceRoot: string): Map<string, UsageEvidence[]> {
  const evidence = new Map<string, UsageEvidence[]>();
  scanPyprojectTools(workspaceRoot, evidence);
  scanSetupCfg(workspaceRoot, evidence);
  return evidence;
}
