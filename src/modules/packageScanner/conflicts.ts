import * as cp from 'child_process';
import { withUvGlobalArgs } from '../../utils/uvSpawn.js';
import { normalizePackageName, type ConflictInfo, type ScannedPackage } from './types.js';

export function detectConflicts(
  scanned: ScannedPackage[],
  conflicts: ConflictInfo[]
): ScannedPackage[] {
  const conflictingPkgs = new Set<string>();
  for (const conflict of conflicts) {
    conflictingPkgs.add(normalizePackageName(conflict.package));
    conflictingPkgs.add(normalizePackageName(conflict.conflictingPackage));
  }

  return scanned.map(pkg => ({
    ...pkg,
    hasConflict: conflictingPkgs.has(normalizePackageName(pkg.name)),
  }));
}

export function parseConflicts(output: string): ConflictInfo[] {
  const conflicts: ConflictInfo[] = [];
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const m1 = trimmed.match(
      /^(\S+)\s+(\S+)\s+has requirement\s+(.+?),\s+but you have\s+(\S+)\s+(\S+)\.?$/i
    );
    if (m1) {
      conflicts.push({
        package: normalizePackageName(m1[1]),
        version: m1[2],
        requirement: m1[3],
        conflictingPackage: normalizePackageName(m1[4]),
        conflictingVersion: m1[5],
      });
      continue;
    }

    const m2 = trimmed.match(
      /^(\S+)\s+(\S+)\s+(?:requires|has requirement)\s+(\S+(?:\[.*?\])?),\s+which is not installed\.?$/i
    );
    if (m2) {
      const depName = m2[3].replace(/[>=<!~^[\]].*/g, '');
      conflicts.push({
        package: normalizePackageName(m2[1]),
        version: m2[2],
        requirement: m2[3],
        conflictingPackage: normalizePackageName(depName),
        conflictingVersion: 'not installed',
      });
    }
  }
  return conflicts;
}

export async function checkConflicts(
  cwd: string,
  resolveUvPath: (cwd: string) => Promise<string | null>,
  resolvePythonPath: () => string
): Promise<ConflictInfo[]> {
  const uvPath = await resolveUvPath(cwd);
  const cmd = uvPath ?? resolvePythonPath();
  const args = uvPath ? withUvGlobalArgs(['pip', 'check']) : ['-m', 'pip', 'check'];

  return new Promise(resolve => {
    const child = cp.spawn(cmd, args, { cwd });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); resolve([]); }, 30_000);

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('close', () => {
      clearTimeout(timer);
      resolve(parseConflicts(stdout + '\n' + stderr));
    });
    child.on('error', () => { clearTimeout(timer); resolve([]); });
  });
}
