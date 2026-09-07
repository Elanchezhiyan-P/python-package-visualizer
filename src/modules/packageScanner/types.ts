export type DepFileType =
  | 'requirements.txt'
  | 'pyproject.toml'
  | 'setup.py'
  | 'setup.cfg'
  | 'Pipfile'
  | (string & {});

export interface ConflictInfo {
  package: string;
  version: string;
  requirement: string;
  conflictingPackage: string;
  conflictingVersion: string;
}

export interface ScannedPackage {
  name: string;
  specifiedVersion: string;
  installedVersion: string;
  source: DepFileType;
  extras: string[];
  requires: string[];
  group: 'main' | 'dev' | 'test' | 'docs' | 'lint' | 'optional';
  environment: 'main' | 'dev' | 'test' | 'prod';
  hasConflict?: boolean;
}

/** Result of a workspace dependency scan including transitive installed packages for the graph. */
export interface WorkspaceScanResult {
  packages: ScannedPackage[];
  transitivePackages: ScannedPackage[];
}

/** True when a string is pip show metadata, not a real package name. */
export function isPipMetadataToken(value: string): boolean {
  const raw = value.trim().toLowerCase();
  if (!raw) {
    return true;
  }
  if (/^required-by\b/i.test(raw)) {
    return true;
  }
  if (/^requires\b/i.test(raw)) {
    return true;
  }
  if (raw.includes('required-by')) {
    return true;
  }
  return false;
}

/** Drops pip show metadata accidentally parsed as dependency names (e.g. Required-by). */
export function sanitizeRequiresList(requires: string[] | undefined): string[] {
  return (requires ?? [])
    .map(r => r.trim())
    .filter(r => r.length > 0)
    .filter(r => !isPipMetadataToken(r))
    .map(r => r.toLowerCase().replace(/[-_.]+/g, '-'))
    .filter(r => r.length > 0 && !isPipMetadataToken(r));
}

/** PEP 503 normalization used across pip metadata parsing. */
export function normalizePackageName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}
