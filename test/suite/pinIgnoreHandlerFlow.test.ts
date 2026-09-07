/**
 * End-to-end Pin/Ignore persistence as the handlers actually call it:
 * persistPin = ignore then pin; unpin = unignore then unpin; Update = unpin pin only.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  getIgnoredUpdateVersion,
  getIgnoredUpdates,
  ignorePackageUpdate,
  unignorePackageUpdate,
} from '../../src/services/ignoredUpdates.js';
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
import { buildDisplayData } from '../../src/commands/handlers/visualizer/displayCompiler.js';
import type { ScannedPackage } from '../../src/modules/packageScanner.js';

suite('pinIgnoreHandlerFlow', () => {
  let workspaceRoot: string;

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

  async function persistPin(
    ctx: vscode.ExtensionContext,
    name: string,
    version: string,
    ignoredLatest: string
  ): Promise<void> {
    await ignorePackageUpdate(ctx, workspaceRoot, name, ignoredLatest);
    await pinPackage(ctx, workspaceRoot, name, { version, ignoredLatest });
  }

  async function persistUnpin(ctx: vscode.ExtensionContext, name: string): Promise<void> {
    await unignorePackageUpdate(ctx, workspaceRoot, name);
    await unpinPackage(ctx, workspaceRoot, name);
  }

  const scanned: ScannedPackage[] = [
    {
      name: 'Requests',
      specifiedVersion: '==2.31.0',
      installedVersion: '2.31.0',
      source: 'requirements.txt',
      extras: [],
      requires: [],
      group: 'main',
      environment: 'main',
      hasConflict: false,
    },
  ];
  const checkResults = [
    {
      packageName: 'Requests',
      installedVersion: '2.31.0',
      latestVersion: '2.32.0',
      status: 'update-available' as const,
      allVersions: ['2.32.0', '2.31.0'],
      summary: '',
      homePage: '',
      vulnerabilities: [],
    },
  ];

  setup(() => {
    resetProjectVisualizerConfigForTests();
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ppv-flow-'));
  });

  teardown(() => {
    resetProjectVisualizerConfigForTests();
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  test('persistPin writes both maps; UI shows Pinned + update-ignored; CodeLens hold applies', async () => {
    const ctx = makeContext();
    await persistPin(ctx, 'Requests', '2.31.0', '2.32.0');

    const file = JSON.parse(
      fs.readFileSync(path.join(workspaceRoot, CONFIG_FILENAME), 'utf-8')
    ) as { pins: Record<string, { version: string }>; ignoredUpdates: Record<string, string> };
    assert.strictEqual(file.pins.requests.version, '2.31.0');
    assert.strictEqual(file.ignoredUpdates.requests, '2.32.0');

    const display = buildDisplayData(
      scanned,
      checkResults,
      undefined,
      undefined,
      getIgnoredUpdates(ctx, workspaceRoot),
      getPinnedPackages(ctx, workspaceRoot)
    );
    const row = display.find(p => p.name === 'Requests');
    assert.strictEqual(row?.status, 'update-ignored');
    assert.strictEqual(row?.pinnedVersion, '2.31.0');
    assert.strictEqual(getIgnoredUpdateVersion(ctx, workspaceRoot, 'Requests'), '2.32.0');
  });

  test('clearPinMetadata after Update drops the tag but keeps standalone Ignore', async () => {
    const ctx = makeContext();
    await persistPin(ctx, 'Requests', '2.31.0', '2.32.0');
    assert.ok(getPinnedVersion(ctx, workspaceRoot, 'Requests'));
    await unpinPackage(ctx, workspaceRoot, 'Requests');

    assert.strictEqual(getPinnedVersion(ctx, workspaceRoot, 'Requests'), undefined);
    assert.strictEqual(getIgnoredUpdates(ctx, workspaceRoot).get('requests'), '2.32.0');

    const display = buildDisplayData(
      scanned,
      checkResults,
      undefined,
      undefined,
      getIgnoredUpdates(ctx, workspaceRoot),
      getPinnedPackages(ctx, workspaceRoot)
    );
    const row = display.find(p => p.name === 'Requests');
    assert.strictEqual(row?.status, 'update-ignored');
    assert.strictEqual(row?.pinnedVersion, undefined);
  });

  test('unpin clears tag and hold; another machine with only the file sees the same state', async () => {
    const ctx = makeContext();
    await persistPin(ctx, 'Requests', '2.31.0', '2.32.0');
    await persistUnpin(ctx, 'Requests');
    assert.ok(!fs.existsSync(path.join(workspaceRoot, CONFIG_FILENAME)));

    await persistPin(ctx, 'Requests', '2.31.0', '2.32.0');
    resetProjectVisualizerConfigForTests();
    const otherPc = makeContext();
    assert.strictEqual(getPinnedVersion(otherPc, workspaceRoot, 'requests'), '2.31.0');
    assert.strictEqual(getIgnoredUpdateVersion(otherPc, workspaceRoot, 'Requests'), '2.32.0');
  });
});
