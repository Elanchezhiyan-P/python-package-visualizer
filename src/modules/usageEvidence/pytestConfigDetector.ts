import * as fs from 'fs';
import * as toml from '@iarna/toml';
import { normalizeName } from '../import/normalize.js';
import { relPath, walkWorkspaceFiles } from './fileWalk.js';
import type { UsageEvidence } from './types.js';

const PYTEST_PLUGIN_PACKAGES: Record<string, string> = {
  'pytest_django': 'pytest-django',
  'pytest_django.plugin': 'pytest-django',
  'pytest_cov': 'pytest-cov',
  'pytest_asyncio': 'pytest-asyncio',
  'pytest_mock': 'pytest-mock',
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

function scanPyprojectToml(workspaceRoot: string, map: Map<string, UsageEvidence[]>): void {
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

    const pytestOpts =
      (parsed as { tool?: { pytest?: { ini_options?: Record<string, unknown> } } })
        ?.tool?.pytest?.ini_options ?? {};

    const rel = relPath(workspaceRoot, file);

    if (pytestOpts.DJANGO_SETTINGS_MODULE) {
      addEvidence(map, 'pytest-django', {
        source: 'pytest-config',
        file: rel,
        snippet: `DJANGO_SETTINGS_MODULE = ${String(pytestOpts.DJANGO_SETTINGS_MODULE)}`,
        strength: 'strong',
      });
    }

    const plugins = pytestOpts.plugins;
    if (Array.isArray(plugins)) {
      for (const plugin of plugins) {
        const pkg = PYTEST_PLUGIN_PACKAGES[String(plugin).toLowerCase()];
        if (pkg) {
          addEvidence(map, pkg, {
            source: 'pytest-config',
            file: rel,
            snippet: `plugins = ${String(plugin)}`,
            strength: 'strong',
          });
        }
      }
    }
  }
}

function scanPytestIni(workspaceRoot: string, map: Map<string, UsageEvidence[]>): void {
  const names = ['pytest.ini', 'tox.ini', 'setup.cfg'];
  const files = walkWorkspaceFiles(workspaceRoot, {
    extensions: new Set(['.ini', '.cfg']),
    basename: name => names.includes(name),
  });

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const rel = relPath(workspaceRoot, file);
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();

      if (lower.includes('django_settings_module')) {
        addEvidence(map, 'pytest-django', {
          source: 'pytest-config',
          file: rel,
          line: i + 1,
          snippet: line.trim().slice(0, 120),
          strength: 'strong',
        });
      }

      for (const [plugin, pkg] of Object.entries(PYTEST_PLUGIN_PACKAGES)) {
        if (lower.includes(plugin)) {
          addEvidence(map, pkg, {
            source: 'pytest-config',
            file: rel,
            line: i + 1,
            snippet: line.trim().slice(0, 120),
            strength: 'strong',
          });
        }
      }
    }
  }
}

function scanConftest(workspaceRoot: string, map: Map<string, UsageEvidence[]>): void {
  const files = walkWorkspaceFiles(workspaceRoot, {
    extensions: new Set(['.py']),
    basename: name => name === 'conftest.py',
  });

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const rel = relPath(workspaceRoot, file);
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.includes('pytest_plugins')) {
        continue;
      }

      for (const [plugin, pkg] of Object.entries(PYTEST_PLUGIN_PACKAGES)) {
        if (line.includes(plugin)) {
          addEvidence(map, pkg, {
            source: 'pytest-config',
            file: rel,
            line: i + 1,
            snippet: line.trim().slice(0, 120),
            strength: 'strong',
          });
        }
      }

      if (line.includes('pytest_django')) {
        addEvidence(map, 'pytest-django', {
          source: 'pytest-config',
          file: rel,
          line: i + 1,
          snippet: line.trim().slice(0, 120),
          strength: 'strong',
        });
      }
    }
  }
}

/** Detects pytest plugins configured via pyproject, ini files, or conftest.py. */
export function detectPytestConfigUsage(workspaceRoot: string): Map<string, UsageEvidence[]> {
  const evidence = new Map<string, UsageEvidence[]>();
  scanPyprojectToml(workspaceRoot, evidence);
  scanPytestIni(workspaceRoot, evidence);
  scanConftest(workspaceRoot, evidence);
  return evidence;
}
