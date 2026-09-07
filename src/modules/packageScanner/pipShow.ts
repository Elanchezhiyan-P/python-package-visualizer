import * as cp from 'child_process';
import type { Logger } from '../../utils/logger.js';
import { withUvGlobalArgs } from '../../utils/uvSpawn.js';
import {
  normalizePackageName,
  sanitizeRequiresList,
  type DepFileType,
  type ScannedPackage,
} from './types.js';

const PIP_SHOW_BATCH_SIZE = 50;

/** Extracts dependency names from a single pip show block (ignores Required-by). */
export function parseRequiresField(block: string): string[] {
  const lines = block.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!/^Requires:(?!d-by)\s*/i.test(trimmed)) {
      continue;
    }

    let value = trimmed.replace(/^Requires:(?!d-by)[ \t]*/i, '').trim();

    if (!value) {
      return [];
    }

    while (i + 1 < lines.length) {
      const next = lines[i + 1].trim();
      if (!next || /^[A-Za-z][A-Za-z0-9-]*:/.test(next)) {
        break;
      }
      value += `, ${next.trim()}`;
      i++;
    }

    if (/^required-by\b/i.test(value.trim())) {
      return [];
    }

    return sanitizeRequiresList(
      value.split(',').map(r => r.trim()).filter(Boolean)
    );
  }

  return [];
}

/** Parses pip show stdout into a map of normalized package names → requires lists. */
export function parsePipShowOutput(stdout: string): Map<string, { requires: string[] }> {
  const map = new Map<string, { requires: string[] }>();
  const blocks = stdout.split(/^---$/m);

  for (const block of blocks) {
    const nameMatch = block.match(/^Name:\s*(.+)$/m);
    if (!nameMatch) {
      continue;
    }
    const name = normalizePackageName(nameMatch[1].trim());
    map.set(name, { requires: parseRequiresField(block) });
  }

  return map;
}

async function runPipShowBatch(
  packageNames: string[],
  cwd: string,
  resolveUvPath: (cwd: string) => Promise<string | null>,
  resolvePythonPath: () => string,
  logger: Logger
): Promise<Map<string, { requires: string[] }>> {
  if (packageNames.length === 0) {
    return new Map();
  }

  const uvPath = await resolveUvPath(cwd);
  const cmd = uvPath ?? resolvePythonPath();
  const args = uvPath
    ? withUvGlobalArgs(['pip', 'show', ...packageNames])
    : ['-m', 'pip', 'show', ...packageNames];

  return new Promise((resolve, reject) => {
    logger.debug(`Running: ${cmd} ${args.join(' ')}`);
    const child = cp.spawn(cmd, args, { cwd });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 30_000);

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

    child.on('close', (code: number | null) => {
      clearTimeout(timer);
      if (timedOut) {
        return reject(new Error('pip show timed out'));
      }
      if (code !== 0 && !stdout) {
        return reject(new Error(`pip show failed (exit ${code}): ${stderr.trim()}`));
      }
      resolve(parsePipShowOutput(stdout));
    });

    child.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export async function getPipShowDetails(
  packageNames: string[],
  cwd: string,
  resolveUvPath: (cwd: string) => Promise<string | null>,
  resolvePythonPath: () => string,
  logger: Logger
): Promise<Map<string, { requires: string[] }>> {
  if (packageNames.length === 0) {
    return new Map();
  }

  const merged = new Map<string, { requires: string[] }>();
  for (let i = 0; i < packageNames.length; i += PIP_SHOW_BATCH_SIZE) {
    const chunk = packageNames.slice(i, i + PIP_SHOW_BATCH_SIZE);
    const batch = await runPipShowBatch(chunk, cwd, resolveUvPath, resolvePythonPath, logger);
    for (const [name, info] of batch) {
      merged.set(name, info);
    }
  }
  return merged;
}

export async function fetchTransitivePackages(
  declared: ScannedPackage[],
  installed: Map<string, string>,
  workspaceRoot: string,
  getPipShowDetailsFn: (names: string[], cwd: string) => Promise<Map<string, { requires: string[] }>>
): Promise<ScannedPackage[]> {
  const declaredNames = new Set(declared.map(p => normalizePackageName(p.name)));
  const fetched = new Map<string, { requires: string[] }>();

  for (const pkg of declared) {
    fetched.set(normalizePackageName(pkg.name), { requires: sanitizeRequiresList(pkg.requires) });
  }

  let pending = new Set<string>();
  for (const pkg of declared) {
    for (const req of pkg.requires ?? []) {
      const norm = normalizePackageName(req);
      if (!declaredNames.has(norm) && installed.has(norm) && !fetched.has(norm)) {
        pending.add(norm);
      }
    }
  }

  while (pending.size > 0) {
    const batchNames = [...pending];
    pending.clear();
    const batchDetails = await getPipShowDetailsFn(batchNames, workspaceRoot);

    for (const [name, info] of batchDetails) {
      fetched.set(name, info);
      for (const req of info.requires) {
        const norm = normalizePackageName(req);
        if (!declaredNames.has(norm) && installed.has(norm) && !fetched.has(norm)) {
          pending.add(norm);
        }
      }
    }
  }

  return [...fetched.entries()]
    .filter(([name]) => !declaredNames.has(name))
    .map(([name, info]) => ({
      name,
      specifiedVersion: '',
      installedVersion: installed.get(name) ?? '',
      source: 'transitive' as DepFileType,
      extras: [],
      requires: sanitizeRequiresList(info.requires),
      group: 'optional' as const,
      environment: 'main' as const,
    }));
}
