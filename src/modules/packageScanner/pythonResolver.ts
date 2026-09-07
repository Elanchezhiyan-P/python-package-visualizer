import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import type { Logger } from '../../utils/logger.js';
import { normalizeRootPath } from '../../utils/normalizeRootPath.js';

const VENV_DIRS = ['.venv', 'venv', 'env', '.env'];
const SEARCH_SUBDIRS = ['', 'backend', 'api', 'server', 'python'];

function normalizePath(filePath: string): string {
  return normalizeRootPath(filePath);
}

export function expandConfigPath(configPath: string, root?: string): string {
  const workspaceFolder = root ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
  const workspaceFolderBasename = root
    ? path.basename(root)
    : (vscode.workspace.workspaceFolders?.[0]?.name ?? path.basename(workspaceFolder));

  return path.normalize(
    configPath
      .replace(/\$\{workspaceFolder\}/g, workspaceFolder)
      .replace(/\$\{workspaceFolderBasename\}/g, workspaceFolderBasename)
      .replace(/\$\{userHome\}/g, os.homedir())
      .replace(/\$\{env:([^}]+)\}/g, (_, name: string) => process.env[name] ?? '')
  );
}

export function getWorkspaceFolderPaths(): string[] {
  return (vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri.fsPath);
}

export function getActiveEditorWorkspaceRoot(roots: string[]): string | null {
  const docUri = vscode.window.activeTextEditor?.document?.uri;
  if (!docUri) {
    return null;
  }

  const normalizedDoc = normalizePath(docUri.fsPath);
  for (const root of roots) {
    const normalizedRoot = normalizePath(root);
    const prefix = `${normalizedRoot}${path.sep}`;
    if (normalizedDoc === normalizedRoot || normalizedDoc.startsWith(prefix)) {
      return root;
    }
  }

  return null;
}

export function resolveForWorkspace(root: string): string | null {
  const isWindows = process.platform === 'win32';

  for (const sub of SEARCH_SUBDIRS) {
    const searchRoot = sub ? path.join(root, sub) : root;
    if (!fs.existsSync(searchRoot)) {
      continue;
    }
    for (const venvDir of VENV_DIRS) {
      const pythonPath = isWindows
        ? path.join(searchRoot, venvDir, 'Scripts', 'python.exe')
        : path.join(searchRoot, venvDir, 'bin', 'python');

      if (fs.existsSync(pythonPath)) {
        return pythonPath;
      }
    }
  }

  return null;
}

export function findRootInList(target: string, roots: string[]): string | null {
  const normalized = normalizePath(target);
  return roots.find(root => normalizePath(root) === normalized) ?? null;
}

export interface WorkspaceVenvProject {
  root: string;
  name: string;
  pythonPath: string;
}

export function listWorkspaceVenvProjects(): WorkspaceVenvProject[] {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const projects: WorkspaceVenvProject[] = [];

  for (const folder of folders) {
    const pythonPath = resolveForWorkspace(folder.uri.fsPath);
    if (pythonPath) {
      projects.push({
        root: folder.uri.fsPath,
        name: folder.name,
        pythonPath,
      });
    }
  }

  return projects;
}

export function resolveVenvAcrossRoots(roots: string[], preferredRoot?: string | null): string | null {
  const orderedRoots: string[] = [];
  const matchedPreferred = preferredRoot ? findRootInList(preferredRoot, roots) : null;
  if (matchedPreferred) {
    orderedRoots.push(matchedPreferred);
  }
  for (const root of roots) {
    if (!orderedRoots.includes(root)) {
      orderedRoots.push(root);
    }
  }

  for (const root of orderedRoots) {
    const venvPython = resolveForWorkspace(root);
    if (venvPython) {
      return venvPython;
    }
  }

  return null;
}

export function resolvePythonPath(
  logger: Logger,
  getPreferredRoot?: () => string | null
): string {
  const config = vscode.workspace.getConfiguration('pythonPackageVisualizer');
  const override = config.get<string>('pythonPath', '');
  if (override) {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    return expandConfigPath(override, root);
  }

  const roots = getWorkspaceFolderPaths();
  if (roots.length > 0) {
    const manualRoot = getPreferredRoot?.() ?? null;
    const activeRoot = manualRoot ? null : getActiveEditorWorkspaceRoot(roots);
    const preferredRoot = manualRoot ?? activeRoot;
    const venvPython = resolveVenvAcrossRoots(roots, preferredRoot);
    if (venvPython) {
      logger.debug(`Using venv Python: ${venvPython}`);
      return venvPython;
    }
  }

  try {
    const pythonExt = vscode.extensions.getExtension('ms-python.python');
    if (pythonExt?.isActive) {
      const execDetails = (
        pythonExt.exports as {
          settings?: {
            getExecutionDetails?: () => { execCommand?: string[] };
          };
        }
      )?.settings?.getExecutionDetails?.();
      const interpreter = execDetails?.execCommand?.[0];
      if (interpreter) {
        return interpreter;
      }
    }
  } catch {
    // ms-python not available, fall through
  }

  return process.platform === 'win32' ? 'python' : 'python3';
}

export function isPythonInWorkspaceVenv(pythonPath: string, root: string): boolean {
  const normalized = normalizePath(pythonPath);

  for (const sub of SEARCH_SUBDIRS) {
    const searchRoot = sub ? path.join(root, sub) : root;
    for (const venvDir of VENV_DIRS) {
      const venvRoot = normalizePath(path.join(searchRoot, venvDir));
      const prefix = `${venvRoot}${path.sep}`;
      if (normalized === venvRoot || normalized.startsWith(prefix)) {
        return true;
      }
    }
  }

  return false;
}

export function findVenvOwningRoot(pythonPath: string, roots: string[]): string | null {
  for (const root of roots) {
    if (isPythonInWorkspaceVenv(pythonPath, root)) {
      return root;
    }
  }
  return null;
}

export function isPythonInAnyWorkspaceVenv(pythonPath: string, roots: string[]): boolean {
  return findVenvOwningRoot(pythonPath, roots) !== null;
}

export function resolveHealthCheckCwd(
  resolvePython: () => string,
  getPreferredRoot?: () => string | null
): string | null {
  const roots = getWorkspaceFolderPaths();
  if (roots.length === 0) {
    return null;
  }

  const manualRoot = getPreferredRoot?.() ?? null;
  if (manualRoot) {
    const matched = findRootInList(manualRoot, roots);
    if (matched) {
      return matched;
    }
  }

  const pythonPath = resolvePython();
  return findVenvOwningRoot(pythonPath, roots) ?? roots[0];
}

export function willUseGlobalPython(resolvePython: () => string, _root?: string): boolean {
  const roots = getWorkspaceFolderPaths();
  if (roots.length === 0) {
    return true;
  }
  return !isPythonInAnyWorkspaceVenv(resolvePython(), roots);
}
