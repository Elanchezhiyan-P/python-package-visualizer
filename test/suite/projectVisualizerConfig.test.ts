import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ignorePackageUpdate } from '../../src/services/ignoredUpdates.js';
import { pinPackage, unpinPackage, getPinnedPackages } from '../../src/services/pinnedPackages.js';
import {
  CONFIG_FILENAME,
  IGNORED_WORKSPACE_STATE_KEY,
  PINS_WORKSPACE_STATE_KEY,
  invalidateCache,
  isWriteInFlight,
  load,
  migrateFromWorkspaceState,
  resetProjectVisualizerConfigForTests,
  update,
  workspaceStateRootKey,
  WRITE_IN_FLIGHT_GRACE_MS,
} from '../../src/services/projectVisualizerConfig.js';

suite('projectVisualizerConfig', () => {
  let workspaceRoot: string;
  let warnings: string[];
  let originalWarn: typeof vscode.window.showWarningMessage;

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

  function configPath(root: string): string {
    return path.join(root, CONFIG_FILENAME);
  }

  function readConfig(root: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(configPath(root), 'utf-8')) as Record<string, unknown>;
  }

  setup(() => {
    resetProjectVisualizerConfigForTests();
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ppv-config-'));
    warnings = [];
    originalWarn = vscode.window.showWarningMessage;
    vscode.window.showWarningMessage = ((msg: string) => {
      warnings.push(msg);
      return Promise.resolve(undefined);
    }) as typeof vscode.window.showWarningMessage;
  });

  teardown(() => {
    vscode.window.showWarningMessage = originalWarn;
    resetProjectVisualizerConfigForTests();
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  test('writes schema with sorted keys and trailing newline', async () => {
    const ctx = makeContext();
    await pinPackage(ctx, workspaceRoot, 'zope', { version: '1.0.0', ignoredLatest: '1.1.0' });
    await pinPackage(ctx, workspaceRoot, 'requests', { version: '2.31.0', ignoredLatest: '2.32.0' });
    await ignorePackageUpdate(ctx, workspaceRoot, 'django', '5.1.2');

    const raw = fs.readFileSync(configPath(workspaceRoot), 'utf-8');
    assert.ok(raw.endsWith('\n'));
    const data = JSON.parse(raw) as {
      version: number;
      pins: Record<string, unknown>;
      ignoredUpdates: Record<string, unknown>;
    };
    assert.strictEqual(data.version, 1);
    assert.deepStrictEqual(Object.keys(data.pins), ['requests', 'zope']);
    assert.deepStrictEqual(Object.keys(data.ignoredUpdates), ['django']);
  });

  test('deletes the file when both maps are empty', async () => {
    const ctx = makeContext();
    await pinPackage(ctx, workspaceRoot, 'requests', { version: '2.31.0', ignoredLatest: '2.32.0' });
    await ignorePackageUpdate(ctx, workspaceRoot, 'django', '5.1.2');
    await unpinPackage(ctx, workspaceRoot, 'requests');
    assert.ok(fs.existsSync(configPath(workspaceRoot)));

    await update(ctx, workspaceRoot, data => {
      delete data.ignoredUpdates['django'];
    });
    assert.ok(!fs.existsSync(configPath(workspaceRoot)));
  });

  test('corrupt JSON warns, get* is empty, and pin refuses to overwrite', async () => {
    const ctx = makeContext();
    const filePath = configPath(workspaceRoot);
    const garbage = '{ not json';
    fs.writeFileSync(filePath, garbage, 'utf-8');

    assert.strictEqual(getPinnedPackages(ctx, workspaceRoot).size, 0);
    assert.ok(warnings.length >= 1);

    await pinPackage(ctx, workspaceRoot, 'requests', { version: '2.31.0', ignoredLatest: '2.32.0' });
    assert.strictEqual(fs.readFileSync(filePath, 'utf-8'), garbage);
    assert.strictEqual(getPinnedPackages(ctx, workspaceRoot).size, 0);
  });

  test('unsupported version is treated as malformed', async () => {
    const ctx = makeContext();
    fs.writeFileSync(
      configPath(workspaceRoot),
      `${JSON.stringify({ version: 2, pins: {}, ignoredUpdates: {} }, null, 2)}\n`,
      'utf-8'
    );
    assert.strictEqual(load(ctx, workspaceRoot).pins['requests'], undefined);
    assert.ok(warnings.length >= 1);
    await pinPackage(ctx, workspaceRoot, 'requests', { version: '2.31.0', ignoredLatest: '' });
    const raw = fs.readFileSync(configPath(workspaceRoot), 'utf-8');
    assert.ok(raw.includes('"version": 2'));
  });

  test('missing version and maps are valid; extra keys are ignored', async () => {
    const ctx = makeContext();
    fs.writeFileSync(
      configPath(workspaceRoot),
      `${JSON.stringify({ pins: { Requests: { version: '2.31.0' } }, extra: true }, null, 2)}\n`,
      'utf-8'
    );
    const data = load(ctx, workspaceRoot);
    assert.strictEqual(data.version, 1);
    assert.strictEqual(data.pins['requests']?.version, '2.31.0');
    assert.strictEqual(data.pins['requests']?.ignoredLatest, '');
    assert.deepStrictEqual(data.ignoredUpdates, {});
  });

  test('migrates both workspaceState maps into one file and clears that root', async () => {
    const ctx = makeContext();
    const key = workspaceStateRootKey(workspaceRoot);
    await ctx.workspaceState.update(PINS_WORKSPACE_STATE_KEY, {
      [key]: { requests: { version: '2.31.0', ignoredLatest: '2.32.0' } },
    });
    await ctx.workspaceState.update(IGNORED_WORKSPACE_STATE_KEY, {
      [key]: { django: '5.1.2' },
    });

    await migrateFromWorkspaceState(ctx, workspaceRoot);

    const data = readConfig(workspaceRoot);
    assert.deepStrictEqual((data.pins as Record<string, { version: string }>).requests, {
      version: '2.31.0',
      ignoredLatest: '2.32.0',
    });
    assert.strictEqual((data.ignoredUpdates as Record<string, string>).django, '5.1.2');
    assert.deepStrictEqual(ctx.workspaceState.get(PINS_WORKSPACE_STATE_KEY), {});
    assert.deepStrictEqual(ctx.workspaceState.get(IGNORED_WORKSPACE_STATE_KEY), {});
  });

  test('existing file wins over workspaceState and is not merged', async () => {
    const ctx = makeContext();
    fs.writeFileSync(
      configPath(workspaceRoot),
      `${JSON.stringify({
        version: 1,
        pins: { flask: { version: '3.0.0', ignoredLatest: '3.1.0' } },
        ignoredUpdates: {},
      }, null, 2)}\n`,
      'utf-8'
    );
    const key = workspaceStateRootKey(workspaceRoot);
    await ctx.workspaceState.update(PINS_WORKSPACE_STATE_KEY, {
      [key]: { requests: { version: '2.31.0', ignoredLatest: '2.32.0' } },
    });

    assert.strictEqual(getPinnedPackages(ctx, workspaceRoot).get('flask')?.version, '3.0.0');
    assert.strictEqual(getPinnedPackages(ctx, workspaceRoot).get('requests'), undefined);

    await migrateFromWorkspaceState(ctx, workspaceRoot);
    assert.strictEqual(getPinnedPackages(ctx, workspaceRoot).get('flask')?.version, '3.0.0');
    assert.strictEqual(getPinnedPackages(ctx, workspaceRoot).get('requests'), undefined);
    assert.deepStrictEqual(ctx.workspaceState.get(PINS_WORKSPACE_STATE_KEY), {});
  });

  test('first write seeds both maps from workspaceState', async () => {
    const ctx = makeContext();
    const key = workspaceStateRootKey(workspaceRoot);
    await ctx.workspaceState.update(PINS_WORKSPACE_STATE_KEY, {
      [key]: { flask: { version: '3.0.0', ignoredLatest: '3.1.0' } },
    });
    await ctx.workspaceState.update(IGNORED_WORKSPACE_STATE_KEY, {
      [key]: { django: '5.1.2' },
    });

    await pinPackage(ctx, workspaceRoot, 'requests', { version: '2.31.0', ignoredLatest: '2.32.0' });

    const data = readConfig(workspaceRoot);
    const pins = data.pins as Record<string, { version: string }>;
    assert.strictEqual(pins.flask.version, '3.0.0');
    assert.strictEqual(pins.requests.version, '2.31.0');
    assert.strictEqual((data.ignoredUpdates as Record<string, string>).django, '5.1.2');
  });

  test('get* returns workspaceState while the file is still absent', async () => {
    const ctx = makeContext();
    const key = workspaceStateRootKey(workspaceRoot);
    await ctx.workspaceState.update(PINS_WORKSPACE_STATE_KEY, {
      [key]: { requests: { version: '2.31.0', ignoredLatest: '2.32.0' } },
    });

    assert.strictEqual(getPinnedPackages(ctx, workspaceRoot).get('requests')?.version, '2.31.0');
    assert.ok(!fs.existsSync(configPath(workspaceRoot)));
  });

  test('per-root isolation', async () => {
    const otherRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ppv-config-b-'));
    const ctx = makeContext();
    try {
      await pinPackage(ctx, workspaceRoot, 'requests', { version: '2.31.0', ignoredLatest: '2.32.0' });
      await pinPackage(ctx, otherRoot, 'flask', { version: '3.0.0', ignoredLatest: '3.1.0' });
      assert.strictEqual(getPinnedPackages(ctx, workspaceRoot).get('flask'), undefined);
      assert.strictEqual(getPinnedPackages(ctx, otherRoot).get('requests'), undefined);
    } finally {
      fs.rmSync(otherRoot, { recursive: true, force: true });
    }
  });

  test('parallel pin and ignore both persist', async () => {
    const ctx = makeContext();
    await Promise.all([
      pinPackage(ctx, workspaceRoot, 'requests', { version: '2.31.0', ignoredLatest: '2.32.0' }),
      ignorePackageUpdate(ctx, workspaceRoot, 'django', '5.1.2'),
    ]);
    const data = readConfig(workspaceRoot);
    assert.strictEqual((data.pins as Record<string, { version: string }>).requests.version, '2.31.0');
    assert.strictEqual((data.ignoredUpdates as Record<string, string>).django, '5.1.2');
  });

  test('clearing a pin leaves a standalone ignore in the file', async () => {
    const ctx = makeContext();
    await pinPackage(ctx, workspaceRoot, 'requests', { version: '2.31.0', ignoredLatest: '2.32.0' });
    await ignorePackageUpdate(ctx, workspaceRoot, 'requests', '2.32.0');
    await unpinPackage(ctx, workspaceRoot, 'requests');

    const data = readConfig(workspaceRoot);
    assert.deepStrictEqual(data.pins, {});
    assert.strictEqual((data.ignoredUpdates as Record<string, string>).requests, '2.32.0');
  });

  test('isWriteInFlight stays true through the grace period after a write', async () => {
    const ctx = makeContext();
    const pending = pinPackage(ctx, workspaceRoot, 'requests', {
      version: '2.31.0',
      ignoredLatest: '2.32.0',
    });
    await pending;
    assert.ok(isWriteInFlight(workspaceRoot));
    await new Promise(resolve => setTimeout(resolve, WRITE_IN_FLIGHT_GRACE_MS + 50));
    assert.strictEqual(isWriteInFlight(workspaceRoot), false);
  });

  test('invalidateCache reloads after an external file edit', async () => {
    const ctx = makeContext();
    await pinPackage(ctx, workspaceRoot, 'requests', { version: '2.31.0', ignoredLatest: '2.32.0' });
    fs.writeFileSync(
      configPath(workspaceRoot),
      `${JSON.stringify({
        version: 1,
        pins: { flask: { version: '3.0.0', ignoredLatest: '3.1.0' } },
        ignoredUpdates: {},
      }, null, 2)}\n`,
      'utf-8'
    );
    assert.strictEqual(getPinnedPackages(ctx, workspaceRoot).get('requests')?.version, '2.31.0');
    invalidateCache(workspaceRoot);
    assert.strictEqual(getPinnedPackages(ctx, workspaceRoot).get('flask')?.version, '3.0.0');
    assert.strictEqual(getPinnedPackages(ctx, workspaceRoot).get('requests'), undefined);
  });
});
