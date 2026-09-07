import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import type { Logger } from '../../../utils/logger.js';
import type { PackageScanner } from '../../../modules/packageScanner.js';
import type { VersionHistoryCache } from '../../../services/versionHistoryCache.js';
import type { RequirementsSync } from '../../../modules/requirementsSync.js';
import type { WebviewPanel } from '../../../ui/webviewPanel.js';
import { withUvGlobalArgs } from '../../../utils/uvSpawn.js';

/** Collaborators needed to spawn pip/uv and confirm the install target. */
export interface PackageInstallerProcessContext {
  scanner: PackageScanner;
  history: VersionHistoryCache;
  reqSync: RequirementsSync;
  panel: WebviewPanel;
  logger: Logger;
  getWorkspaceRoot: () => string | null;
  refreshCallback: () => Promise<void>;
  syncExactPinOnly(
    root: string,
    packageName: string,
    version: string,
    source: string | undefined,
    specifiedVersion: string | undefined,
    contextLabel: string
  ): Promise<void>;
}

/**
 * Asks for confirmation when pip would target a non-project interpreter.
 */
export async function confirmInstallTarget(
  ctx: PackageInstallerProcessContext,
  root: string
): Promise<boolean> {
  if (!ctx.scanner.willUseGlobalPython(root)) {
    return true;
  }

  const python = ctx.scanner.resolvePythonPath();
  const lang = vscode.workspace
    .getConfiguration('pythonPackageVisualizer')
    .get<string>('language', 'en');
  const isIt = lang === 'it';
  const displayPath = python.length > 72 ? `...${python.slice(-69)}` : python;
  const message = isIt
    ? `I pacchetti verranno installati/aggiornati nell'interprete Python globale o esterno:\n${displayPath}\n\nNon verrà usato un virtual environment del progetto (.venv, venv, env). Procedere?`
    : `Packages will be installed/updated in the global or external Python interpreter:\n${displayPath}\n\nNo project virtual environment (.venv, venv, env) will be used. Continue?`;
  const proceed = isIt ? 'Procedi' : 'Continue';
  const cancel = isIt ? 'Annulla' : 'Cancel';
  const choice = await vscode.window.showWarningMessage(
    message,
    { modal: true },
    proceed,
    cancel
  );
  return choice === proceed;
}

/**
 * Evaluates the active environment to return the correct install command prefix
 * for either uv or pip.
 */
export async function buildInstallCmd(
  ctx: PackageInstallerProcessContext,
  packageSpec: string,
  root: string
): Promise<string> {
  const uvPath = await ctx.scanner.resolveUvPath(root);
  if (uvPath) {
    return `uv --system-certs pip install ${packageSpec}`;
  }
  const python = ctx.scanner.resolvePythonPath();
  return `"${python}" -m pip install ${packageSpec}`;
}

/**
 * Evaluates the active environment to return spawn-ready command and list of arguments.
 */
export async function buildInstallSpawnArgs(
  ctx: PackageInstallerProcessContext,
  packageArgs: string[],
  root: string
): Promise<{ exe: string; args: string[] }> {
  const uvPath = await ctx.scanner.resolveUvPath(root);
  if (uvPath) {
    return { exe: uvPath, args: withUvGlobalArgs(['pip', 'install', ...packageArgs]) };
  }
  const python = ctx.scanner.resolvePythonPath();
  return { exe: python, args: ['-m', 'pip', 'install', ...packageArgs] };
}

/** Returns spawn args to uninstall packages from the active environment. */
export async function buildUninstallSpawnArgs(
  ctx: PackageInstallerProcessContext,
  packageNames: string[],
  root: string
): Promise<{ exe: string; args: string[] }> {
  const uvPath = await ctx.scanner.resolveUvPath(root);
  if (uvPath) {
    return { exe: uvPath, args: withUvGlobalArgs(['pip', 'uninstall', ...packageNames, '-y']) };
  }
  const python = ctx.scanner.resolvePythonPath();
  return { exe: python, args: ['-m', 'pip', 'uninstall', ...packageNames, '-y'] };
}

/**
 * Runs pip/uv install for a new package and appends to requirements.txt when present.
 */
export async function runNewPackageInstall(
  ctx: PackageInstallerProcessContext,
  packageName: string,
  version: string | undefined,
  root: string
): Promise<void> {
  const pkgSpec = version ? `${packageName}==${version}` : packageName;
  const { exe, args } = await buildInstallSpawnArgs(ctx, [pkgSpec], root);
  ctx.logger.info(`Installing new package: ${exe} ${args.join(' ')}`);
  const installTime = await runInstallTracked(ctx, exe, args, root, packageName);

  const recordedVersion = version
    ?? (await ctx.scanner.scanWorkspace(root)).packages.find(p => p.name === packageName)?.installedVersion;
  if (recordedVersion) {
    ctx.history.recordVersion(root, packageName, recordedVersion, 'pip-install', installTime);
  }

  const reqFile = vscode.Uri.file(path.join(root, 'requirements.txt'));
  try {
    const bytes = await vscode.workspace.fs.readFile(reqFile);
    const content = Buffer.from(bytes).toString('utf-8');
    const normPkg = packageName.toLowerCase().replace(/[-_.]+/g, '-');
    const alreadyListed = content.split('\n').some(line => {
      const clean = line.split('#')[0].trim().toLowerCase().replace(/[-_.]+/g, '-');
      return clean.startsWith(normPkg);
    });
    if (!alreadyListed) {
      const entry = version ? `${packageName}==${version}` : packageName;
      const newContent = content.endsWith('\n') ? content + entry + '\n' : content + '\n' + entry + '\n';
      await vscode.workspace.fs.writeFile(reqFile, Buffer.from(newContent, 'utf-8'));
      ctx.logger.info(`Appended ${entry} to requirements.txt`);
    }
  } catch {
    // requirements.txt does not exist — skip silently
  }
}

