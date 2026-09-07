import { hasDrift } from '../../../utils/version.js';

/** Minimal fields used to decide whether a post-bulk pin retry is allowed. */
export interface PostBulkReconcilePackage {
  name: string;
  installedVersion?: string;
  specifiedVersion?: string;
  source?: string;
}

/**
 * After a bulk update, retry exact-pin sync only for packages that were just
 * upgraded successfully and still have drift. Unselected drifted packages are
 * left untouched — Align is a separate explicit action.
 */
export function packagesEligibleForPostBulkReconcile<T extends PostBulkReconcilePackage>(
  updatedNames: string[],
  scanned: T[]
): T[] {
  const updated = new Set(updatedNames.map(n => n.toLowerCase()));
  return scanned.filter(pkg => {
    if (!updated.has(pkg.name.toLowerCase())) {
      return false;
    }
    if (!pkg.installedVersion || !pkg.specifiedVersion || !pkg.source) {
      return false;
    }
    return hasDrift(pkg.specifiedVersion, pkg.installedVersion);
  });
}
