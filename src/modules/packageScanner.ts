/**
 * Public entry point for package scanning.
 * Implementation is split under ./packageScanner/ for maintainability.
 */
export type {
  DepFileType,
  ConflictInfo,
  ScannedPackage,
  WorkspaceScanResult,
} from './packageScanner/types.js';

export {
  sanitizeRequiresList,
  isPipMetadataToken,
  normalizePackageName,
} from './packageScanner/types.js';

export { PackageScanner } from './packageScanner/scanner.js';
