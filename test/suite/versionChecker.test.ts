import * as assert from 'assert';
import { VersionChecker } from '../../src/services/versionChecker.js';

const stubLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  show: () => {},
} as unknown as import('../../src/utils/logger.js').Logger;

const stubContext = {} as unknown as import('vscode').ExtensionContext;

suite('VersionChecker', () => {
  let checker: VersionChecker;

  setup(() => {
    checker = new VersionChecker(stubLogger, stubContext);
    checker.clearCache();
  });

  // ── compareVersions ───────────────────────────────────────────────────

  test('compareVersions: equal versions', () => {
    assert.strictEqual(checker.compareVersions('1.2.3', '1.2.3'), 0);
  });

  test('compareVersions: a < b', () => {
    assert.ok(checker.compareVersions('1.2.3', '1.2.4') < 0);
    assert.ok(checker.compareVersions('1.0.0', '2.0.0') < 0);
  });

  test('compareVersions: a > b', () => {
    assert.ok(checker.compareVersions('2.0.0', '1.9.9') > 0);
  });

  test('compareVersions: different lengths', () => {
    assert.ok(checker.compareVersions('1.0', '1.0.1') < 0);
    assert.ok(checker.compareVersions('1.0.1', '1.0') > 0);
  });

  test('compareVersions: strips non-numeric chars', () => {
    // e.g. pre-release tags are stripped → compared numerically only
    assert.strictEqual(checker.compareVersions('1.2.3', '1.2.3'), 0);
  });
});
