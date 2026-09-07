import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as vscode from 'vscode';
import { Logger } from '../../utils/logger.js';
import { getGroupFromFileName } from '../parsers/utils.js';
import { parseRequirementsTxt } from '../parsers/requirementsParser.js';
import { parsePyprojectToml } from '../parsers/pyprojectParser.js';
import { parseSetupPy } from '../parsers/setupPyParser.js';
import { parseSetupCfg } from '../parsers/setupCfgParser.js';
import { parsePipfile } from '../parsers/pipfileParser.js';
import { discoverDepFiles } from '../depFileDiscovery.js';
import {
  sanitizeRequiresList,
  type ConflictInfo,
  type DepFileType,
  type ScannedPackage,
  type WorkspaceScanResult,
} from './types.js';
import { checkConflicts, detectConflicts } from './conflicts.js';
import { getPipInstalledVersions } from './pipList.js';
import {
  fetchTransitivePackages,
  getPipShowDetails,
  parsePipShowOutput,
} from './pipShow.js';
import {
  findVenvOwningRoot as findVenvOwningRootFn,
  getWorkspaceFolderPaths,
  isPythonInAnyWorkspaceVenv,
  isPythonInWorkspaceVenv,
  listWorkspaceVenvProjects as listWorkspaceVenvProjectsFn,
  resolveForWorkspace as findWorkspacePython,
  resolveHealthCheckCwd as resolveHealthCheckCwdFn,
  resolvePythonPath as resolvePythonPathFn,
  willUseGlobalPython as willUseGlobalPythonFn,
  expandConfigPath as expandConfigPathFn,
  type WorkspaceVenvProject,
} from './pythonResolver.js';
import {
  findMatchingWorkspaceRoot,
  getSelectedVenvRoot,
} from '../../services/activeVenvRoot.js';

export class PackageScanner {
  private uvPathPromise: Promise<string | null> | undefined = undefined;

  constructor(
    private readonly logger: Logger,
    private readonly context?: vscode.ExtensionContext
  ) {}

  public resolveUvPath(cwd: string): Promise<string | null> {
    if (!this.uvPathPromise) {
      this.uvPathPromise = this.detectUv(cwd).then(p => {
        this.logger.info(`uv ${p ? 'detected — using uv pip' : 'not found — using pip'}`);
        return p;
      });
    }
    return this.uvPathPromise;
  }

  async scanWorkspace(workspaceRoot: string): Promise<WorkspaceScanResult> {
    this.logger.info(`Scanning workspace: ${workspaceRoot}`);

    const packages = new Map<string, ScannedPackage>();
    const depFiles = this.findDepFiles(workspaceRoot);
    this.logger.info(`Found dep files: ${depFiles.join(', ') || 'none'}`);

    for (const file of depFiles) {
      const parsed = this.parseDepFile(file, workspaceRoot);
      for (const pkg of parsed) {
        const resolvedSource = path.join(workspaceRoot, pkg.source);
        if (!fs.existsSync(resolvedSource)) {
          const depRelPath = path.relative(workspaceRoot, file);
          if (pkg.source === path.basename(file)) {
            pkg.source = depRelPath as DepFileType;
          }
        }
        const existing = packages.get(pkg.name);
        if (existing) {
          const newIsTxt = this.isSyncableTextFile(pkg.source);
          const existingIsTxt = this.isSyncableTextFile(existing.source);

          if (newIsTxt || !existingIsTxt) {
            const keepExistingSpec = existingIsTxt && newIsTxt
              && existing.specifiedVersion?.startsWith('==')
              && !pkg.specifiedVersion?.startsWith('==');

            packages.set(pkg.name, {
              ...existing,
              ...pkg,
              ...(keepExistingSpec ? { specifiedVersion: existing.specifiedVersion, source: existing.source } : {}),
            });
          }
        } else {
          packages.set(pkg.name, pkg);
        }
      }
    }

    if (packages.size === 0) {
      this.logger.warn('No packages found in dependency files');
      return { packages: [], transitivePackages: [] };
    }

    const resolvePython = () => this.resolvePythonForWorkspace(workspaceRoot);
    const installed = await getPipInstalledVersions(
      workspaceRoot,
      cwd => this.resolveUvPath(cwd),
      resolvePython,
      this.logger
    ).catch(err => {
      this.logger.error(`pip list unavailable — installed versions will not be shown: ${String(err)}`);
      return new Map<string, string>();
    });

    const pipDetails = await getPipShowDetails(
      [...packages.keys()],
      workspaceRoot,
      cwd => this.resolveUvPath(cwd),
      resolvePython,
      this.logger
    ).catch(err => {
      this.logger.error(`pip show unavailable — dependency details will not be shown: ${String(err)}`);
      return new Map<string, { requires: string[] }>();
    });

    for (const [name, pkg] of packages) {
      pkg.installedVersion = installed.get(name) ?? '';
      pkg.requires = sanitizeRequiresList(pipDetails.get(name)?.requires);
    }

    const declared = [...packages.values()];
    const transitivePackages = await fetchTransitivePackages(
      declared,
      installed,
      workspaceRoot,
      (names, cwd) => getPipShowDetails(names, cwd, c => this.resolveUvPath(c), resolvePython, this.logger)
    ).catch(err => {
      this.logger.warn(`Transitive dependency fetch failed: ${String(err)}`);
      return [] as ScannedPackage[];
    });

    this.logger.info(`Scan complete: ${packages.size} packages found, ${transitivePackages.length} transitive`);
    return { packages: declared, transitivePackages };
  }

