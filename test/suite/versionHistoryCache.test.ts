import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { VersionHistoryCache } from '../../src/services/versionHistoryCache.js';

const stubLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  show: () => {},
} as unknown as import('../../src/utils/logger.js').Logger;

suite('VersionHistoryCache', () => {
  let tmpDir: string;
  let cache: VersionHistoryCache;
  const workspaceRoot = '/fake/workspace';

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppv-cache-test-'));
    const stubContext = {
      globalStorageUri: { fsPath: tmpDir },
    } as unknown as import('vscode').ExtensionContext;
    cache = new VersionHistoryCache(stubContext, stubLogger);
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('records a version entry', () => {
    cache.recordVersion(workspaceRoot, 'requests', '2.28.0', 'detected');
    const history = cache.getHistory(workspaceRoot, 'requests');
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].version, '2.28.0');
    assert.strictEqual(history[0].source, 'detected');
  });

  test('does not duplicate consecutive identical versions', () => {
    cache.recordVersion(workspaceRoot, 'requests', '2.28.0', 'detected');
    cache.recordVersion(workspaceRoot, 'requests', '2.28.0', 'detected');
    const history = cache.getHistory(workspaceRoot, 'requests');
    assert.strictEqual(history.length, 1);
  });

  test('returns previous version for rollback', () => {
    cache.recordVersion(workspaceRoot, 'requests', '2.27.0', 'detected');
    cache.recordVersion(workspaceRoot, 'requests', '2.28.0', 'pip-install');
    const prev = cache.getPreviousVersion(workspaceRoot, 'requests');
    assert.strictEqual(prev, '2.27.0');
  });

  test('returns null when no previous version exists', () => {
    cache.recordVersion(workspaceRoot, 'requests', '2.28.0', 'detected');
    assert.strictEqual(cache.getPreviousVersion(workspaceRoot, 'requests'), null);
  });

  test('normalizes package names', () => {
    cache.recordVersion(workspaceRoot, 'My_Package', '1.0.0', 'detected');
    const history = cache.getHistory(workspaceRoot, 'my-package');
    assert.strictEqual(history.length, 1);
  });

  test('persists to disk and survives re-instantiation', () => {
    cache.recordVersion(workspaceRoot, 'flask', '3.0.0', 'pip-install');

    // Create a new instance pointing to same storage dir
    const stubContext2 = {
      globalStorageUri: { fsPath: tmpDir },
    } as unknown as import('vscode').ExtensionContext;
    const cache2 = new VersionHistoryCache(stubContext2, stubLogger);

    const history = cache2.getHistory(workspaceRoot, 'flask');
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].version, '3.0.0');
  });

  test('clearHistory removes all entries', () => {
    cache.recordVersion(workspaceRoot, 'requests', '2.28.0', 'detected');
    cache.clearHistory(workspaceRoot);
    assert.deepStrictEqual(cache.getAllHistory(workspaceRoot), {});
  });
});
