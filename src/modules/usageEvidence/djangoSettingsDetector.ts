import * as fs from 'fs';
import { normalizeName } from '../import/normalize.js';
import { DJANGO_APP_MAP } from './djangoAppMap.js';
import { relPath, walkWorkspaceFiles } from './fileWalk.js';
import type { UsageEvidence } from './types.js';

const SETTINGS_LIST_KEYS = [
  'INSTALLED_APPS',
  'MIDDLEWARE',
  'AUTHENTICATION_BACKENDS',
];

/** Extracts quoted string tokens from Python list/tuple literals on following lines. */
function extractListStrings(content: string, key: string): Array<{ value: string; line: number; snippet: string }> {
  const results: Array<{ value: string; line: number; snippet: string }> = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes(key)) {
      continue;
    }

    const block = [line];
    let j = i + 1;
    while (j < lines.length && !lines[j].includes(']') && !lines[j].includes(')')) {
      block.push(lines[j]);
      j++;
      if (j < lines.length && (lines[j].includes(']') || lines[j].includes(')'))) {
        block.push(lines[j]);
        break;
      }
    }
    if (j < lines.length && j > i && !block.includes(lines[j])) {
      if (lines[j].includes(']') || lines[j].includes(')')) {
        block.push(lines[j]);
      }
    }

    const combined = block.join('\n');
    const stringRe = /['"]([a-zA-Z][a-zA-Z0-9_.]*)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = stringRe.exec(combined)) !== null) {
      results.push({
        value: match[1],
        line: i + 1,
        snippet: line.trim().slice(0, 120),
      });
    }
  }

  return results;
}

function resolveAppToken(token: string): { pkg: string; settingsOnly: boolean } | undefined {
  const top = token.split('.')[0].toLowerCase();
  const mapped = DJANGO_APP_MAP[top];
  if (mapped) {
    return { pkg: normalizeName(mapped.package), settingsOnly: mapped.settingsOnly };
  }
  return undefined;
}

/**
 * Detects Django packages referenced in settings.py via INSTALLED_APPS, MIDDLEWARE, etc.
 */
export function detectDjangoSettingsUsage(workspaceRoot: string): Map<string, UsageEvidence[]> {
  const evidence = new Map<string, UsageEvidence[]>();

  const files = walkWorkspaceFiles(workspaceRoot, {
    extensions: new Set(['.py']),
    basename: name => name.startsWith('settings') || name.includes('settings'),
  });

  for (const file of files) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }

    if (!content.includes('INSTALLED_APPS') && !content.includes('MIDDLEWARE') && !content.includes('AUTHENTICATION_BACKENDS')) {
      continue;
    }

    for (const key of SETTINGS_LIST_KEYS) {
      for (const { value, line, snippet } of extractListStrings(content, key)) {
        const resolved = resolveAppToken(value);
        if (!resolved) {
          continue;
        }

        const hit: UsageEvidence = {
          source: 'django-installed-apps',
          file: relPath(workspaceRoot, file),
          line,
          snippet,
          strength: resolved.settingsOnly ? 'strong' : 'weak',
        };

        const list = evidence.get(resolved.pkg) ?? [];
        if (list.length < 5) {
          list.push(hit);
        }
        evidence.set(resolved.pkg, list);
      }
    }
  }

  return evidence;
}
