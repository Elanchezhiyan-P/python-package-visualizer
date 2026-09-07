import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RequirementsSync } from '../../src/modules/requirementsSync.js';
import { stubLogger } from '../helpers/stubLogger.js';

suite('RequirementsSync', () => {
  let tmpDir: string;
  let sync: RequirementsSync;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppv-sync-'));
    sync = new RequirementsSync(stubLogger);
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('removePackage removes matching line from requirements.txt', async () => {
    const reqPath = path.join(tmpDir, 'requirements.txt');
    fs.writeFileSync(reqPath, 'requests>=2.0\nflask==2.3.0\nnumpy\n');

    const result = await sync.removePackage(tmpDir, 'flask', 'requirements.txt');

    assert.strictEqual(result.outcome, 'synced');
    const content = fs.readFileSync(reqPath, 'utf-8');
    assert.ok(!content.includes('flask'));
    assert.ok(content.includes('requests'));
    assert.ok(content.includes('numpy'));
  });

  test('removePackage matches PEP 503 name variants', async () => {
    const reqPath = path.join(tmpDir, 'requirements.txt');
    fs.writeFileSync(reqPath, 'My_Package>=1.0\n');

    const result = await sync.removePackage(tmpDir, 'my-package', 'requirements.txt');

    assert.strictEqual(result.outcome, 'synced');
    assert.strictEqual(fs.readFileSync(reqPath, 'utf-8').trim(), '');
  });

  test('syncVersion pins version in requirements.txt', async () => {
    const reqPath = path.join(tmpDir, 'requirements.txt');
    fs.writeFileSync(reqPath, 'requests>=2.0\nflask\n');

    const result = await sync.syncVersion(tmpDir, 'requests', '2.32.0', 'requirements.txt');

    assert.strictEqual(result.outcome, 'synced');
    const content = fs.readFileSync(reqPath, 'utf-8');
    assert.ok(content.includes('requests==2.32.0'));
    assert.ok(content.includes('flask==2.32.0') === false);
    assert.ok(content.includes('flask\n') || content.endsWith('flask'));
  });

  test('syncVersion updates bare package name', async () => {
    const reqPath = path.join(tmpDir, 'requirements.txt');
    fs.writeFileSync(reqPath, 'numpy\n');

    const result = await sync.syncVersion(tmpDir, 'numpy', '1.26.0', 'requirements.txt');

    assert.strictEqual(result.outcome, 'synced');
    assert.strictEqual(fs.readFileSync(reqPath, 'utf-8').trim(), 'numpy==1.26.0');
  });

  test('syncVersion updates PEP 621 pyproject.toml array entry', async () => {
    const tomlPath = path.join(tmpDir, 'pyproject.toml');
    fs.writeFileSync(
      tomlPath,
      `[project]\nname = "app"\ndependencies = [\n  "requests>=2.0",\n  "flask",\n]\n`
    );

    const result = await sync.syncVersion(tmpDir, 'requests', '2.32.0', 'pyproject.toml');

    assert.strictEqual(result.outcome, 'synced');
    const content = fs.readFileSync(tomlPath, 'utf-8');
    assert.ok(content.includes('"requests==2.32.0"'));
    assert.ok(!content.includes('requests>=2.0'));
  });

  test('syncVersion updates Poetry table entry', async () => {
    const tomlPath = path.join(tmpDir, 'pyproject.toml');
    fs.writeFileSync(
      tomlPath,
      `[tool.poetry.dependencies]\npython = "^3.11"\nrequests = "^2.28"\n`
    );

    const result = await sync.syncVersion(tmpDir, 'requests', '2.32.0', 'pyproject.toml');

    assert.strictEqual(result.outcome, 'synced');
    assert.ok(fs.readFileSync(tomlPath, 'utf-8').includes('requests = "==2.32.0"'));
  });

  test('removePackage removes Poetry table entry', async () => {
    const tomlPath = path.join(tmpDir, 'pyproject.toml');
    fs.writeFileSync(
      tomlPath,
      `[tool.poetry.dependencies]\npython = "^3.11"\nrequests = "^2.28"\nblack = "*"\n`
    );

    const result = await sync.removePackage(tmpDir, 'black', 'pyproject.toml');

    assert.strictEqual(result.outcome, 'synced');
    const content = fs.readFileSync(tomlPath, 'utf-8');
    assert.ok(!content.includes('black'));
    assert.ok(content.includes('requests'));
  });

  test('returns not-found for missing file', async () => {
    const result = await sync.removePackage(tmpDir, 'requests', 'missing.txt');
    assert.strictEqual(result.outcome, 'not-found');
  });

  test('returns unsupported for setup.py', async () => {
    fs.writeFileSync(path.join(tmpDir, 'setup.py'), 'from setuptools import setup\n');
    const result = await sync.syncVersion(tmpDir, 'requests', '2.0.0', 'setup.py');
    assert.strictEqual(result.outcome, 'unsupported');
  });

  test('syncVersionWithFallback finds package in included requirements file', async () => {
    const backendDir = path.join(tmpDir, 'backend');
    fs.mkdirSync(backendDir, { recursive: true });
    fs.writeFileSync(path.join(backendDir, 'requirements.txt'), 'django>=4.0\n');
    fs.writeFileSync(
      path.join(backendDir, 'requirements-dev.txt'),
      '-r requirements.txt\npytest\n'
    );

    const result = await sync.syncVersionWithFallback(
      tmpDir,
      'django',
      '5.0.0',
      'backend/requirements-dev.txt'
    );

    assert.strictEqual(result.outcome, 'synced');
    const baseContent = fs.readFileSync(path.join(backendDir, 'requirements.txt'), 'utf-8');
    assert.ok(baseContent.includes('django==5.0.0'));
  });

  test('removePackage matches PEP 508 direct URL references', async () => {
    const reqPath = path.join(tmpDir, 'requirements.txt');
    fs.writeFileSync(reqPath, 'djoser @ git+https://github.com/sunscrapers/djoser.git\nrequests>=2.0\n');

    const result = await sync.removePackage(tmpDir, 'djoser', 'requirements.txt');

    assert.strictEqual(result.outcome, 'synced');
    const content = fs.readFileSync(reqPath, 'utf-8');
    assert.ok(!content.includes('djoser'));
    assert.ok(content.includes('requests'));
  });

  test('removePackage handles UTF-16 encoded requirements files', async () => {
    const reqPath = path.join(tmpDir, 'requirements.txt');
    fs.writeFileSync(reqPath, '\uFEFFdjoser==2.2.3\nrequests>=2.0\n', 'utf16le');

    const result = await sync.removePackage(tmpDir, 'djoser', 'requirements.txt');

    assert.strictEqual(result.outcome, 'synced');
    const { readDependencyFileContent } = await import('../../src/modules/parsers/utils.js');
    const content = readDependencyFileContent(reqPath).content;
    assert.ok(!content.includes('djoser'));
    assert.ok(content.includes('requests'));
  });

  test('removePackageWithFallback finds package in included requirements file', async () => {
    const backendDir = path.join(tmpDir, 'backend');
    fs.mkdirSync(backendDir, { recursive: true });
    fs.writeFileSync(path.join(backendDir, 'requirements.txt'), 'djoser==2.2.3\n');
    fs.writeFileSync(
      path.join(backendDir, 'requirements-dev.txt'),
      '-r requirements.txt\npytest\n'
    );

    const result = await sync.removePackageWithFallback(
      tmpDir,
      'djoser',
      'backend/requirements-dev.txt'
    );

    assert.strictEqual(result.outcome, 'synced');
    const baseContent = fs.readFileSync(path.join(backendDir, 'requirements.txt'), 'utf-8');
    assert.ok(!baseContent.includes('djoser'));
  });

  test('syncVersion handles line continuations and hash options', async () => {
    const reqPath = path.join(tmpDir, 'requirements.txt');
    fs.writeFileSync(
      reqPath,
      'django==4.2.0 \\\n    --hash=sha256:abc123\nrequests>=2.0\n'
    );

    const result = await sync.syncVersion(tmpDir, 'django', '4.2.7', 'requirements.txt');

    assert.strictEqual(result.outcome, 'synced');
    const content = fs.readFileSync(reqPath, 'utf-8');
    assert.ok(content.includes('django==4.2.7'));
    assert.ok(content.includes('--hash=sha256:abc123'));
    assert.ok(content.includes('requests>=2.0'));
  });

  test('syncVersion preserves environment markers', async () => {
    const reqPath = path.join(tmpDir, 'requirements.txt');
    fs.writeFileSync(reqPath, "django>=4.0; python_version>='3.10'\n");

    const result = await sync.syncVersion(tmpDir, 'django', '5.0.0', 'requirements.txt');

    assert.strictEqual(result.outcome, 'synced');
    assert.ok(
      fs.readFileSync(reqPath, 'utf-8').includes("django==5.0.0; python_version>='3.10'")
    );
  });
});
