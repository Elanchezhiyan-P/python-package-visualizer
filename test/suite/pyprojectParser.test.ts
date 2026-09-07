import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parsePyprojectToml } from '../../src/modules/parsers/pyprojectParser.js';

suite('parsePyprojectToml', () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppv-pyproject-'));
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('parses PEP 621 project dependencies', () => {
    const filePath = path.join(tmpDir, 'pyproject.toml');
    fs.writeFileSync(
      filePath,
      `[project]\nname = "myapp"\ndependencies = [\n  "requests>=2.28",\n  "flask==2.3.0",\n]\n`
    );

    const pkgs = parsePyprojectToml(filePath);

    assert.strictEqual(pkgs.length, 2);
    const requests = pkgs.find(p => p.name === 'requests');
    const flask = pkgs.find(p => p.name === 'flask');
    assert.ok(requests);
    assert.ok(flask);
    assert.strictEqual(requests!.specifiedVersion, '>=2.28');
    assert.strictEqual(flask!.specifiedVersion, '==2.3.0');
    assert.strictEqual(requests!.source, 'pyproject.toml');
    assert.strictEqual(requests!.group, 'main');
  });

  test('parses optional-dependencies sections with group mapping', () => {
    const filePath = path.join(tmpDir, 'pyproject.toml');
    fs.writeFileSync(
      filePath,
      `[project]\nname = "myapp"\noptional-dependencies = { test = ["pytest>=7"], lint = ["ruff"] }\n`
    );

    const pkgs = parsePyprojectToml(filePath);
    const pytest = pkgs.find(p => p.name === 'pytest');
    const ruff = pkgs.find(p => p.name === 'ruff');

    assert.ok(pytest);
    assert.ok(ruff);
    assert.strictEqual(pytest!.group, 'test');
    assert.strictEqual(ruff!.group, 'lint');
  });

  test('parses Poetry dependencies and skips python runtime entry', () => {
    const filePath = path.join(tmpDir, 'pyproject.toml');
    fs.writeFileSync(
      filePath,
      `[tool.poetry.dependencies]\npython = "^3.11"\nrequests = "^2.28"\nflask = { version = "^2.3", extras = ["async"] }\n`
    );

    const pkgs = parsePyprojectToml(filePath);

    assert.strictEqual(pkgs.length, 2);
    assert.ok(!pkgs.some(p => p.name === 'python'));
    const flask = pkgs.find(p => p.name === 'flask');
    assert.ok(flask);
    assert.strictEqual(flask!.specifiedVersion, '^2.3');
  });

  test('returns empty array for missing file', () => {
    assert.deepStrictEqual(
      parsePyprojectToml(path.join(tmpDir, 'missing.toml')),
      []
    );
  });
});
