import * as path from 'path';
import type { Logger } from '../../utils/logger.js';
import {
  readDependencyFileContent,
  writeDependencyFileContent,
} from '../parsers/utils.js';

export type SyncResult =
  | { outcome: 'synced' }
  | { outcome: 'not-found' }
  | { outcome: 'unsupported'; reason: string };

/**
 * Builds a regex fragment that matches any delimiter variant of a package name.
 * E.g. "auto-flake" → /auto[-_.]+flake/
 * Ensures names with no delimiters match literally.
 */
export function buildNameRegex(packageName: string): RegExp {
  const pattern = packageName.replace(/[-_.]/g, '[-_.]+');
  return new RegExp(pattern);
}

/**
 * Matches a requirements line that declares the given package, including
 * PEP 508 direct references (`name @ git+...`) and bare names.
 */
export function buildRequirementLineRegex(packageName: string): RegExp {
  const nameRe = buildNameRegex(packageName);
  return new RegExp(
    `^\\s*(${nameRe.source}(?:\\[.*?\\])?)\\s*(?:[@=!<>~^]|$)`,
    'i'
  );
}

/**
 * Joins PEP 508 line continuations before matching, mirroring requirementsParser.
 */
export function splitRequirementLines(content: string): string[] {
  const normalized = content.replace(/\\\r?\n\s*/g, ' ');
  return normalized.split('\n');
}

/**
 * Rewrites a single requirements line to pin the installed version,
 * preserving environment markers and pip hash options.
 */
export function rewriteTxtRequirementVersion(
  stripped: string,
  packageName: string,
  newVersion: string
): string | null {
  const nameRe = buildNameRegex(packageName);

  const directRef = new RegExp(
    `^(${nameRe.source}(?:\\[.*?\\])?)\\s*@\\s*.+$`,
    'i'
  );
  const directMatch = stripped.match(directRef);
  if (directMatch) {
    const extras = directMatch[1].includes('[')
      ? directMatch[1].slice(directMatch[1].indexOf('['))
      : '';
    return `${packageName}${extras}==${newVersion}`;
  }

  const versionedRegex = new RegExp(
    `^(${nameRe.source}(?:\\[.*?\\])?)\\s*([=!<>~^][^\\s;]*)(.*)$`,
    'i'
  );
  const versionedMatch = stripped.match(versionedRegex);
  if (versionedMatch) {
    const extras = versionedMatch[1].includes('[')
      ? versionedMatch[1].slice(versionedMatch[1].indexOf('['))
      : '';
    const tail = versionedMatch[3] ?? '';
    return `${packageName}${extras}==${newVersion}${tail}`;
  }

  const bareRegex = new RegExp(
    `^(${nameRe.source}(?:\\[.*?\\])?)\\s*(;.*)?$`,
    'i'
  );
  const bareMatch = stripped.match(bareRegex);
  if (bareMatch) {
    const extras = bareMatch[1].includes('[')
      ? bareMatch[1].slice(bareMatch[1].indexOf('['))
      : '';
    const marker = bareMatch[2] ?? '';
    return `${packageName}${extras}==${newVersion}${marker}`;
  }

  return null;
}

/**
 * Removes a package line from a requirements-style text file.
 */
export function removeFromTxt(logger: Logger, filePath: string, packageName: string): SyncResult {
  try {
    const { content, encoding } = readDependencyFileContent(filePath);
    const lines = splitRequirementLines(content);
    const fullRegex = buildRequirementLineRegex(packageName);

    const filtered = lines.filter(line => {
      const stripped = line.trim();
      if (stripped.startsWith('#') || stripped === '') { return true; }
      return !fullRegex.test(stripped);
    });

    if (filtered.length !== lines.length) {
      // Remove trailing blank lines left by the deletion
      while (filtered.length > 0 && filtered[filtered.length - 1].trim() === '') {
        filtered.pop();
      }
      writeDependencyFileContent(filePath, filtered.join('\n') + '\n', encoding);
      logger.info(`Removed ${packageName} from ${path.basename(filePath)}`);
      return { outcome: 'synced' };
    }
  } catch (err) {
    logger.error(`Failed to remove package from requirements: ${String(err)}`);
  }
  return { outcome: 'not-found' };
}

/**
 * Syncs a package version inside a requirements-style text file.
 * Uses the canonical (PEP 503) package name in the rewritten line.
 */
export function syncVersionInTxt(
  logger: Logger,
  filePath: string,
  packageName: string,
  newVersion: string
): SyncResult {
  try {
    const { content, encoding } = readDependencyFileContent(filePath);
    const lines = splitRequirementLines(content);
    let changed = false;

    logger.info(`[sync] syncVersionInTxt: pkg="${packageName}", lines=${lines.length}`);
    const sampleLines = lines.filter(l => l.trim() && !l.trim().startsWith('#')).slice(0, 5);
    logger.info(`[sync] file sample: ${JSON.stringify(sampleLines)}`);

    const updatedLines = lines.map(line => {
      const stripped = line.trim();
      if (stripped.startsWith('#') || stripped === '') { return line; }

      const rewritten = rewriteTxtRequirementVersion(stripped, packageName, newVersion);
      if (rewritten !== null) {
        changed = true;
        return rewritten;
      }
      return line;
    });

    if (changed) {
      writeDependencyFileContent(filePath, updatedLines.join('\n'), encoding);
      logger.info(`Synced ${packageName}==${newVersion} in ${path.basename(filePath)}`);
      return { outcome: 'synced' };
    }
  } catch (err) {
    logger.error(`Failed to sync requirements: ${String(err)}`);
  }
  return { outcome: 'not-found' };
}
