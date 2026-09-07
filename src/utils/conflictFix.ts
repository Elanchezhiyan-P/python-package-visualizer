import type { ConflictInfo } from '../modules/packageScanner.js';

/** Extracts the PyPI package name from a pip requirement string. */
export function packageNameFromRequirement(requirement: string): string {
  return requirement.trim().split(/[<>=!~^\[]/)[0].trim();
}

/**
 * Returns the pip install spec that satisfies a pip check conflict, or null if unknown.
 */
export function getConflictInstallSpec(conflict: ConflictInfo): string | null {
  const spec = conflict.requirement?.trim();
  if (!spec) {
    return null;
  }
  return spec;
}

/**
 * Package to install/upgrade to resolve the conflict (usually the conflicting dependency).
 */
export function getConflictTargetPackage(conflict: ConflictInfo): string {
  return conflict.conflictingPackage || packageNameFromRequirement(conflict.requirement);
}