  parsePipShowOutput(stdout: string): Map<string, { requires: string[] }> {
    return parsePipShowOutput(stdout);
  }

  parseRequirementsTxt(
    filePath: string,
    group?: 'main' | 'dev' | 'test' | 'docs' | 'lint',
    workspaceRoot?: string
  ): ScannedPackage[] {
    const finalGroup = group || getGroupFromFileName(path.basename(filePath));
    return parseRequirementsTxt(filePath, finalGroup, new Set(), workspaceRoot);
  }

  parsePyprojectToml(filePath: string): ScannedPackage[] {
    return parsePyprojectToml(filePath);
  }

  parseSetupPy(filePath: string): ScannedPackage[] {
    return parseSetupPy(filePath);
  }

  parseSetupCfg(filePath: string): ScannedPackage[] {
    return parseSetupCfg(filePath);
  }

  parsePipfile(filePath: string): ScannedPackage[] {
    return parsePipfile(filePath, this.logger);
  }

  resolvePythonForWorkspace(workspaceRoot: string): string {
    const rootPython = findWorkspacePython(workspaceRoot);
    return rootPython ?? this.resolvePythonPath();
  }

  resolvePythonPath(): string {
    return resolvePythonPathFn(this.logger, () => this.getPreferredVenvRoot());
  }

  getPreferredVenvRoot(): string | null {
    if (!this.context) {
      return null;
    }
    const roots = getWorkspaceFolderPaths();
    const selected = getSelectedVenvRoot(this.context);
    if (!selected) {
      return null;
    }
    const matched = findMatchingWorkspaceRoot(selected, roots);
    if (!matched || !findWorkspacePython(matched)) {
      return null;
    }
    return matched;
  }

  listWorkspaceVenvProjects(): WorkspaceVenvProject[] {
    return listWorkspaceVenvProjectsFn();
  }

  getActiveProjectRoot(): string | null {
    return this.resolveHealthCheckCwd() ?? getWorkspaceFolderPaths()[0] ?? null;
  }

  resolveForWorkspace(root: string): string | null {
    return findWorkspacePython(root);
  }

  expandConfigPath(configPath: string, root?: string): string {
    return expandConfigPathFn(configPath, root);
  }

  isPythonInWorkspaceVenv(pythonPath: string, root: string): boolean {
    return isPythonInWorkspaceVenv(pythonPath, root);
  }

  isPythonInAnyWorkspaceVenv(pythonPath: string): boolean {
    return isPythonInAnyWorkspaceVenv(pythonPath, getWorkspaceFolderPaths());
  }

  findVenvOwningRoot(pythonPath: string): string | null {
    return findVenvOwningRootFn(pythonPath, getWorkspaceFolderPaths());
  }

  resolveHealthCheckCwd(): string | null {
    return resolveHealthCheckCwdFn(
      () => this.resolvePythonPath(),
      () => this.getPreferredVenvRoot()
    );
  }

  willUseGlobalPython(_root?: string): boolean {
    return willUseGlobalPythonFn(() => this.resolvePythonPath());
  }

  normalizeName(name: string): string {
    return name.toLowerCase().replace(/[-_.]+/g, '-');
  }

  detectConflicts(scanned: ScannedPackage[], conflicts: ConflictInfo[]): ScannedPackage[] {
    return detectConflicts(scanned, conflicts);
  }

  async checkConflicts(cwd: string): Promise<ConflictInfo[]> {
    return checkConflicts(cwd, c => this.resolveUvPath(c), () => this.resolvePythonPath());
  }

  private findDepFiles(root: string): string[] {
    const manualPath = this.context?.workspaceState.get<string>(
      'pythonPackageVisualizer.manualRequirementsPath'
    );

    return discoverDepFiles(root, {
      manualPath: manualPath && fs.existsSync(manualPath) ? manualPath : undefined,
    });
  }

  private parseDepFile(filePath: string, workspaceRoot: string): ScannedPackage[] {
    const basename = path.basename(filePath);
    try {
      if (basename.endsWith('.txt') || basename.endsWith('.in')) {
        return this.parseRequirementsTxt(filePath, undefined, workspaceRoot);
      }
      if (basename === 'pyproject.toml') {
        return this.parsePyprojectToml(filePath);
      }
      if (basename === 'setup.py') {
        return this.parseSetupPy(filePath);
      }
      if (basename === 'setup.cfg') {
        return this.parseSetupCfg(filePath);
      }
      if (basename === 'Pipfile') {
        return this.parsePipfile(filePath);
      }
    } catch (err) {
      this.logger.error(`Failed to parse ${filePath}: ${String(err)}`);
    }
    return [];
  }

  private isSyncableTextFile(source: string): boolean {
    const lower = source.toLowerCase();
    return lower.endsWith('.txt') || lower.endsWith('.in');
  }

  private detectUv(cwd: string): Promise<string | null> {
    return new Promise(resolve => {
      let resolved = false;
      const done = (val: string | null) => { if (!resolved) { resolved = true; resolve(val); } };
      const timer = setTimeout(() => { child.kill(); done(null); }, 5_000);
      const child = cp.spawn('uv', ['--version'], { cwd });
      child.on('close', (code: number | null) => { clearTimeout(timer); done(code === 0 ? 'uv' : null); });
      child.on('error', () => { clearTimeout(timer); done(null); });
    });
  }
}
