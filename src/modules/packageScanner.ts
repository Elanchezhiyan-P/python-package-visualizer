import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as vscode from 'vscode';
import * as toml from '@iarna/toml';
import { Logger } from '../utils/logger.js';

export type DepFileType = 'requirements.txt' | 'pyproject.toml' | 'setup.py';

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
  constructor(private readonly logger: Logger) {}

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
    const installed = await this.getPipInstalledVersions(workspaceRoot);
    const pipDetails = await this.getPipShowDetails(
      [...packages.keys()],
      workspaceRoot
    );

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
    } catch (err) {
      this.logger.error(`Failed to parse ${filePath}: ${String(err)}`);
    }
    return [];
  }

  private parseRequirementsTxt(
    filePath: string,
    group: 'main' | 'dev' | 'test' | 'docs' | 'lint' | 'optional' = 'main'
  ): ScannedPackage[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const results: ScannedPackage[] = [];

    // Join continuation lines
    const normalized = content.replace(/\\\n\s*/g, ' ');
    const lines = normalized.split('\n');

    for (const rawLine of lines) {
      // Strip inline comments
      const line = rawLine.split('#')[0].trim();

      // Skip empty, options (-i, -r, -c, --), editable (-e), URLs
      if (
        !line ||
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

  private getPipInstalledVersions(
    cwd: string
  ): Promise<Map<string, string>> {
    return new Promise(resolve => {
      const python = this.resolvePythonPath();
      const cmd = `"${python}" -m pip list --format=json`;

      this.logger.debug(`Running: ${cmd}`);
      cp.exec(cmd, { cwd, timeout: 30_000 }, (err, stdout) => {
        if (err) {
          this.logger.warn(`pip list failed: ${err.message}`);
          return resolve(new Map());
        }
        try {
          const entries = JSON.parse(stdout) as Array<{
            name: string;
            version: string;
          }>;
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
    });
  }

  private getPipShowDetails(
    packageNames: string[],
    cwd: string
  ): Promise<Map<string, { requires: string[] }>> {
    if (packageNames.length === 0) {
      return Promise.resolve(new Map());
    }

    return new Promise(resolve => {
      const python = this.resolvePythonPath();
      const names = packageNames.join(' ');
      const cmd = `"${python}" -m pip show ${names}`;

      this.logger.debug(`Running: ${cmd}`);
      cp.exec(
        cmd,
        { cwd, timeout: 30_000, maxBuffer: 1024 * 1024 * 10 },
        (err, stdout) => {
          if (err && !stdout) {
            this.logger.warn(`pip show failed: ${err.message}`);
            return resolve(new Map());
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
        }
      );
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
}
