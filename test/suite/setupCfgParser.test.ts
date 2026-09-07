import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseSetupCfg } from '../../src/modules/parsers/setupCfgParser.js';

suite('parseSetupCfg', () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppv-setupcfg-'));
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('parses install_requires and extras_require', () => {
    const cfgPath = path.join(tmpDir, 'setup.cfg');
    fs.writeFileSync(
      cfgPath,
      `[options]
install_requires =
    requests>=2.0
    numpy

[options.extras_require]
dev =
    pytest
    black
test =
    coverage
`
    );

    const pkgs = parseSetupCfg(cfgPath);

    assert.ok(pkgs.some(p => p.name === 'requests' && p.group === 'main'));
    assert.ok(pkgs.some(p => p.name === 'numpy' && p.group === 'main'));
    assert.ok(pkgs.some(p => p.name === 'pytest' && p.group === 'dev'));
    assert.ok(pkgs.some(p => p.name === 'black' && p.group === 'dev'));
    assert.ok(pkgs.some(p => p.name === 'coverage' && p.group === 'test'));
  });

  test('parses extras in dependency specifiers', () => {
    const cfgPath = path.join(tmpDir, 'setup.cfg');
    fs.writeFileSync(
      cfgPath,
      `[options]
install_requires =
    requests[security,socks]>=2.0
`
    );

    const pkgs = parseSetupCfg(cfgPath);
    assert.strictEqual(pkgs.length, 1);
    assert.strictEqual(pkgs[0].name, 'requests');
    assert.deepStrictEqual(pkgs[0].extras, ['security', 'socks']);
    assert.strictEqual(pkgs[0].specifiedVersion, '>=2.0');
  });

  test('returns empty array for missing file', () => {
    assert.deepStrictEqual(parseSetupCfg(path.join(tmpDir, 'missing.cfg')), []);
  });
});
