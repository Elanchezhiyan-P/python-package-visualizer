import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  getPinnedPackages,
  getPinnedVersion,
  pinPackage,
  unpinPackage,
} from '../../src/services/pinnedPackages.js';
import {
  CONFIG_FILENAME,
  resetProjectVisualizerConfigForTests,
} from '../../src/services/projectVisualizerConfig.js';

suite('pinnedPackages', () => {
  let workspaceRoot: string;
  let otherRoot: string;

  function makeContext(): vscode.ExtensionContext {
    return {
      workspaceState: {
        _data: {} as Record<string, unknown>,
        get<T>(key: string): T | undefined {
          return this._data[key] as T | undefined;
        },
        async update(key: string, value: unknown): Promise<void> {
          this._data[key] = value;
        },
      },
    } as unknown as vscode.ExtensionContext;
  }

  setup(() => {
    resetProjectVisualizerConfigForTests();
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ppv-pins-a-'));
    otherRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ppv-pins-b-'));
  });

  teardown(() => {
    resetProjectVisualizerConfigForTests();
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(otherRoot, { recursive: true, force: true });
  });

  test('pin and unpin persist per workspace with PEP 503 names', async () => {
    const ctx = makeContext();
    await pinPackage(ctx, workspaceRoot, 'Requests', { version: '2.31.0', ignoredLatest: '2.32.0' });

    assert.strictEqual(getPinnedVersion(ctx, workspaceRoot, 'requests'), '2.31.0');
    assert.strictEqual(getPinnedPackages(ctx, workspaceRoot).get('requests')?.ignoredLatest, '2.32.0');
    assert.strictEqual(getPinnedVersion(ctx, otherRoot, 'requests'), undefined);
    assert.ok(fs.existsSync(path.join(workspaceRoot, CONFIG_FILENAME)));
    assert.ok(!fs.existsSync(path.join(otherRoot, CONFIG_FILENAME)));

    await unpinPackage(ctx, workspaceRoot, 'requests');
    assert.strictEqual(getPinnedVersion(ctx, workspaceRoot, 'requests'), undefined);
    assert.ok(!fs.existsSync(path.join(workspaceRoot, CONFIG_FILENAME)));
  });

  test('pin overwrites previous entry for the same package', async () => {
    const ctx = makeContext();
    await pinPackage(ctx, workspaceRoot, 'flask', { version: '2.0.0', ignoredLatest: '3.0.0' });
    await pinPackage(ctx, workspaceRoot, 'Flask', { version: '2.3.0', ignoredLatest: '3.1.0' });

    const entry = getPinnedPackages(ctx, workspaceRoot).get('flask');
    assert.strictEqual(entry?.version, '2.3.0');
    assert.strictEqual(entry?.ignoredLatest, '3.1.0');
  });

  test('PEP 503 treats underscores and dots as the same package', async () => {
    const ctx = makeContext();
    await pinPackage(ctx, workspaceRoot, 'Foo_Bar', { version: '1.0.0', ignoredLatest: '1.1.0' });
    assert.strictEqual(getPinnedVersion(ctx, workspaceRoot, 'foo-bar'), '1.0.0');
    assert.strictEqual(getPinnedVersion(ctx, workspaceRoot, 'foo.bar'), '1.0.0');
  });

  test('unpin of missing package is a no-op', async () => {
    const ctx = makeContext();
    await unpinPackage(ctx, workspaceRoot, 'numpy');
    assert.strictEqual(getPinnedPackages(ctx, workspaceRoot).size, 0);
    assert.ok(!fs.existsSync(path.join(workspaceRoot, CONFIG_FILENAME)));
  });

  test('empty version does not create a config file', async () => {
    const ctx = makeContext();
    await pinPackage(ctx, workspaceRoot, 'requests', { version: '', ignoredLatest: '2.32.0' });
    assert.strictEqual(getPinnedPackages(ctx, workspaceRoot).size, 0);
    assert.ok(!fs.existsSync(path.join(workspaceRoot, CONFIG_FILENAME)));
  });
});
