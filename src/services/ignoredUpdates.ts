/**
 * Persists PyPI updates the user chose to ignore per workspace.
 * Each entry stores the latest version that was dismissed; a newer PyPI release
 * becomes actionable again.
 */

import type * as vscode from 'vscode';
import { isUpdateSuppressedByIgnore } from '../utils/version.js';
import { load, update } from './projectVisualizerConfig.js';

function normalize(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

/** Ignored latest versions for this workspace (normalized package name → version). */
export function getIgnoredUpdates(
  context: vscode.ExtensionContext,
  workspaceRoot: string
): Map<string, string> {
  const entries = load(context, workspaceRoot).ignoredUpdates;
  return new Map(Object.entries(entries));
}

export function getIgnoredUpdateVersion(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  packageName: string
): string | undefined {
  return load(context, workspaceRoot).ignoredUpdates[normalize(packageName)];
}

export async function ignorePackageUpdate(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  packageName: string,
  ignoredLatestVersion: string
): Promise<void> {
  if (!ignoredLatestVersion || ignoredLatestVersion === 'unknown') {
    return;
  }
  await update(context, workspaceRoot, data => {
    data.ignoredUpdates[normalize(packageName)] = ignoredLatestVersion;
  });
}

export async function unignorePackageUpdate(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  packageName: string
): Promise<void> {
  await update(context, workspaceRoot, data => {
    delete data.ignoredUpdates[normalize(packageName)];
  });
}

/** Whether a PyPI update should be hidden because the user ignored this latest release. */
export function isUpdateIgnoredForDisplay(
  ignoredVersion: string | undefined,
  latestVersion: string
): boolean {
  return ignoredVersion !== undefined && isUpdateSuppressedByIgnore(ignoredVersion, latestVersion);
}
