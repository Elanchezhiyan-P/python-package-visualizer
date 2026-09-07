import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parsePipfile } from '../../src/modules/parsers/pipfileParser.js';

suite('parsePipfile', () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppv-pipfile-'));
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('parses [packages] and [dev-packages] sections', () => {
    const pipfile = path.join(tmpDir, 'Pipfile');
    fs.writeFileSync(
      pipfile,
      `[packages]
requests = "*"
flask = {version = ">=2.0", extras = ["async"]}

[dev-packages]
pytest = "*"
python_version = "3.11"
`
    );

    const pkgs = parsePipfile(pipfile);

    assert.strictEqual(pkgs.length, 3);

    const requests = pkgs.find(p => p.name === 'requests');
    assert.ok(requests);
    assert.strictEqual(requests.group, 'main');
    assert.strictEqual(requests.environment, 'main');

    const flask = pkgs.find(p => p.name === 'flask');
    assert.ok(flask);
    assert.strictEqual(flask.specifiedVersion, '>=2.0');
    assert.deepStrictEqual(flask.extras, ['async']);

    const pytest = pkgs.find(p => p.name === 'pytest');
    assert.ok(pytest);
    assert.strictEqual(pytest.group, 'dev');
    assert.strictEqual(pytest.environment, 'dev');
  });

  test('returns empty array for missing file', () => {
    assert.deepStrictEqual(parsePipfile(path.join(tmpDir, 'missing')), []);
  });

  test('returns empty array and logs on invalid TOML', () => {
    const pipfile = path.join(tmpDir, 'Pipfile');
    fs.writeFileSync(pipfile, '[packages\nbroken = "');

    const warnings: string[] = [];
    const pkgs = parsePipfile(pipfile, { warn: msg => warnings.push(msg) });

    assert.deepStrictEqual(pkgs, []);
    assert.strictEqual(warnings.length, 1);
  });
});
