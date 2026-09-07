import * as path from 'path';

/** Canonical workspace/root path comparison (resolved, case-folded on Windows). */
export function normalizeRootPath(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}
