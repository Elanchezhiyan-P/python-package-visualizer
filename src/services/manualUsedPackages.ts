/**
 * Persists packages the user manually confirmed as "used" so they leave the
 * Unused tab until the user clears the confirmation.
 */

import type * as vscode from 'vscode';

const STORE_KEY = 'pythonPackageVisualizer.manualUsedPackages';

type Store = Record<string, string[]>;

function normalize(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

function readStore(context: vscode.ExtensionContext): Store {
  return context.workspaceState.get<Store>(STORE_KEY) ?? {};
}

function rootKey(workspaceRoot: string): string {
  return workspaceRoot.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/** Normalized package names marked as manually used for this workspace. */
export function getManualUsedPackages(
  context: vscode.ExtensionContext,
  workspaceRoot: string
): Set<string> {
  const list = readStore(context)[rootKey(workspaceRoot)] ?? [];
  return new Set(list.map(normalize));
}

export async function markPackageManuallyUsed(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  packageName: string
): Promise<void> {
  const store = readStore(context);
  const key = rootKey(workspaceRoot);
  const set = new Set((store[key] ?? []).map(normalize));
  set.add(normalize(packageName));
  store[key] = [...set].sort();
  await context.workspaceState.update(STORE_KEY, store);
}

export async function unmarkPackageManuallyUsed(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  packageName: string
): Promise<void> {
  const store = readStore(context);
  const key = rootKey(workspaceRoot);
  const set = new Set((store[key] ?? []).map(normalize));
  set.delete(normalize(packageName));
  if (set.size === 0) {
    delete store[key];
  } else {
    store[key] = [...set].sort();
  }
  await context.workspaceState.update(STORE_KEY, store);
}
