import * as path from 'path';
import type * as vscode from 'vscode';
import type { PackageScanner } from '../../modules/packageScanner.js';
import type { VenvHealthChecker } from '../../services/venvHealthChecker.js';
import type { WebviewPanel } from '../../ui/webviewPanel.js';
import type { PackageInstaller } from '../handlers/packageInstaller.js';
import { setSelectedVenvRoot, findMatchingWorkspaceRoot } from '../../services/activeVenvRoot.js';

/** Collaborators for environment-tab health, project switch, and pip upgrade. */
export interface VenvHealthActionsContext {
  scanner: PackageScanner;
  venvHealthChecker: VenvHealthChecker;
  panel: WebviewPanel;
  context: vscode.ExtensionContext;
  installerHandler: PackageInstaller;
  refreshVisualizer(): Promise<void>;
}

export async function handleVenvHealthRequest(ctx: VenvHealthActionsContext): Promise<void> {
  const root = ctx.scanner.resolveHealthCheckCwd();
  if (!root) { return; }
  try {
    const report = await ctx.venvHealthChecker.checkHealth(root);
    const availableProjects = ctx.scanner.listWorkspaceVenvProjects();
    const activeProject = availableProjects.find(project => project.root === root)
      ?? availableProjects[0]
      ?? { root, name: path.basename(root), pythonPath: ctx.scanner.resolvePythonPath() };
    ctx.panel.sendVenvHealth({
      report,
      activeProject: { root: activeProject.root, name: activeProject.name },
      availableProjects,
    });
  } catch {
    // Non-blocking: silently ignore venv health failures
  }
}

export async function handleSelectActiveVenvProject(
  ctx: VenvHealthActionsContext,
  root: string
): Promise<void> {
  const projects = ctx.scanner.listWorkspaceVenvProjects();
  const match = findMatchingWorkspaceRoot(root, projects.map(project => project.root));
  if (!match) {
    return;
  }
  await setSelectedVenvRoot(ctx.context, match);
  await handleVenvHealthRequest(ctx);
  await ctx.refreshVisualizer();
}

export async function handleUpdatePip(ctx: VenvHealthActionsContext): Promise<void> {
  try {
    await ctx.installerHandler.updatePip();
  } finally {
    void handleVenvHealthRequest(ctx);
  }
}
