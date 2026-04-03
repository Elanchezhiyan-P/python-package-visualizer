import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as vscode from 'vscode';
import * as toml from '@iarna/toml';
import { Logger } from '../utils/logger.js';

export type DepFileType = 'requirements.txt' | 'pyproject.toml' | 'setup.py' | 'setup.cfg' | 'Pipfile';

export interface ConflictInfo {
  package: string;
  version: string;
  requirement: string;
  conflictingPackage: string;
  conflictingVersion: string;
}

export interface ScannedPackage {
  name: string;
  specifiedVersion: string;
  installedVersion: string;
  source: DepFileType;
  extras: string[];
  requires: string[];
  group: 'main' | 'dev' | 'test' | 'docs' | 'lint' | 'optional';
}

export class PackageScanner {
  // Cached uv detection: undefined = not checked yet, null = not available, 'uv' = available
  private uvPathPromise: Promise<string | null> | undefined = undefined;

  constructor(private readonly logger: Logger) {}

  /** Returns 'uv' if uv is available in PATH, null otherwise. Result is cached. */
  public resolveUvPath(cwd: string): Promise<string | null> {
    if (!this.uvPathPromise) {
      this.uvPathPromise = this.detectUv(cwd).then(p => {
        this.logger.info(`uv ${p ? 'detected — using uv pip' : 'not found — using pip'}`);
        return p;
      });
    }
    return this.uvPathPromise;
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

  async scanWorkspace(workspaceRoot: string): Promise<ScannedPackage[]> {
    this.logger.info(`Scanning workspace: ${workspaceRoot}`);

    const packages = new Map<string, ScannedPackage>();

    const depFiles = this.findDepFiles(workspaceRoot);
    this.logger.info(`Found dep files: ${depFiles.join(', ') || 'none'}`);

    // Parse in priority order: setup.py first (lowest), then pyproject.toml, then requirements.txt (highest)
    for (const file of depFiles) {
      const parsed = this.parseDepFile(file);
      for (const pkg of parsed) {
        packages.set(pkg.name, pkg);
      }
    }

    if (packages.size === 0) {
      this.logger.warn('No packages found in dependency files');
      return [];
    }

    // Overlay with installed versions from pip
    const installed = await this.getPipInstalledVersions(workspaceRoot).catch(err => {
      this.logger.error(`pip list unavailable — installed versions will not be shown: ${String(err)}`);
      return new Map<string, string>();
    });
    const pipDetails = await this.getPipShowDetails([...packages.keys()], workspaceRoot).catch(err => {
      this.logger.error(`pip show unavailable — dependency details will not be shown: ${String(err)}`);
      return new Map<string, { requires: string[] }>();
    });

    for (const [name, pkg] of packages) {
      pkg.installedVersion = installed.get(name) ?? '';
      pkg.requires = pipDetails.get(name)?.requires ?? [];
    }

    this.logger.info(`Scan complete: ${packages.size} packages found`);
    return [...packages.values()];
  }

  private findDepFiles(root: string): string[] {
    const candidates = [
      path.join(root, 'setup.py'),
      path.join(root, 'setup.cfg'),
      path.join(root, 'Pipfile'),
      path.join(root, 'pyproject.toml'),
      path.join(root, 'requirements.txt'),
      path.join(root, 'requirements-dev.txt'),
      path.join(root, 'requirements-dev.in'),
      path.join(root, 'dev-requirements.txt'),
      path.join(root, 'requirements-test.txt'),
      path.join(root, 'test-requirements.txt'),
      path.join(root, 'requirements-docs.txt'),
      path.join(root, 'docs-requirements.txt'),
      path.join(root, 'requirements-lint.txt'),
      path.join(root, 'lint-requirements.txt'),
    ];
    return candidates.filter(f => fs.existsSync(f));
  }

  private getGroupFromFileName(filename: string): 'main' | 'dev' | 'test' | 'docs' | 'lint' {
    const name = filename.toLowerCase();
    if (name.includes('dev')) { return 'dev'; }
    if (name.includes('test')) { return 'test'; }
    if (name.includes('docs') || name.includes('doc')) { return 'docs'; }
    if (name.includes('lint')) { return 'lint'; }
    return 'main';
  }

  private parseDepFile(filePath: string): ScannedPackage[] {
    const basename = path.basename(filePath);
    try {
      if (basename.endsWith('.txt') || basename.endsWith('.in')) {
        const group = this.getGroupFromFileName(basename);
        return this.parseRequirementsTxt(filePath, group);
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

  private parseRequirementsTxt(
    filePath: string,
    group: 'main' | 'dev' | 'test' | 'docs' | 'lint' | 'optional' = 'main',
    visited = new Set<string>()
  ): ScannedPackage[] {
    if (visited.has(filePath)) { return []; }
    visited.add(filePath);

    const content = fs.readFileSync(filePath, 'utf-8');
    const results: ScannedPackage[] = [];

    // Join continuation lines
    const normalized = content.replace(/\\\n\s*/g, ' ');
    const lines = normalized.split('\n');

    for (const rawLine of lines) {
      // Strip inline comments
      const line = rawLine.split('#')[0].trim();
      if (!line) { continue; }

      // Follow -r / --requirement includes
      const includeMatch = line.match(/^(?:-r|--requirement)\s+(.+)$/);
      if (includeMatch) {
        const includePath = includeMatch[1].trim();
        const absInclude = path.resolve(path.dirname(filePath), includePath);
        if (fs.existsSync(absInclude)) {
          const includeGroup = this.getGroupFromFileName(path.basename(absInclude));
          results.push(...this.parseRequirementsTxt(absInclude, includeGroup, visited));
        }
        continue;
      }

      // Skip other options (-i, --index-url, -c, -e, --extra-index-url, etc.) and URLs
      if (
        line.startsWith('-') ||
        line.startsWith('http://') ||
        line.startsWith('https://')
      ) {
        continue;
      }

      // Match: name[extras]version_spec or name[extras]
      const match = line.match(
        /^([A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?)(\[([^\]]+)\])?(.*)?$/
      );
      if (!match) {
        continue;
      }

      results.push({
        name: this.normalizeName(match[1]),
        specifiedVersion: (match[5] ?? '').trim(),
        installedVersion: '',
        source: 'requirements.txt',
        extras: match[4] ? match[4].split(',').map(e => e.trim()) : [],
        requires: [],
        group,
      });
    }

    return results;
  }

  private parsePyprojectToml(filePath: string): ScannedPackage[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = toml.parse(content) as Record<string, unknown>;
    const results: ScannedPackage[] = [];

    // PEP 621: [project] dependencies = ["requests>=2.0", ...]
    const projectDeps =
      (parsed as { project?: { dependencies?: unknown[] } })?.project
        ?.dependencies ?? [];
    for (const dep of projectDeps as string[]) {
      const m = dep.match(/^([A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?)(\[.*?\])?(.*)?$/);
      if (m) {
        results.push({
          name: this.normalizeName(m[1]),
          specifiedVersion: (m[4] ?? '').trim(),
          installedVersion: '',
          source: 'pyproject.toml',
          extras: m[3] ? m[3].slice(1, -1).split(',').map(e => e.trim()) : [],
          requires: [],
          group: 'main',
        });
      }
    }

    // PEP 621: [project.optional-dependencies] sections
    const optionalDeps =
      (parsed as { project?: { 'optional-dependencies'?: Record<string, unknown[]> } })
        ?.project?.['optional-dependencies'] ?? {};
    for (const [sectionKey, deps] of Object.entries(optionalDeps)) {
      const grp = this.keyToGroup(sectionKey);
      for (const dep of deps as string[]) {
        const m = dep.match(/^([A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?)(\[.*?\])?(.*)?$/);
        if (m) {
          results.push({
            name: this.normalizeName(m[1]),
            specifiedVersion: (m[4] ?? '').trim(),
            installedVersion: '',
            source: 'pyproject.toml',
            extras: m[3] ? m[3].slice(1, -1).split(',').map(e => e.trim()) : [],
            requires: [],
            group: grp,
          });
        }
      }
    }

    // Poetry: [tool.poetry.dependencies]
    const poetryDeps =
      (
        parsed as {
          tool?: { poetry?: { dependencies?: Record<string, unknown> } };
        }
      )?.tool?.poetry?.dependencies ?? {};
    for (const [pkgName, version] of Object.entries(poetryDeps)) {
      if (pkgName.toLowerCase() === 'python') {
        continue;
      }
      const spec =
        typeof version === 'string'
          ? version
          : (version as Record<string, string>)?.version ?? '';
      results.push({
        name: this.normalizeName(pkgName),
        specifiedVersion: spec,
        installedVersion: '',
        source: 'pyproject.toml',
        extras: [],
        requires: [],
        group: 'main',
      });
    }

    // Poetry: [tool.poetry.dev-dependencies]
    const poetryDevDeps =
      (
        parsed as {
          tool?: { poetry?: { 'dev-dependencies'?: Record<string, unknown> } };
        }
      )?.tool?.poetry?.['dev-dependencies'] ?? {};
    for (const [pkgName, version] of Object.entries(poetryDevDeps)) {
      const spec =
        typeof version === 'string'
          ? version
          : (version as Record<string, string>)?.version ?? '';
      results.push({
        name: this.normalizeName(pkgName),
        specifiedVersion: spec,
        installedVersion: '',
        source: 'pyproject.toml',
        extras: [],
        requires: [],
        group: 'dev',
      });
    }

    // Poetry: [tool.poetry.group.<name>.dependencies]
    const poetryGroups =
      (
        parsed as {
          tool?: { poetry?: { group?: Record<string, { dependencies?: Record<string, unknown> }> } };
        }
      )?.tool?.poetry?.group ?? {};
    for (const [groupName, groupData] of Object.entries(poetryGroups)) {
      const grp = this.keyToGroup(groupName);
      for (const [pkgName, version] of Object.entries(groupData.dependencies ?? {})) {
        const spec =
          typeof version === 'string'
            ? version
            : (version as Record<string, string>)?.version ?? '';
        results.push({
          name: this.normalizeName(pkgName),
          specifiedVersion: spec,
          installedVersion: '',
          source: 'pyproject.toml',
          extras: [],
          requires: [],
          group: grp,
        });
      }
    }

    return results;
  }

  private keyToGroup(key: string): 'main' | 'dev' | 'test' | 'docs' | 'lint' | 'optional' {
    const k = key.toLowerCase();
    if (k.includes('dev')) { return 'dev'; }
    if (k.includes('test')) { return 'test'; }
    if (k.includes('docs') || k.includes('doc')) { return 'docs'; }
    if (k.includes('lint')) { return 'lint'; }
    return 'optional';
  }

  private parseSetupPy(filePath: string): ScannedPackage[] {
    // Regex-only parse — never execute setup.py (arbitrary code risk)
    const content = fs.readFileSync(filePath, 'utf-8');

    const results: ScannedPackage[] = [];

    const blockMatch = content.match(/install_requires\s*=\s*\[([^\]]*)\]/s);
    if (blockMatch) {
      const depEntries = blockMatch[1].matchAll(
        /['"]([A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?)(\[.*?\])?([^'"]*)['"]/g
      );

      for (const m of depEntries) {
        results.push({
          name: this.normalizeName(m[1]),
          specifiedVersion: (m[4] ?? '').trim(),
          installedVersion: '',
          source: 'setup.py',
          extras: m[3] ? m[3].slice(1, -1).split(',').map(e => e.trim()) : [],
          requires: [],
          group: 'main',
        });
      }
    }

    // Parse extras_require for dev/test/docs groups
    const extrasMatch = content.match(/extras_require\s*=\s*\{([^}]*)\}/s);
    if (extrasMatch) {
      // Find each key: [list] section
      const sectionRe = /['"]([^'"]+)['"]\s*:\s*\[([^\]]*)\]/gs;
      let sectionM: RegExpExecArray | null;
      while ((sectionM = sectionRe.exec(extrasMatch[1])) !== null) {
        const sectionKey = sectionM[1];
        const grp = this.keyToGroup(sectionKey);
        const depEntries = sectionM[2].matchAll(
          /['"]([A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?)(\[.*?\])?([^'"]*)['"]/g
        );
        for (const m of depEntries) {
          results.push({
            name: this.normalizeName(m[1]),
            specifiedVersion: (m[4] ?? '').trim(),
            installedVersion: '',
            source: 'setup.py',
            extras: m[3] ? m[3].slice(1, -1).split(',').map(e => e.trim()) : [],
            requires: [],
            group: grp,
          });
        }
      }
    }

    return results;
  }

  private parseSetupCfg(filePath: string): ScannedPackage[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const results: ScannedPackage[] = [];

    // Split into INI sections by lines starting with [
    const sectionParts = content.split(/^(?=\[)/m);

    for (const part of sectionParts) {
      const headerMatch = part.match(/^\[([^\]]+)\]/);
      if (!headerMatch) { continue; }

      const sectionName = headerMatch[1].trim();
      const body = part.slice(headerMatch[0].length);

      if (sectionName === 'options') {
        const depsValue = this.extractIniKey(body, 'install_requires');
        if (depsValue) {
          for (const dep of this.splitSetupCfgDeps(depsValue)) {
            const pkg = this.parseSingleDep(dep, 'setup.cfg', 'main');
            if (pkg) { results.push(pkg); }
          }
        }
      } else if (sectionName === 'options.extras_require') {
        for (const { key, value } of this.extractIniPairs(body)) {
          const grp = this.keyToGroup(key);
          for (const dep of this.splitSetupCfgDeps(value)) {
            const pkg = this.parseSingleDep(dep, 'setup.cfg', grp);
            if (pkg) { results.push(pkg); }
          }
        }
      }
    }

    return results;
  }

  private parsePipfile(filePath: string): ScannedPackage[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    let parsed: Record<string, unknown>;
    try {
      parsed = toml.parse(content) as Record<string, unknown>;
    } catch (err) {
      this.logger.warn(`Failed to parse Pipfile as TOML: ${String(err)}`);
      return [];
    }

    const results: ScannedPackage[] = [];
    const skip = new Set(['python_version', 'python_full_version']);

    const processSection = (
      section: Record<string, unknown>,
      group: 'main' | 'dev'
    ): void => {
      for (const [pkgName, version] of Object.entries(section)) {
        if (skip.has(pkgName.toLowerCase())) { continue; }
        let spec = '';
        let extras: string[] = [];
        if (typeof version === 'string') {
          spec = version === '*' ? '' : version;
        } else if (typeof version === 'object' && version !== null) {
          const v = version as Record<string, unknown>;
          spec = typeof v['version'] === 'string' ? (v['version'] === '*' ? '' : v['version']) : '';
          if (Array.isArray(v['extras'])) {
            extras = (v['extras'] as unknown[]).map(String);
          }
        }
        results.push({
          name: this.normalizeName(pkgName),
          specifiedVersion: spec,
          installedVersion: '',
          source: 'Pipfile',
          extras,
          requires: [],
          group,
        });
      }
    };

    const packages = parsed['packages'] as Record<string, unknown> | undefined;
    const devPackages = parsed['dev-packages'] as Record<string, unknown> | undefined;
    if (packages) { processSection(packages, 'main'); }
    if (devPackages) { processSection(devPackages, 'dev'); }

    return results;
  }

  private parseSingleDep(
    dep: string,
    source: DepFileType,
    group: ScannedPackage['group']
  ): ScannedPackage | null {
    const m = dep.match(
      /^([A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?)(\[([^\]]+)\])?(.*)?$/
    );
    if (!m) { return null; }
    return {
      name: this.normalizeName(m[1]),
      specifiedVersion: (m[5] ?? '').trim(),
      installedVersion: '',
      source,
      extras: m[4] ? m[4].split(',').map(e => e.trim()) : [],
      requires: [],
      group,
    };
  }

  private extractIniKey(body: string, key: string): string | null {
    // Matches: key = value\n  continuation\n  continuation
    const re = new RegExp(`^${key}\\s*=\\s*(.*(?:\\n[ \\t]+.*)*)`, 'm');
    const m = body.match(re);
    return m ? m[1] : null;
  }

  private extractIniPairs(body: string): Array<{ key: string; value: string }> {
    const pairs: Array<{ key: string; value: string }> = [];
    const re = /^([\w-]+)\s*=\s*(.*(?:\n[ \t]+.*)*)$/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      pairs.push({ key: m[1], value: m[2] });
    }
    return pairs;
  }

  private splitSetupCfgDeps(value: string): string[] {
    return value.split(/[\n;]/)
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#') && /^[A-Za-z]/.test(l));
  }

  private async getPipInstalledVersions(
    cwd: string
  ): Promise<Map<string, string>> {
    const uvPath = await this.resolveUvPath(cwd);
    const cmd = uvPath ?? this.resolvePythonPath();
    const args = uvPath ? ['pip', 'list', '--format=json'] : ['-m', 'pip', 'list', '--format=json'];

    return new Promise((resolve, reject) => {
      this.logger.debug(`Running: ${cmd} ${args.join(' ')}`);
      const child = cp.spawn(cmd, args, { cwd });

      let stdout = '';
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, 30_000);

      child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });

      child.on('close', (code: number | null) => {
        clearTimeout(timer);
        if (timedOut) {
          return reject(new Error('pip list timed out'));
        }
        if (code !== 0) {
          return reject(new Error(`pip list exited with code ${code}`));
        }
        try {
          const entries = JSON.parse(stdout) as Array<{ name: string; version: string }>;
          const map = new Map<string, string>();
          for (const e of entries) {
            map.set(this.normalizeName(e.name), e.version);
          }
          resolve(map);
        } catch {
          this.logger.warn('Failed to parse pip list output');
          resolve(new Map());
        }
      });

      child.on('error', (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  private async getPipShowDetails(
    packageNames: string[],
    cwd: string
  ): Promise<Map<string, { requires: string[] }>> {
    if (packageNames.length === 0) {
      return Promise.resolve(new Map());
    }

    const uvPath = await this.resolveUvPath(cwd);
    const cmd = uvPath ?? this.resolvePythonPath();
    const args = uvPath
      ? ['pip', 'show', ...packageNames]
      : ['-m', 'pip', 'show', ...packageNames];

    return new Promise((resolve, reject) => {
      this.logger.debug(`Running: ${cmd} ${args.join(' ')}`);
      const child = cp.spawn(cmd, args, { cwd });

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, 30_000);

      child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });
      child.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });

      child.on('close', (code: number | null) => {
        clearTimeout(timer);
        if (timedOut) {
          return reject(new Error('pip show timed out'));
        }
        if (code !== 0 && !stdout) {
          return reject(new Error(`pip show failed (exit ${code}): ${stderr.trim()}`));
        }

        const map = new Map<string, { requires: string[] }>();
        // pip show output is separated by "---" lines
        const blocks = stdout.split(/^---$/m);

        for (const block of blocks) {
          const nameMatch = block.match(/^Name:\s*(.+)$/m);
          const reqMatch = block.match(/^Requires:\s*(.*)$/m);

          if (!nameMatch) {
            continue;
          }
          const name = this.normalizeName(nameMatch[1].trim());
          const requires =
            reqMatch && reqMatch[1].trim()
              ? reqMatch[1]
                  .split(',')
                  .map(r => this.normalizeName(r.trim()))
                  .filter(r => r.length > 0)
              : [];

          map.set(name, { requires });
        }

        resolve(map);
      });

      child.on('error', (err: Error) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  resolvePythonPath(): string {
    const config = vscode.workspace.getConfiguration(
      'pythonPackageVisualizer'
    );
    const override = config.get<string>('pythonPath', '');
    if (override) {
      return override;
    }

    // Try workspace-local virtual environments first
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
      const root = workspaceFolders[0].uri.fsPath;
      const venvPython = this.resolveForWorkspace(root);
      if (venvPython) {
        this.logger.debug(`Using venv Python: ${venvPython}`);
        return venvPython;
      }
    }

    // Try ms-python extension active interpreter
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

  /**
   * Check for virtual environment Python interpreters in the workspace root.
   * Checks common venv directory names in priority order.
   * Returns the path to the Python executable if found, otherwise null.
   */
  resolveForWorkspace(root: string): string | null {
    const isWindows = process.platform === 'win32';
    const venvDirs = ['.venv', 'venv', 'env', '.env'];

    for (const venvDir of venvDirs) {
      const pythonPath = isWindows
        ? path.join(root, venvDir, 'Scripts', 'python.exe')
        : path.join(root, venvDir, 'bin', 'python');

      if (fs.existsSync(pythonPath)) {
        return pythonPath;
      }
    }

    return null;
  }

  normalizeName(name: string): string {
    // PEP 503 normalization
    return name.toLowerCase().replace(/[-_.]+/g, '-');
  }

  /**
   * Run `pip check` (or `uv pip check`) and return a list of dependency conflicts.
   * pip check exits with code 1 when conflicts exist — that is expected, not an error.
   */
  async checkConflicts(cwd: string): Promise<ConflictInfo[]> {
    const uvPath = await this.resolveUvPath(cwd);
    const cmd = uvPath ?? this.resolvePythonPath();
    const args = uvPath ? ['pip', 'check'] : ['-m', 'pip', 'check'];

    return new Promise(resolve => {
      const child = cp.spawn(cmd, args, { cwd });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => { child.kill(); resolve([]); }, 30_000);

      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      child.on('close', () => {
        clearTimeout(timer);
        resolve(this.parseConflicts(stdout + '\n' + stderr));
      });
      child.on('error', () => { clearTimeout(timer); resolve([]); });
    });
  }

  private parseConflicts(output: string): ConflictInfo[] {
    const conflicts: ConflictInfo[] = [];
    for (const line of output.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) { continue; }

      // pip: "numpy 1.24.4 has requirement contourpy>=1.0.1, but you have contourpy 0.8.0."
      const m1 = trimmed.match(
        /^(\S+)\s+(\S+)\s+has requirement\s+(.+?),\s+but you have\s+(\S+)\s+(\S+)\.?$/i
      );
      if (m1) {
        conflicts.push({
          package: this.normalizeName(m1[1]),
          version: m1[2],
          requirement: m1[3],
          conflictingPackage: this.normalizeName(m1[4]),
          conflictingVersion: m1[5],
        });
        continue;
      }

      // pip: "numpy 1.24.4 requires scipy, which is not installed."
      const m2 = trimmed.match(
        /^(\S+)\s+(\S+)\s+(?:requires|has requirement)\s+(\S+(?:\[.*?\])?),\s+which is not installed\.?$/i
      );
      if (m2) {
        const depName = m2[3].replace(/[>=<!~^[\]].*/g, '');
        conflicts.push({
          package: this.normalizeName(m2[1]),
          version: m2[2],
          requirement: m2[3],
          conflictingPackage: this.normalizeName(depName),
          conflictingVersion: 'not installed',
        });
      }
    }
    return conflicts;
  }
}
