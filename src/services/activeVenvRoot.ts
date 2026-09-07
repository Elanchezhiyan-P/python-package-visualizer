/**
 * Persists the workspace folder the user chose as the active Python project/venv
 * in multi-root workspaces.
 */

import type * as vscode from 'vscode';
import { normalizeRootPath } from '../utils/normalizeRootPath.js';

const STORE_KEY = 'pythonPackageVisualizer.activeVenvRoot';

export { normalizeRootPath };

export function getSelectedVenvRoot(context: vscode.ExtensionContext): string | null {
  return context.workspaceState.get<string>(STORE_KEY) ?? null;
}

export async function setSelectedVenvRoot(
  context: vscode.ExtensionContext,
  root: string | null
): Promise<void> {
  if (!root) {
    await context.workspaceState.update(STORE_KEY, undefined);
    return;
  }
  await context.workspaceState.update(STORE_KEY, root);
}

export function findMatchingWorkspaceRoot(target: string, roots: string[]): string | null {
  const normalized = normalizeRootPath(target);
  return roots.find(root => normalizeRootPath(root) === normalized) ?? null;
}
