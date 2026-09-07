import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { detectVenvType, findDuplicates, normalizePackageName } from '../../src/services/venvLayout.js';

suite('venvLayout', () => {
  test('normalizePackageName collapses PEP 503 delimiters', () => {
    assert.strictEqual(normalizePackageName('My_Package.Name'), 'my-package-name');
  });

  test('findDuplicates groups mixed delimiter names', () => {
    const dups = findDuplicates([
      { name: 'Foo', version: '1.0' },
      { name: 'foo', version: '2.0' },
      { name: 'bar', version: '1.0' },
    ]);
    assert.strictEqual(dups.length, 1);
    assert.strictEqual(dups[0].name, 'foo');
    assert.deepStrictEqual(dups[0].versions, ['Foo==1.0', 'foo==2.0']);
  });

  test('findDuplicates returns empty when versions are unique', () => {
    assert.deepStrictEqual(
      findDuplicates([{ name: 'a', version: '1' }, { name: 'b', version: '1' }]),
      []
    );
  });

  test('detectVenvType reports system when prefixes match and no venv dir', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ppv-venv-'));
    try {
      const info = detectVenvType(tmp, '/usr', '/usr');
      assert.strictEqual(info.type, 'system');
      assert.strictEqual(info.isActive, false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('detectVenvType finds a standard venv with pyvenv.cfg', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ppv-venv-'));
    try {
      const venvPath = path.join(tmp, '.venv');
      fs.mkdirSync(venvPath);
      fs.writeFileSync(path.join(venvPath, 'pyvenv.cfg'), 'home = x\n');
      const info = detectVenvType(tmp, venvPath, '/usr');
      assert.strictEqual(info.type, 'venv');
      assert.strictEqual(info.path, venvPath);
      assert.strictEqual(info.isActive, true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('detectVenvType finds virtualenv via Lib/lib without pyvenv.cfg', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ppv-venv-'));
    try {
      const venvPath = path.join(tmp, 'venv');
      fs.mkdirSync(venvPath);
      const libPath = process.platform === 'win32'
        ? path.join(venvPath, 'Lib')
        : path.join(venvPath, 'lib');
      fs.mkdirSync(libPath);
      const info = detectVenvType(tmp, '/usr', '/usr');
      assert.strictEqual(info.type, 'virtualenv');
      assert.strictEqual(info.path, venvPath);
      assert.strictEqual(info.isActive, false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('detectVenvType reports active venv from prefixes when no dir exists', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ppv-venv-'));
    try {
      const info = detectVenvType(tmp, '/prefix', '/base');
      assert.strictEqual(info.type, 'venv');
      assert.strictEqual(info.path, '/prefix');
      assert.strictEqual(info.isActive, true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('detectVenvType reports conda when CONDA_PREFIX is set', () => {
    const prevDefault = process.env['CONDA_DEFAULT_ENV'];
    const prevPrefix = process.env['CONDA_PREFIX'];
    process.env['CONDA_PREFIX'] = 'C:\\conda\\envs\\x';
    delete process.env['CONDA_DEFAULT_ENV'];
    try {
      const info = detectVenvType('/unused', '/usr', '/usr');
      assert.strictEqual(info.type, 'conda');
      assert.strictEqual(info.path, 'C:\\conda\\envs\\x');
      assert.strictEqual(info.isActive, true);
    } finally {
      if (prevDefault === undefined) {
        delete process.env['CONDA_DEFAULT_ENV'];
      } else {
        process.env['CONDA_DEFAULT_ENV'] = prevDefault;
      }
      if (prevPrefix === undefined) {
        delete process.env['CONDA_PREFIX'];
      } else {
        process.env['CONDA_PREFIX'] = prevPrefix;
      }
    }
  });
});
