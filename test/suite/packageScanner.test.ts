import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PackageScanner } from '../../src/modules/packageScanner.js';

// Minimal logger stub
const stubLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  show: () => {},
} as unknown as import('../../src/utils/logger.js').Logger;

suite('PackageScanner', () => {
  let tmpDir: string;
  let scanner: PackageScanner;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppv-test-'));
    scanner = new PackageScanner(stubLogger);
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── requirements.txt ───────────────────────────────────────────────────

  test('parses basic requirements.txt', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'requirements.txt'),
      [
        '# comment line',
        'requests>=2.0',
        'Flask==2.3.0',
        'numpy',
        '',
        '# another comment',
        'scipy>=1.0,<2.0',
      ].join('\n')
    );

    const pkgs = (scanner as unknown as {
      parseRequirementsTxt: (f: string) => unknown[];
    }).parseRequirementsTxt(path.join(tmpDir, 'requirements.txt')) as Array<{
      name: string;
      specifiedVersion: string;
    }>;

    assert.strictEqual(pkgs.length, 4);
    assert.strictEqual(pkgs[0].name, 'requests');
    assert.strictEqual(pkgs[0].specifiedVersion, '>=2.0');
    assert.strictEqual(pkgs[1].name, 'flask');
    assert.strictEqual(pkgs[1].specifiedVersion, '==2.3.0');
    assert.strictEqual(pkgs[2].name, 'numpy');
    assert.strictEqual(pkgs[2].specifiedVersion, '');
    assert.strictEqual(pkgs[3].name, 'scipy');
  });

  test('skips -r includes and -e editable installs', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'requirements.txt'),
      [
        '-r base.txt',
        '-e .',
        '--index-url https://pypi.org',
        'requests',
      ].join('\n')
    );

    const pkgs = (scanner as unknown as {
      parseRequirementsTxt: (f: string) => unknown[];
    }).parseRequirementsTxt(path.join(tmpDir, 'requirements.txt')) as Array<{
      name: string;
    }>;

    assert.strictEqual(pkgs.length, 1);
    assert.strictEqual(pkgs[0].name, 'requests');
  });

  test('handles line continuations', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'requirements.txt'),
      'requests\\\n  >=2.28\n'
    );

    const pkgs = (scanner as unknown as {
      parseRequirementsTxt: (f: string) => unknown[];
    }).parseRequirementsTxt(path.join(tmpDir, 'requirements.txt')) as Array<{
      name: string;
      specifiedVersion: string;
    }>;

    assert.strictEqual(pkgs.length, 1);
    assert.strictEqual(pkgs[0].name, 'requests');
    assert.ok(pkgs[0].specifiedVersion.includes('>=2.28'));
  });

  test('parses extras in requirements.txt', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'requirements.txt'),
      'requests[security,socks]>=2.0\n'
    );

    const pkgs = (scanner as unknown as {
      parseRequirementsTxt: (f: string) => unknown[];
    }).parseRequirementsTxt(path.join(tmpDir, 'requirements.txt')) as Array<{
      name: string;
      extras: string[];
    }>;

    assert.strictEqual(pkgs[0].name, 'requests');
    assert.deepStrictEqual(pkgs[0].extras, ['security', 'socks']);
  });

  // ── pyproject.toml ────────────────────────────────────────────────────

  test('parses PEP 621 pyproject.toml', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'pyproject.toml'),
      `[project]\nname = "myapp"\ndependencies = [\n  "requests>=2.28",\n  "flask==2.3.0",\n]\n`
    );

    const pkgs = (scanner as unknown as {
      parsePyprojectToml: (f: string) => unknown[];
    }).parsePyprojectToml(path.join(tmpDir, 'pyproject.toml')) as Array<{
      name: string;
      specifiedVersion: string;
    }>;

    assert.ok(pkgs.some(p => p.name === 'requests'));
    assert.ok(pkgs.some(p => p.name === 'flask'));
  });

  test('parses Poetry pyproject.toml', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'pyproject.toml'),
      `[tool.poetry.dependencies]\npython = "^3.11"\nrequests = "^2.28"\nflask = { version = "^2.3", extras = ["async"] }\n`
    );

    const pkgs = (scanner as unknown as {
      parsePyprojectToml: (f: string) => unknown[];
    }).parsePyprojectToml(path.join(tmpDir, 'pyproject.toml')) as Array<{
      name: string;
    }>;

    // python entry must be excluded
    assert.ok(!pkgs.some(p => p.name === 'python'));
    assert.ok(pkgs.some(p => p.name === 'requests'));
    assert.ok(pkgs.some(p => p.name === 'flask'));
  });

  // ── setup.py ──────────────────────────────────────────────────────────

  test('parses install_requires in setup.py', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'setup.py'),
      `from setuptools import setup\nsetup(\n    name="myapp",\n    install_requires=[\n        "requests>=2.0",\n        "numpy",\n    ],\n)\n`
    );

    const pkgs = (scanner as unknown as {
      parseSetupPy: (f: string) => unknown[];
    }).parseSetupPy(path.join(tmpDir, 'setup.py')) as Array<{ name: string }>;

    assert.ok(pkgs.some(p => p.name === 'requests'));
    assert.ok(pkgs.some(p => p.name === 'numpy'));
  });

  // ── normalizeName ─────────────────────────────────────────────────────

  test('normalizes package names (PEP 503)', () => {
    assert.strictEqual(scanner.normalizeName('Requests'), 'requests');
    assert.strictEqual(scanner.normalizeName('my_package'), 'my-package');
    assert.strictEqual(scanner.normalizeName('My.Package'), 'my-package');
    assert.strictEqual(scanner.normalizeName('MY--PACKAGE'), 'my-package');
  });
});
