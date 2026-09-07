/**
 * Shared type definitions for webview panel communication and display payloads.
 * Extracted from webviewPanel.ts to decouple interface declarations from the panel lifecycle class.
 */

import type { VulnerabilityInfo } from '../services/versionChecker.js';
import type { VenvHealthReport } from '../services/venvHealthChecker.js';

export type { VenvHealthReport };

/** Workspace folder with a detectable on-disk virtual environment. */
export interface WorkspaceVenvProjectInfo {
  root: string;
  name: string;
  pythonPath: string;
}

/** Environment health payload sent to the webview. */
export interface VenvHealthPayload {
  report: VenvHealthReport;
  activeProject: { root: string; name: string };
  availableProjects: WorkspaceVenvProjectInfo[];
}

/** A single entry in the version history timeline display. */
export interface HistoryDisplayEntry {
  packageName: string;
  version: string;
  installedAt: string;
  source: 'pip-install' | 'pip-rollback' | 'detected';
}

/** Discriminated union of all messages the webview can send to the extension host. */
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'updatePackage'; name: string }
  | { type: 'forceUpdatePackage'; name: string }
  | { type: 'updateAllPackages'; names: string[] }
  | { type: 'fixConflict'; requirement: string; packageName: string }
  | { type: 'rollbackPackage'; name: string; version: string; dueToIncompatibility?: boolean }
  | { type: 'refresh' }
  | { type: 'openUrl'; url: string }
  | { type: 'installNew'; name: string; version?: string }
  | { type: 'searchPypi'; query: string }
  | { type: 'exportReport'; format: 'markdown' | 'json' }
  | { type: 'removeFromRequirements'; name: string; source: string }
  | { type: 'pinVersion'; name: string; version: string; source: string } // legacy; prefer syncRequirementsToInstalled
  | { type: 'pinPackageToVersion'; name: string; version: string; source: string }
  | { type: 'unpinPackage'; name: string }
  | { type: 'createRequirements' }
  | { type: 'bulkUpdate'; names: string[] }
  | { type: 'bulkInstall'; names: string[] }
  | { type: 'bulkSync'; packages: Array<{ name: string; source: string }> }
  | { type: 'bulkRemove'; names: string[]; sources: string[] }
  | { type: 'takeSnapshot'; name: string }
  | { type: 'restoreSnapshot'; id: string }
  | { type: 'deleteSnapshot'; id: string }
  | { type: 'listSnapshots' }
  | { type: 'generateRequirements' }
  | { type: 'migrateToUv'; mode: 'manual' | 'automatic' }
  | { type: 'migrateToPoetry' }
  | { type: 'selectManualRequirements' }
  | { type: 'clearManualRequirements' }
  | { type: 'generateSetupScript'; format: 'bash' | 'powershell' | 'markdown' }
  | { type: 'syncRequirementsToInstalled'; name: string; source: string }
  | { type: 'requestVenvHealth' }
  | { type: 'selectActiveVenvProject'; root: string }
  | { type: 'updatePip' }
  | { type: 'cursorAnalyzeUnused'; userInitiated: true; packageNames?: string[] }
  | { type: 'bulkRemoveUnusedConfirmed'; userInitiated: true; packages: Array<{ name: string; source: string }> }
  | { type: 'markPackageManuallyUsed'; name: string }
  | { type: 'unmarkPackageManuallyUsed'; name: string }
  | { type: 'ignorePackageUpdate'; name: string; latestVersion: string }
  | { type: 'unignorePackageUpdate'; name: string };

/** Aggregated workspace scan statistics sent alongside package data. */
export interface ScanStats {
  filesScanned: number;
  modulesFound: number;
  workspaceRoot: string;
  totalSize?: number;
  totalDownloads?: number;
  securityScore?: number;
  maintainerActivityScore?: number;
  slowestPackages?: Array<{name: string; time: number}>;
  manualRequirementsPath?: string;
  /** Absolute paths of dependency files discovered by the internal scanner. */
  detectedDepFilePaths?: string[];
}

/** Shown in the webview when no dependency files are auto-detected. */
export interface DepFilesEmptyState {
  reason: 'not-found' | 'parse-failed';
  failedPath?: string;
}

/** Unified display payload for a single package, combining scan + PyPI data. */
export interface PackageDisplayData {
  name: string;
  installedVersion: string;
  latestVersion: string;
  status: string;
  allVersions: string[];
  summary: string;
  homePage: string;
  specifiedVersion: string;
  source: string;
  requires: string[];
  isUsed: boolean;
  /** True when the user manually confirmed this package as used. */
  manuallyMarkedUsed?: boolean;
  /** Exact-pin drift vs installed, independent of update-available status. */
  hasVersionDrift?: boolean;
  vulnerabilities: VulnerabilityInfo[];
  releaseDate: string;
  group: string;
  license?: string;
  pythonRequires?: string;
  weeklyDownloads?: number;
  installSize?: number;
  environment?: string;
  hasConflict?: boolean;
  /** Previous installed version from local history, when available. */
  previousVersion?: string | null;
  /** True when an update exists on PyPI but is blocked due to dependency conflicts. */
  updateBlockedByConflict?: boolean;
  pythonCompatible?: boolean;
  pythonWarning?: string;
  installTime?: number;
  alternatives?: Array<{ name: string; reason: string; url?: string }>;
  /** Confidence percentage (5–100) that the package is truly unused. Only set when isUsed=false. */
  unusedConfidence?: number;
  /** Machine-readable reason codes explaining confidence deductions */
  unusedReasons?: string[];
  /** Deterministic verdict tier for unused packages */
  usageVerdict?: 'likely_unused' | 'uncertain';
  /** Structured evidence from framework/config detectors */
  usageEvidence?: Array<{
    source: string;
    file: string;
    line?: number;
    snippet?: string;
    strength: 'strong' | 'weak';
  }>;
  /** Set when config/script reference search found usage outside imports */
  referenceUsageFound?: boolean;
  /** PyPI latest version the user chose to ignore (when status is update-ignored). */
  ignoredUpdateVersion?: string;
  /** User-chosen pin version (tag); independent of update-ignored status. */
  pinnedVersion?: string;
}

/** Minimal package payload for dependency graph lookup (transitive installed packages). */
export interface GraphPackageInfo {
  name: string;
  installedVersion: string;
  requires: string[];
  status: string;
  vulnerabilities?: VulnerabilityInfo[];
  hasConflict?: boolean;
  updateBlockedByConflict?: boolean;
}
