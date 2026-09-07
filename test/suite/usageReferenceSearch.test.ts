import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { UsageReferenceSearch } from '../../src/modules/import/usageReferenceSearch.js';

suite('UsageReferenceSearch', () => {
  let tmpDir: string;
  const search = new UsageReferenceSearch();

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppv-usageref-'));
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('finds package references in config files', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'docker-compose.yml'),
      'services:\n  app:\n    image: python:3.11\n    command: pytest --maxfail=1\n'
    );
    fs.writeFileSync(
      path.join(tmpDir, 'README.md'),
      'Install with `pip install black` for formatting.\n'
    );

    const hits = search.search(tmpDir, ['pytest', 'black']);

    assert.ok(hits.has('pytest'));
    assert.ok(hits.has('black'));
    assert.ok(hits.get('pytest')!.some(h => h.file === 'docker-compose.yml'));
    assert.ok(hits.get('black')!.some(h => h.file === 'README.md'));
  });

  test('ignores dependency declaration files', () => {
    fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'unused-pkg>=1.0\n');
    fs.writeFileSync(
      path.join(tmpDir, 'pyproject.toml'),
      '[project]\nname = "demo"\ndependencies = ["unused-pkg"]\n'
    );

    const hits = search.search(tmpDir, ['unused-pkg']);
    assert.strictEqual(hits.size, 0);
  });

  test('skips virtualenv and cache directories', () => {
    const venvDir = path.join(tmpDir, '.venv', 'lib');
    fs.mkdirSync(venvDir, { recursive: true });
    fs.writeFileSync(path.join(venvDir, 'note.txt'), 'pytest should be ignored\n');

    const hits = search.search(tmpDir, ['pytest']);
    assert.strictEqual(hits.size, 0);
  });

  test('returns empty map for short pattern terms only', () => {
    fs.writeFileSync(path.join(tmpDir, 'app.py'), 'import os\n');
    const hits = search.search(tmpDir, ['ab']);
    assert.strictEqual(hits.size, 0);
  });
});
