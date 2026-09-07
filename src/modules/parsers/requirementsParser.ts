import * as fs from 'fs';
import * as path from 'path';
import { ScannedPackage, DepFileType } from '../packageScanner.js';
import {
  normalizeName,
  getGroupFromFileName,
  getEnvironmentFromFileName,
  readDependencyFileContent,
} from './utils.js';

/**
 * Parses requirements.txt (or requirements.in) files, recursively resolving references.
 * Resolves standard line continuations and ignores comments or external URL indices.
 * 
 * @param filePath The absolute path to the requirements file.
 * @param group The dependency group assigned to this file.
 * @param visited Set of visited file paths to prevent infinite recursion loop.
 * @returns An array of scanned packages found in the file and its dependencies.
 */
export function parseRequirementsTxt(
  filePath: string,
  group: 'main' | 'dev' | 'test' | 'docs' | 'lint' | 'optional' = 'main',
  visited = new Set<string>(),
  workspaceRoot?: string
): ScannedPackage[] {
  const environment = getEnvironmentFromFileName(path.basename(filePath));
  if (visited.has(filePath)) { return []; }
  visited.add(filePath);

  if (!fs.existsSync(filePath)) { return []; }

  const { content } = readDependencyFileContent(filePath);
  const results: ScannedPackage[] = [];

  // Join continuation lines
  const normalized = content.replace(/\\\n\s*/g, ' ');
  const lines = normalized.split('\n');

  const sourcePath = workspaceRoot
    ? path.relative(workspaceRoot, filePath).replace(/\\/g, '/')
    : path.basename(filePath);
  const sourceForPackages = sourcePath as DepFileType;

  for (const rawLine of lines) {
    // Strip inline comments
    const line = rawLine.split('#')[0].trim();
    if (!line) { continue; }

    // Follow -r / --requirement includes
    const includeMatch = line.match(/^(?:-r|--requirement)\s+(.+)$/);
    if (includeMatch) {
      const includePath = includeMatch[1].trim();
      const absInclude = path.resolve(path.dirname(filePath), includePath);
      if (fs.existsSync(absInclude)) {
        const includeGroup = getGroupFromFileName(path.basename(absInclude));
        results.push(...parseRequirementsTxt(absInclude, includeGroup, visited, workspaceRoot));
      }
      continue;
    }

    // Skip other options (-i, --index-url, -c, -e, --extra-index-url, etc.) and URLs
    if (
      line.startsWith('-') ||
      line.startsWith('http://') ||
      line.startsWith('https://')
    ) {
      continue;
    }

    // Match: name[extras]version_spec or name[extras]
    const match = line.match(
      /^([A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?)(\[([^\]]+)\])?(.*)?$/
    );
    if (!match) {
      continue;
    }
    results.push({
      name: normalizeName(match[1]),
      specifiedVersion: (match[5] ?? '').trim(),
      installedVersion: '',
      source: sourceForPackages,
      extras: match[4] ? match[4].split(',').map(e => e.trim()) : [],
      requires: [],
      group,
      environment,
    });
  }

  return results;
}
