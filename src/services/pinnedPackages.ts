/**
 * Persists user-chosen version pins per workspace.
 * The hold on PyPI updates still lives in ignoredUpdates; this store
 * only drives the Pinned tag and unpin metadata.
 */

import type * as vscode from 'vscode';
import { load, update } from './projectVisualizerConfig.js';

export interface PinnedPackageEntry {
  version: string;
  ignoredLatest: string;
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

/** Pin entries for this workspace (normalized package name → entry). */
export function getPinnedPackages(
  context: vscode.ExtensionContext,
  workspaceRoot: string
): Map<string, PinnedPackageEntry> {
  const entries = load(context, workspaceRoot).pins;
  return new Map(Object.entries(entries));
}

export function getPinnedVersion(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  packageName: string
): string | undefined {
  return load(context, workspaceRoot).pins[normalize(packageName)]?.version;
}

export async function pinPackage(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  packageName: string,
  entry: PinnedPackageEntry
): Promise<void> {
  if (!entry.version) {
    return;
  }
  await update(context, workspaceRoot, data => {
    data.pins[normalize(packageName)] = {
      version: entry.version,
      ignoredLatest: entry.ignoredLatest ?? '',
    };
  });
}

export async function unpinPackage(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  packageName: string
): Promise<void> {
  await update(context, workspaceRoot, data => {
    delete data.pins[normalize(packageName)];
  });
}
