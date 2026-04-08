import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../utils/logger.js';
import { PackageScanner } from './packageScanner.js';

export class MigrationHelper {
  constructor(
    private readonly logger: Logger,
    private readonly scanner: PackageScanner,
  ) {}

  async migrateToUv(workspaceRoot: string): Promise<vscode.Uri> {
    const scanned = await this.scanner.scanWorkspace(workspaceRoot);
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
` : ''}
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.uv]
# Run: uv sync  to install dependencies
`;

    this.logger.info(`MigrationHelper: writing pyproject.toml (uv) with ${deps.length} deps + ${devDeps.length} dev deps`);
    const target = vscode.Uri.file(path.join(workspaceRoot, 'pyproject.toml'));
    await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf-8'));
    return target;
  }

  async migrateToPoetry(workspaceRoot: string): Promise<vscode.Uri> {
    const scanned = await this.scanner.scanWorkspace(workspaceRoot);
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
` : ''}
[build-system]
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
