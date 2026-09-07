import * as fs from 'fs';
import * as path from 'path';

/** PEP 503-style package name normalization. */
export function normalizePackageName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

/** Detects duplicate packages (same normalized name, different versions). */
export function findDuplicates(
  packages: Array<{ name: string; version: string }>
): Array<{ name: string; versions: string[] }> {
  const normalized = new Map<string, string[]>();
  for (const pkg of packages) {
    const norm = pkg.name.toLowerCase().replace(/[-_.]+/g, '-');
    const existing = normalized.get(norm);
    if (existing) {
      existing.push(`${pkg.name}==${pkg.version}`);
    } else {
      normalized.set(norm, [`${pkg.name}==${pkg.version}`]);
    }
  }

  const duplicates: Array<{ name: string; versions: string[] }> = [];
  for (const [name, versions] of normalized) {
    if (versions.length > 1) {
      duplicates.push({ name, versions });
    }
  }
  return duplicates;
}

/** Determines the venv type and whether it's currently active. */
export function detectVenvType(
  cwd: string,
  sysPrefix: string,
  basePrefix: string
): { type: 'venv' | 'virtualenv' | 'conda' | 'system' | 'unknown'; path: string; isActive: boolean } {
  const isActive = sysPrefix !== '' && basePrefix !== '' && sysPrefix !== basePrefix;

  if (process.env['CONDA_DEFAULT_ENV'] || process.env['CONDA_PREFIX']) {
    return { type: 'conda', path: process.env['CONDA_PREFIX'] || sysPrefix, isActive: true };
  }

  const venvDirs = ['.venv', 'venv', 'env', '.env'];
  for (const dir of venvDirs) {
    const venvPath = path.join(cwd, dir);
    if (fs.existsSync(venvPath)) {
      if (fs.existsSync(path.join(venvPath, 'pyvenv.cfg'))) {
        return { type: 'venv', path: venvPath, isActive };
      }
      const libPath = process.platform === 'win32'
        ? path.join(venvPath, 'Lib')
        : path.join(venvPath, 'lib');
      if (fs.existsSync(libPath)) {
        return { type: 'virtualenv', path: venvPath, isActive };
      }
    }
  }

  if (isActive) {
    return { type: 'venv', path: sysPrefix, isActive: true };
  }

  return { type: 'system', path: sysPrefix || 'system', isActive: false };
}