/** Upgrades pip in the workspace interpreter (supports uv and venv). */
export async function updatePip(ctx: PackageInstallerProcessContext): Promise<boolean> {
  const root = ctx.getWorkspaceRoot();
  if (!root) {
    return false;
  }
  if (!(await confirmInstallTarget(ctx, root))) {
    return false;
  }

  const lang = vscode.workspace
    .getConfiguration('pythonPackageVisualizer')
    .get<string>('language', 'en');
  const isIt = lang === 'it';

  try {
    const { exe, args } = await buildInstallSpawnArgs(ctx, ['--upgrade', 'pip'], root);
    ctx.logger.info(`Updating pip: ${exe} ${args.join(' ')}`);
    await runPipSpawn(ctx, exe, args, root);
    void vscode.window.showInformationMessage(
      isIt ? 'Python Packages: pip aggiornato ✅' : 'Python Packages: pip updated ✅'
    );
    return true;
  } catch (err) {
    ctx.logger.error(`pip update failed: ${String(err)}`);
    void vscode.window.showErrorMessage(
      isIt
        ? `Aggiornamento pip fallito: ${err instanceof Error ? err.message : String(err)}`
        : `Failed to update pip: ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  }
}

export function runPipSpawn(
  ctx: PackageInstallerProcessContext,
  exe: string,
  args: string[],
  cwd: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = cp.spawn(exe, args, { cwd, shell: false });
    let stderr = '';

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      ctx.logger.warn(text.trim());
    });
    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) {
        ctx.logger.info(text);
      }
    });
    child.on('close', (code: number | null) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(stderr || `Process exited with code ${String(code)}`));
      }
    });
    child.on('error', reject);
  });
}

/**
 * Spawns an installation command and processes the stdout output line-by-line
 * to send live completion percentages to the webview UI.
 * @returns Elapsed install time in seconds.
 */
export function runInstallTracked(
  ctx: PackageInstallerProcessContext,
  exe: string,
  args: string[],
  cwd: string,
  packageName: string
): Promise<number> {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const child = cp.spawn(exe, args, { cwd, shell: false });

    const sendProgress = (stage: string, percent: number) => {
      void ctx.panel.webview?.postMessage({ type: 'pkgProgress', name: packageName, stage, percent });
    };

    sendProgress('Starting…', 5);

    let stderr = '';
    let stdoutBuf = '';

    const processLine = (line: string) => {
      if (!line.trim()) { return; }
      ctx.logger.info(line);
      const l = line.toLowerCase();
      if (l.includes('collecting') || l.includes('resolved')) {
        sendProgress('Collecting…', 15);
      } else if (l.includes('downloading') || l.includes('prepared')) {
        const match = line.match(/(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\s*mb/i);
        if (match) {
          const pct = Math.round((parseFloat(match[1]) / parseFloat(match[2])) * 50) + 20;
          sendProgress('Downloading…', Math.min(pct, 70));
        } else {
          sendProgress('Downloading…', 40);
        }
      } else if (l.includes('installing collected') || l.includes('installed') || l.includes('updated')) {
        sendProgress('Installing…', 85);
      } else if (l.includes('successfully installed') || l.includes('requirement already satisfied') || l.includes('audited')) {
        sendProgress('Done', 100);
      }
    };

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString();
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop() ?? '';
      lines.forEach(processLine);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      ctx.logger.warn(text.trim());
    });
    child.on('close', (code: number | null) => {
      if (stdoutBuf) { processLine(stdoutBuf); }
      const elapsedSec = Math.max(0.01, (Date.now() - startedAt) / 1000);
      if (code === 0) {
        sendProgress('Done', 100);
        resolve(elapsedSec);
      } else {
        reject(new Error(stderr || `Process exited with code ${String(code)}`));
      }
    });
    child.on('error', reject);
  });
}

/**
 * Executes a command via child_process exec with timeout support.
 */
export function runPip(
  ctx: PackageInstallerProcessContext,
  cmd: string,
  cwd: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    cp.exec(cmd, { cwd, timeout: 120_000 }, (err, stdout, stderr) => {
      if (stdout) {
        ctx.logger.info(stdout.trim());
      }
      if (stderr) {
        ctx.logger.warn(stderr.trim());
      }
      if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve();
      }
    });
  });
}
