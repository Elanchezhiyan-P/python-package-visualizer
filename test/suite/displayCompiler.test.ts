import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  buildConfidenceContext,
  buildDisplayData,
  buildEnrichedDisplayData,
  buildGraphPackages,
  buildHistoryEntries,
} from '../../src/commands/handlers/visualizer/displayCompiler.js';
import { VersionHistoryCache } from '../../src/services/versionHistoryCache.js';
import type { ScannedPackage } from '../../src/modules/packageScanner.js';
import { stubLogger } from '../helpers/stubLogger.js';

suite('displayCompiler', () => {
  let cacheDir: string;

  setup(() => {
    cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppv-display-'));
  });

  teardown(() => {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  const scanned: ScannedPackage[] = [
    {
      name: 'requests',
      specifiedVersion: '>=2.0',
      installedVersion: '2.31.0',
      source: 'requirements.txt',
      extras: [],
      requires: ['urllib3', 'certifi'],
      group: 'main',
      environment: 'main',
      hasConflict: false,
    },
    {
      name: 'numpy',
      specifiedVersion: '',
      installedVersion: '1.21.0',
      source: 'requirements.txt',
      extras: [],
      requires: [],
      group: 'main',
      environment: 'main',
      hasConflict: true,
    },
  ];

  const checkResults = [
    {
      packageName: 'requests',
      installedVersion: '2.31.0',
      latestVersion: '2.32.0',
      status: 'update-available' as const,
      allVersions: ['2.32.0', '2.31.0'],
      summary: 'HTTP library',
      homePage: 'https://requests.readthedocs.io',
      vulnerabilities: [],
      weeklyDownloads: 50_000_000,
    },
    {
      packageName: 'numpy',
      installedVersion: '1.21.0',
      latestVersion: '2.0.0',
      status: 'update-available' as const,
      allVersions: ['2.0.0', '1.21.0'],
      summary: 'Array computing',
      homePage: 'https://numpy.org',
      vulnerabilities: [],
      weeklyDownloads: 80_000_000,
    },
  ];

  test('buildDisplayData maps status and conflict blocking', () => {
    const display = buildDisplayData(scanned, checkResults);

    const requests = display.find(p => p.name === 'requests');
    const numpy = display.find(p => p.name === 'numpy');

    assert.strictEqual(requests?.status, 'update-available');
    assert.strictEqual(numpy?.status, 'conflict-blocked');
    assert.strictEqual(numpy?.updateBlockedByConflict, true);
    assert.deepStrictEqual(requests?.requires, ['urllib3', 'certifi']);
  });

  test('buildDisplayData marks ignored updates until a newer PyPI release', () => {
    const ignored = new Map<string, string>([['requests', '2.32.0']]);
    const display = buildDisplayData(scanned, checkResults, undefined, undefined, ignored);
    const requests = display.find(p => p.name === 'requests');
    assert.strictEqual(requests?.status, 'update-ignored');
    assert.strictEqual(requests?.ignoredUpdateVersion, '2.32.0');

    const newerCheck = [
      {
        ...checkResults[0],
        latestVersion: '2.33.0',
      },
      checkResults[1],
    ];
    const displayNewer = buildDisplayData(scanned, newerCheck, undefined, undefined, ignored);
    assert.strictEqual(displayNewer.find(p => p.name === 'requests')?.status, 'update-available');
  });

  test('buildDisplayData sets pinnedVersion independently of status', () => {
    const ignored = new Map<string, string>([['requests', '2.32.0']]);
    const pinned = new Map([
      ['requests', { version: '2.31.0', ignoredLatest: '2.32.0' }],
    ]);
    const display = buildDisplayData(scanned, checkResults, undefined, undefined, ignored, pinned);
    const requests = display.find(p => p.name === 'requests');
    assert.strictEqual(requests?.status, 'update-ignored');
    assert.strictEqual(requests?.pinnedVersion, '2.31.0');

    const upToDateCheck = [
      { ...checkResults[0], latestVersion: '2.31.0', status: 'up-to-date' as const },
      checkResults[1],
    ];
    const pinnedCurrent = new Map([
      ['requests', { version: '2.31.0', ignoredLatest: '2.31.0' }],
    ]);
    const displayCurrent = buildDisplayData(
      scanned,
      upToDateCheck,
      undefined,
      undefined,
      undefined,
      pinnedCurrent
    );
    const current = displayCurrent.find(p => p.name === 'requests');
    assert.strictEqual(current?.status, 'up-to-date');
    assert.strictEqual(current?.pinnedVersion, '2.31.0');
  });

  test('buildDisplayData keeps pinnedVersion after ignore expiry', () => {
    const ignored = new Map<string, string>([['requests', '2.32.0']]);
    const pinned = new Map([
      ['requests', { version: '2.31.0', ignoredLatest: '2.32.0' }],
    ]);
    const newerCheck = [
      { ...checkResults[0], latestVersion: '2.33.0' },
      checkResults[1],
    ];
    const display = buildDisplayData(scanned, newerCheck, undefined, undefined, ignored, pinned);
    const requests = display.find(p => p.name === 'requests');
    assert.strictEqual(requests?.status, 'update-available');
    assert.strictEqual(requests?.pinnedVersion, '2.31.0');
  });

  test('buildDisplayData marks unused packages from Set', () => {
    const display = buildDisplayData(scanned, checkResults, new Set(['numpy']));
    const numpy = display.find(p => p.name === 'numpy');
    assert.strictEqual(numpy?.isUsed, false);
    assert.strictEqual(display.find(p => p.name === 'requests')?.isUsed, true);
  });

  test('buildDisplayData marks unused packages from enriched Map', () => {
    const unusedMap = new Map([
      ['numpy', {
        name: 'numpy',
        confidence: 92,
        reasons: ['no-import-match'],
        verdict: 'likely_unused' as const,
      }],
    ]);

    const display = buildDisplayData(scanned, checkResults, unusedMap);
    const numpy = display.find(p => p.name === 'numpy');

    assert.strictEqual(numpy?.isUsed, false);
    assert.strictEqual(numpy?.unusedConfidence, 92);
    assert.strictEqual(numpy?.usageVerdict, 'likely_unused');
    assert.strictEqual(display.find(p => p.name === 'requests')?.isUsed, true);
  });

  test('buildConfidenceContext aggregates requires, groups, and downloads', () => {
    const ctx = buildConfidenceContext(scanned, checkResults);

    assert.deepStrictEqual(ctx.requiresMap.get('requests'), ['urllib3', 'certifi']);
    assert.strictEqual(ctx.groupMap.get('requests'), 'main');
    assert.strictEqual(ctx.downloadsMap.get('requests'), 50_000_000);
    assert.strictEqual(ctx.downloadsMap.get('numpy'), 80_000_000);
  });

  test('buildGraphPackages maps transitive packages', () => {
    const graph = buildGraphPackages([
      {
        name: 'urllib3',
        specifiedVersion: '',
        installedVersion: '2.0.0',
        source: 'pip',
        extras: [],
        requires: [],
        group: 'main',
        environment: 'main',
      },
    ]);

    assert.strictEqual(graph.length, 1);
    assert.strictEqual(graph[0].name, 'urllib3');
    assert.strictEqual(graph[0].status, 'unknown');
  });

  test('buildHistoryEntries transforms cache rows', () => {
    const entries = buildHistoryEntries([
      {
        packageName: 'requests',
        version: '2.31.0',
        installedAt: '2026-01-01T00:00:00.000Z',
        source: 'detected',
      },
    ]);

    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].packageName, 'requests');
    assert.strictEqual(entries[0].version, '2.31.0');
  });

  test('buildEnrichedDisplayData attaches previousVersion from cache', () => {
    const stubContext = {
      globalStorageUri: { fsPath: cacheDir },
    } as unknown as import('vscode').ExtensionContext;
    const history = new VersionHistoryCache(stubContext, stubLogger);
    const workspaceRoot = '/fake/workspace';

    history.recordVersion(workspaceRoot, 'requests', '2.30.0', 'detected');
    history.recordVersion(workspaceRoot, 'requests', '2.31.0', 'pip-install');

    const display = buildEnrichedDisplayData(
      scanned,
      checkResults,
      workspaceRoot,
      history
    );

    assert.strictEqual(
      display.find(p => p.name === 'requests')?.previousVersion,
      '2.30.0'
    );
  });
});
