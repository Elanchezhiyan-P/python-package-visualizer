import * as assert from 'assert';
import { VersionChecker } from '../../src/services/versionChecker.js';
import { stubLogger } from '../helpers/stubLogger.js';
import { stubContext } from '../helpers/stubContext.js';

suite('VersionChecker', () => {
  let checker: VersionChecker;
  let originalFetch: typeof fetch;

  setup(() => {
    checker = new VersionChecker(stubLogger, stubContext);
    checker.clearCache();
    originalFetch = globalThis.fetch;
  });

  teardown(() => {
    globalThis.fetch = originalFetch;
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
    assert.strictEqual(checker.compareVersions('1.2.3', '1.2.3'), 0);
  });

  test('computeStatus: detects update-available and not-installed', () => {
    const computeStatus = (checker as unknown as {
      computeStatus: (installed: string, latest: string) => string;
    }).computeStatus.bind(checker);

    assert.strictEqual(computeStatus('', '2.0.0'), 'not-installed');
    assert.strictEqual(computeStatus('2.0.0', '2.0.0'), 'up-to-date');
    assert.strictEqual(computeStatus('1.0.0', '2.0.0'), 'update-available');
    assert.strictEqual(computeStatus('2.1.0', '2.0.0'), 'up-to-date');
  });

  test('checkPythonCompatibility validates requirement constraints', () => {
    const checkPythonCompatibility = (checker as unknown as {
      checkPythonCompatibility: (requires: string, current: string) => boolean;
    }).checkPythonCompatibility;

    assert.strictEqual(checkPythonCompatibility('>=3.8', '3.11'), true);
    assert.strictEqual(checkPythonCompatibility('>=3.12', '3.11'), false);
    assert.strictEqual(checkPythonCompatibility('>=3.8,<4.0', '3.11'), true);
    assert.strictEqual(checkPythonCompatibility('>=3.8,<3.11', '3.11'), false);
    assert.strictEqual(checkPythonCompatibility('!=3.11', '3.11'), false);
  });

  test('checkPackage maps PyPI json to update-available status', async () => {
    globalThis.fetch = async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/pypi/requests/json')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            info: {
              name: 'requests',
              version: '2.32.0',
              summary: 'HTTP for Humans',
              home_page: 'https://requests.readthedocs.io',
              requires_python: '>=3.8',
              license: 'Apache-2.0',
            },
            releases: {
              '2.32.0': [{ yanked: false, upload_time: '2024-06-01T00:00:00Z', size: 1200 }],
              '2.31.0': [{ yanked: false, upload_time: '2024-01-01T00:00:00Z', size: 1100 }],
              '2.30.0': [{ yanked: true, upload_time: '2023-01-01T00:00:00Z', size: 1000 }],
            },
          }),
        } as Response;
      }
      if (url.includes('/requests/2.31.0/json')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ vulnerabilities: [] }),
        } as Response;
      }
      return originalFetch(input);
    };

    const result = await checker.checkPackage('requests', '2.31.0');

    assert.strictEqual(result.status, 'update-available');
    assert.strictEqual(result.latestVersion, '2.32.0');
    assert.strictEqual(result.summary, 'HTTP for Humans');
    assert.strictEqual(result.homePage, 'https://requests.readthedocs.io');
    assert.strictEqual(result.pythonRequires, '>=3.8');
    assert.ok(result.allVersions.includes('2.32.0'));
    assert.ok(!result.allVersions.includes('2.30.0'));
    assert.strictEqual(result.releaseDate, '2024-06-01');
    assert.strictEqual(result.installSize, 1200);
  });
});
