import * as fs from 'fs';
import * as path from 'path';
import { IMPORT_TO_PACKAGE } from '../import/maps.js';
import { normalizeName } from '../import/normalize.js';
import { relPath, walkWorkspaceFiles } from './fileWalk.js';
import type { UsageEvidence } from './types.js';

/**
 * Detects third-party module references inside Django migration files
 * (e.g. phonenumber_field in field definitions without a direct app import).
 */
export function detectMigrationUsage(workspaceRoot: string): Map<string, UsageEvidence[]> {
  const evidence = new Map<string, UsageEvidence[]>();

  const files = walkWorkspaceFiles(workspaceRoot, {
    extensions: new Set(['.py']),
    dirname: () => true,
  }).filter(f => {
    const parts = f.split(path.sep);
    return parts.includes('migrations');
  });

  for (const file of files) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf-8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();

      for (const [importName, pkgName] of Object.entries(IMPORT_TO_PACKAGE)) {
        const moduleToken = importName.replace(/\./g, '_');
        const dotted = importName;
        if (!lower.includes(moduleToken) && !lower.includes(dotted) && !lower.includes(`'${importName}'`)) {
          continue;
        }

        const norm = normalizeName(pkgName);
        const hit: UsageEvidence = {
          source: 'migration-ref',
          file: relPath(workspaceRoot, file),
          line: i + 1,
          snippet: line.trim().slice(0, 120),
          strength: 'strong',
        };

        const list = evidence.get(norm) ?? [];
        if (list.length < 5) {
          list.push(hit);
        }
        evidence.set(norm, list);
      }
    }
  }

  return evidence;
}
