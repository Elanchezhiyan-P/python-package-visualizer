import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  discoverDepFiles,
  pruneRedundantIncludedRequirements,
  requirementsFileIncludes,
} from '../../src/modules/depFileDiscovery.js';
import { parseRequirementsTxt } from '../../src/modules/parsers/requirementsParser.js';

suite('DepFileDiscovery', () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppv-dep-'));
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('discovers requirements.txt in backend subfolder', () => {
    const backendDir = path.join(tmpDir, 'backend');
    fs.mkdirSync(backendDir, { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'frontend'));
    fs.writeFileSync(path.join(backendDir, 'requirements.txt'), 'django>=4.0\n');

    const files = discoverDepFiles(tmpDir);
    assert.ok(files.some(f => f.replace(/\\/g, '/').endsWith('backend/requirements.txt')));
  });

  test('discovers pyproject.toml in nested service folder', () => {
    const svcDir = path.join(tmpDir, 'services', 'api');
    fs.mkdirSync(svcDir, { recursive: true });
    fs.writeFileSync(
      path.join(svcDir, 'pyproject.toml'),
      '[project]\nname = "api"\ndependencies = ["fastapi"]\n'
    );

    const files = discoverDepFiles(tmpDir);
    assert.ok(files.some(f => f.replace(/\\/g, '/').endsWith('services/api/pyproject.toml')));
  });

  test('prunes base requirements when dev file includes it', () => {
    const backendDir = path.join(tmpDir, 'backend');
    fs.mkdirSync(backendDir, { recursive: true });
    const base = path.join(backendDir, 'requirements.txt');
    const dev = path.join(backendDir, 'requirements-dev.txt');
    fs.writeFileSync(base, 'django>=4.0\n');
    fs.writeFileSync(dev, '-r requirements.txt\npytest\n');

    const files = discoverDepFiles(tmpDir);
    const relPaths = files.map(f => path.relative(tmpDir, f).replace(/\\/g, '/'));

    assert.ok(relPaths.includes('backend/requirements-dev.txt'));
    assert.ok(!relPaths.includes('backend/requirements.txt'));
  });

  test('requirementsFileIncludes resolves relative -r paths', () => {
    const dir = path.join(tmpDir, 'backend');
    fs.mkdirSync(dir, { recursive: true });
    const base = path.join(dir, 'requirements.txt');
    const dev = path.join(dir, 'requirements-dev.txt');
    fs.writeFileSync(base, 'requests\n');
    fs.writeFileSync(dev, '-r ./requirements.txt\nblack\n');

    assert.strictEqual(requirementsFileIncludes(dev, base), true);
    assert.strictEqual(pruneRedundantIncludedRequirements([base, dev]).length, 1);
  });

  test('parseRequirementsTxt merges included base packages with relative sources', () => {
    const backendDir = path.join(tmpDir, 'backend');
    fs.mkdirSync(backendDir, { recursive: true });
    fs.writeFileSync(path.join(backendDir, 'requirements.txt'), 'django>=4.0\n');
    fs.writeFileSync(
      path.join(backendDir, 'requirements-dev.txt'),
      '-r requirements.txt\npytest\n'
    );

    const pkgs = parseRequirementsTxt(
      path.join(backendDir, 'requirements-dev.txt'),
      'dev',
      new Set(),
      tmpDir
    );

    const django = pkgs.find(p => p.name === 'django');
    const pytest = pkgs.find(p => p.name === 'pytest');

    assert.ok(django);
    assert.strictEqual(django.source, 'backend/requirements.txt');
    assert.strictEqual(django.group, 'main');
    assert.ok(pytest);
    assert.strictEqual(pytest.source, 'backend/requirements-dev.txt');
    assert.strictEqual(pytest.group, 'dev');
  });
});
