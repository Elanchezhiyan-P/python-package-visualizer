import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import { Logger } from '../utils/logger.js';
import { PackageScanner } from './packageScanner.js';
import { discoverDepFiles } from './depFileDiscovery.js';
import { withUvGlobalArgs } from '../utils/uvSpawn.js';

/** Legacy pip requirements manifests safe to remove after a successful uv migration. */
export const LEGACY_REQUIREMENTS_BASENAMES = new Set([
  'requirements.txt',
  'requirements.in',
  'requirements-dev.txt',
  'requirements-dev.in',
  'dev-requirements.txt',
  'requirements-test.txt',
  'test-requirements.txt',
  'requirements-docs.txt',
  'docs-requirements.txt',
  'requirements-lint.txt',
  'lint-requirements.txt',
]);

/** Returns true when the file is a legacy requirements manifest (not pyproject/setup/Pipfile). */
export function isLegacyRequirementsFile(filePath: string): boolean {
  const base = path.basename(filePath);
  if (LEGACY_REQUIREMENTS_BASENAMES.has(base)) {
    return true;
  }
  return base.endsWith('.in') && base.startsWith('requirements');
}

/** Lists legacy requirements files discovered under the workspace root. */
export function listLegacyRequirementFiles(
  workspaceRoot: string,
  manualPath?: string
): string[] {
  return discoverDepFiles(workspaceRoot, { manualPath }).filter(isLegacyRequirementsFile);
}

export class MigrationHelper {
  constructor(
    private readonly logger: Logger,
    private readonly scanner: PackageScanner,
  ) {}

  async migrateToUv(workspaceRoot: string): Promise<vscode.Uri> {
    const scanned = (await this.scanner.scanWorkspace(workspaceRoot)).packages;
    const projectName = path.basename(workspaceRoot).replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const deps = scanned
      .filter(p => p.group === 'main' || !p.group)
      .map(p => p.installedVersion ? `    "${p.name}>=${p.installedVersion}",` : `    "${p.name}",`);
    const devDeps = scanned
      .filter(p => p.group === 'dev')
      .map(p => p.installedVersion ? `    "${p.name}>=${p.installedVersion}",` : `    "${p.name}",`);

    const content = `[project]
name = "${projectName}"
version = "0.1.0"
description = "Migrated from requirements.txt by Python Package Visualizer"
requires-python = ">=3.8"
dependencies = [
${deps.join('\n')}
]

${devDeps.length > 0 ? `[project.optional-dependencies]
dev = [
${devDeps.join('\n')}
]
` : ''}[tool.uv]
package = false
# Dependency-only project (not a distributable package).
# Run: uv sync --all-extras  to install main + optional dev dependencies
`;

    this.logger.info(`MigrationHelper: writing pyproject.toml (uv) with ${deps.length} deps + ${devDeps.length} dev deps`);
    const target = vscode.Uri.file(path.join(workspaceRoot, 'pyproject.toml'));
    await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf-8'));
    return target;
  }

  async runUvSync(workspaceRoot: string, uvPath: string, includeDevExtras: boolean): Promise<void> {
    const args = withUvGlobalArgs(includeDevExtras ? ['sync', '--all-extras'] : ['sync']);
    this.logger.info(`MigrationHelper: running ${uvPath} ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      let stderr = '';
      const child = cp.spawn(uvPath, args, { cwd: workspaceRoot, shell: false });
      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('close', (code: number | null) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(stderr.trim() || `uv sync exited with code ${code ?? 'unknown'}`));
      });
    });
  }

  async deleteLegacyRequirementFiles(files: string[]): Promise<string[]> {
    const deleted: string[] = [];
    for (const file of files) {
      if (!isLegacyRequirementsFile(file)) {
        continue;
      }
      try {
        await vscode.workspace.fs.delete(vscode.Uri.file(file));
        deleted.push(file);
        this.logger.info(`MigrationHelper: removed legacy requirements file ${file}`);
      } catch (err) {
        this.logger.warn(`MigrationHelper: failed to remove ${file}: ${String(err)}`);
      }
    }
    return deleted;
  }

  async migrateToPoetry(workspaceRoot: string): Promise<vscode.Uri> {
    const scanned = (await this.scanner.scanWorkspace(workspaceRoot)).packages;
    const projectName = path.basename(workspaceRoot).replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const deps = scanned
      .filter(p => p.group === 'main' || !p.group)
      .map(p => p.installedVersion ? `${p.name} = "^${p.installedVersion}"` : `${p.name} = "*"`);
    const devDeps = scanned
      .filter(p => p.group === 'dev')
      .map(p => p.installedVersion ? `${p.name} = "^${p.installedVersion}"` : `${p.name} = "*"`);

    const content = `[tool.poetry]
name = "${projectName}"
version = "0.1.0"
description = "Migrated from requirements.txt by Python Package Visualizer"
authors = ["Your Name <you@example.com>"]
readme = "README.md"

[tool.poetry.dependencies]
python = "^3.8"
${deps.join('\n')}

${devDeps.length > 0 ? `[tool.poetry.group.dev.dependencies]
${devDeps.join('\n')}
` : ''}[build-system]
requires = ["poetry-core"]
build-backend = "poetry.core.masonry.api"

# Run: poetry install
`;

    this.logger.info(`MigrationHelper: writing pyproject.toml (poetry) with ${deps.length} deps + ${devDeps.length} dev deps`);
    const target = vscode.Uri.file(path.join(workspaceRoot, 'pyproject.toml'));
    await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf-8'));
    return target;
  }
}
