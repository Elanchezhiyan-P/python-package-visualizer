import * as fs from 'fs';
import * as path from 'path';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '__pycache__',
  '.venv',
  'venv',
  'env',
  '.env',
  'dist',
  'build',
  'site-packages',
  '.tox',
  '.mypy_cache',
  '.pytest_cache',
  '.eggs',
  '.ruff_cache',
  '.vscode-test',
  'out',
  'out-test',
]);

/** Parse priority: lower index = parsed first (lower merge priority for requirements). */
const DEP_FILE_PRIORITY = [
  'setup.py',
  'setup.cfg',
  'Pipfile',
  'pyproject.toml',
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
] as const;

const DEV_REQUIREMENTS_NAMES = new Set([
  'requirements-dev.txt',
  'requirements-dev.in',
  'dev-requirements.txt',
]);

const MAX_SEARCH_DEPTH = 6;

/**
 * Discovers Python dependency manifest files under a workspace root,
 * including monorepo layouts (e.g. backend/requirements.txt).
 */
export function discoverDepFiles(
  root: string,
  options?: { manualPath?: string; maxDepth?: number }
): string[] {
  const maxDepth = options?.maxDepth ?? MAX_SEARCH_DEPTH;
  const found = new Map<string, string>();

  collectDepFiles(root, root, 0, maxDepth, found);

  if (options?.manualPath && fs.existsSync(options.manualPath)) {
    found.set(path.resolve(options.manualPath), options.manualPath);
  }

  const files = [...found.values()];
  const pruned = pruneRedundantIncludedRequirements(files);
  return sortDepFiles(pruned);
}

function collectDepFiles(
  root: string,
  dir: string,
  depth: number,
  maxDepth: number,
  found: Map<string, string>
): void {
  if (depth > maxDepth) {
    return;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const name = entry.name;
    if (!isKnownDepFile(name)) {
      continue;
    }

    const absPath = path.resolve(dir, name);
    found.set(absPath, absPath);
  }

  if (depth >= maxDepth) {
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) {
      continue;
    }

    collectDepFiles(root, path.join(dir, entry.name), depth + 1, maxDepth, found);
  }
}

const LOCK_FILES = new Set([
  'poetry.lock',
  'Pipfile.lock',
  'uv.lock',
  'pdm.lock',
]);

function isKnownDepFile(name: string): boolean {
  if ((DEP_FILE_PRIORITY as readonly string[]).includes(name)) {
    return true;
  }
  return name.endsWith('.in') && name.startsWith('requirements');
}

/** True when a file declares or locks Python dependencies (not usage in app code). */
export function isDependencyDeclarationFile(filePath: string): boolean {
  const base = path.basename(filePath);
  if (isKnownDepFile(base) || LOCK_FILES.has(base)) {
    return true;
  }

  const lower = base.toLowerCase();
  if (lower.startsWith('constraints') && lower.endsWith('.txt')) {
    return true;
  }
  if (lower.startsWith('requirements') && (lower.endsWith('.txt') || lower.endsWith('.in'))) {
    return true;
  }

  return false;
}

/**
 * When requirements-dev.txt includes requirements.txt in the same folder,
 * skip parsing the base file separately to avoid duplicate merge noise.
 */
export function pruneRedundantIncludedRequirements(files: string[]): string[] {
  const byDir = new Map<string, string[]>();
  for (const file of files) {
    const dir = path.dirname(file);
    const list = byDir.get(dir) ?? [];
    list.push(file);
    byDir.set(dir, list);
  }

  const skip = new Set<string>();

  for (const dirFiles of byDir.values()) {
    const devFiles = dirFiles.filter(f => DEV_REQUIREMENTS_NAMES.has(path.basename(f)));
    const baseFile = dirFiles.find(f => path.basename(f) === 'requirements.txt');
    if (!baseFile || devFiles.length === 0) {
      continue;
    }

    for (const devFile of devFiles) {
      if (requirementsFileIncludes(devFile, baseFile)) {
        skip.add(path.resolve(baseFile));
      }
    }
  }

  return files.filter(f => !skip.has(path.resolve(f)));
}

/**
 * Returns true when `devFile` contains a -r/--requirement include pointing at `targetFile`.
 */
export function requirementsFileIncludes(devFile: string, targetFile: string): boolean {
  if (!fs.existsSync(devFile) || !fs.existsSync(targetFile)) {
    return false;
  }

  let content: string;
  try {
    content = fs.readFileSync(devFile, 'utf-8');
  } catch {
    return false;
  }

  const targetResolved = path.resolve(targetFile);
  const targetBase = path.basename(targetFile);

  for (const rawLine of content.split('\n')) {
    const line = rawLine.split('#')[0].trim();
    const match = line.match(/^(?:-r|--requirement)\s+(.+)$/);
    if (!match) {
      continue;
    }

    const includeRef = match[1].trim().replace(/^['"]|['"]$/g, '');
    const resolved = path.resolve(path.dirname(devFile), includeRef);
    if (resolved === targetResolved) {
      return true;
    }

    if (path.basename(includeRef) === targetBase) {
      const sameDirCandidate = path.resolve(path.dirname(devFile), targetBase);
      if (sameDirCandidate === targetResolved) {
        return true;
      }
    }
  }

  return false;
}

export function sortDepFiles(files: string[]): string[] {
  const priority = new Map<string, number>(
    DEP_FILE_PRIORITY.map((name, index) => [name, index])
  );

  return [...files].sort((a, b) => {
    const aPri = priority.get(path.basename(a)) ?? 999;
    const bPri = priority.get(path.basename(b)) ?? 999;
    if (aPri !== bPri) {
      return aPri - bPri;
    }
    return a.localeCompare(b);
  });
}
