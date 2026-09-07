import * as fs from 'fs';
import * as path from 'path';
import type { Logger } from '../../utils/logger.js';
import { buildNameRegex } from './txtRequirements.js';

export type SyncResult =
  | { outcome: 'synced' }
  | { outcome: 'not-found' }
  | { outcome: 'unsupported'; reason: string };

/**
 * Removes a package dependency string from a pyproject.toml file.
 * Uses regex-based line editing to avoid full TOML reformat.
 */
export function removeFromToml(logger: Logger, filePath: string, packageName: string): SyncResult {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const nameRe = buildNameRegex(packageName);
    // WHY no 'g' flag: test() advances lastIndex on global regexes,
    // which would cause the subsequent replace() to miss the match.
    const lineRegex = new RegExp(
      `^(\\s*)(["'])(${nameRe.source}(?:\\[.*?\\])?)\\s*(?:[=!<>~^][^"']*)?\\2\\s*,?\\s*$`,
      'im'
    );

    if (!lineRegex.test(content)) {
      // Try Poetry [tool.poetry.dependencies] table entry: packagename = "^1.0"
      const poetryKeyRegex = new RegExp(
        `^\\s*${nameRe.source}\\s*=`,
        'im'
      );
      if (poetryKeyRegex.test(content)) {
        const updated = content.replace(
          new RegExp(`^\\s*${nameRe.source}\\s*=.*$\\n?`, 'im'),
          ''
        );
        fs.writeFileSync(filePath, updated, 'utf-8');
        logger.info(`Removed ${packageName} from ${path.basename(filePath)} (Poetry table)`);
        return { outcome: 'synced' };
      }

      // Strategy 3: Poetry inline table — packagename = {version = "^1.0", optional = true}
      const poetryInlineRegex = new RegExp(
        `^\\s*${nameRe.source}\\s*=\\s*\\{[^}]*\\}\\s*$\\n?`,
        'im'
      );
      if (poetryInlineRegex.test(content)) {
        const updated = content.replace(poetryInlineRegex, '');
        fs.writeFileSync(filePath, updated, 'utf-8');
        logger.info(`Removed ${packageName} from ${path.basename(filePath)} (Poetry inline table)`);
        return { outcome: 'synced' };
      }

      return { outcome: 'not-found' };
    }

    const updated = content.replace(lineRegex, '');
    fs.writeFileSync(filePath, updated, 'utf-8');
    logger.info(`Removed ${packageName} from ${path.basename(filePath)}`);
    return { outcome: 'synced' };
  } catch (err) {
    logger.error(`Failed to remove from TOML: ${String(err)}`);
    return { outcome: 'not-found' };
  }
}

/**
 * Syncs a package version inside a pyproject.toml file.
 * Handles two TOML dependency formats:
 *   1. PEP 621 array strings: "packagename>=1.0" → "packagename==2.0"
 *   2. Poetry table entries:   packagename = "^1.0" → packagename = "==2.0"
 */
export function syncVersionInToml(
  logger: Logger,
  filePath: string,
  packageName: string,
  newVersion: string
): SyncResult {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const nameRe = buildNameRegex(packageName);
    let updated = content;
    let changed = false;

    // Strategy 1: PEP 621 array element — "packagename>=1.0" or "packagename"
    // Matches lines like:   "requests>=2.0",
    const arrayLineRegex = new RegExp(
      `^(\\s*)(["'])(${nameRe.source})((?:\\[.*?\\])?)\\s*(?:[=!<>~^][^"']*)?\\2`,
      'im'
    );
    const arrayMatch = updated.match(arrayLineRegex);
    if (arrayMatch) {
      const indent = arrayMatch[1];
      const quote = arrayMatch[2];
      const extras = arrayMatch[4] || '';
      const replacement = `${indent}${quote}${packageName}${extras}==${newVersion}${quote}`;
      updated = updated.replace(arrayLineRegex, replacement);
      changed = true;
    }

    // Strategy 2: Poetry table entry — packagename = "^1.0" or packagename = {version = "^1.0", ...}
    if (!changed) {
      const poetrySimpleRegex = new RegExp(
        `^(\\s*)(${nameRe.source})(\\s*=\\s*)(["'])([^"']*?)\\4`,
        'im'
      );
      const poetryMatch = updated.match(poetrySimpleRegex);
      if (poetryMatch) {
        const indent = poetryMatch[1];
        const spacing = poetryMatch[3];
        const quote = poetryMatch[4];
        updated = updated.replace(
          poetrySimpleRegex,
          `${indent}${packageName}${spacing}${quote}==${newVersion}${quote}`
        );
        changed = true;
      }
    }

    // Strategy 3: Poetry inline table — packagename = {version = "^1.0", optional = true}
    if (!changed) {
      const poetryInlineRegex = new RegExp(
        `^(\\s*)(${nameRe.source})(\\s*=\\s*\\{[^}]*version\\s*=\\s*)(["'])([^"']*?)\\4`,
        'im'
      );
      const inlineMatch = updated.match(poetryInlineRegex);
      if (inlineMatch) {
        const indent = inlineMatch[1];
        const preVersion = inlineMatch[3];
        const quote = inlineMatch[4];
        updated = updated.replace(
          poetryInlineRegex,
          `${indent}${packageName}${preVersion}${quote}==${newVersion}${quote}`
        );
        changed = true;
      }
    }

    if (changed) {
      fs.writeFileSync(filePath, updated, 'utf-8');
      logger.info(`Synced ${packageName}==${newVersion} in ${path.basename(filePath)}`);
      return { outcome: 'synced' };
    }
  } catch (err) {
    logger.error(`Failed to sync TOML: ${String(err)}`);
  }
  return { outcome: 'not-found' };
}
