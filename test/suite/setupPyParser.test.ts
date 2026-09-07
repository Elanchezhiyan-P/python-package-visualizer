import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseSetupPy } from '../../src/modules/parsers/setupPyParser.js';

suite('parseSetupPy', () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppv-setuppy-'));
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('parses install_requires list', () => {
    const filePath = path.join(tmpDir, 'setup.py');
    fs.writeFileSync(
      filePath,
      `from setuptools import setup\nsetup(\n    name="myapp",\n    install_requires=[\n        "requests>=2.0",\n        "numpy",\n    ],\n)\n`
    );

    const pkgs = parseSetupPy(filePath);

    assert.strictEqual(pkgs.length, 2);
    assert.ok(pkgs.some(p => p.name === 'requests' && p.specifiedVersion === '>=2.0'));
    assert.ok(pkgs.some(p => p.name === 'numpy'));
    assert.strictEqual(pkgs[0].source, 'setup.py');
  });

  test('parses extras_require sections with group mapping', () => {
    const filePath = path.join(tmpDir, 'setup.py');
    fs.writeFileSync(
      filePath,
      `from setuptools import setup\nsetup(\n    install_requires=["requests"],\n    extras_require={\n        "test": ["pytest>=7"],\n        "dev": ["ruff"],\n    },\n)\n`
    );

    const pkgs = parseSetupPy(filePath);
    const pytest = pkgs.find(p => p.name === 'pytest');
    const ruff = pkgs.find(p => p.name === 'ruff');

    assert.ok(pytest);
    assert.ok(ruff);
    assert.strictEqual(pytest!.group, 'test');
    assert.strictEqual(ruff!.group, 'dev');
    assert.strictEqual(pytest!.specifiedVersion, '>=7');
  });

  test('returns empty array for missing file', () => {
    assert.deepStrictEqual(parseSetupPy(path.join(tmpDir, 'missing.py')), []);
  });
});
