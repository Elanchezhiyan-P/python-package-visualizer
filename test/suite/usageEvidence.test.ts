import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { detectDjangoSettingsUsage } from '../../src/modules/usageEvidence/djangoSettingsDetector.js';
import { detectPytestConfigUsage } from '../../src/modules/usageEvidence/pytestConfigDetector.js';
import { applyOrphanChainAnalysis } from '../../src/modules/usageEvidence/orphanChainAnalyzer.js';
import { UsageEvidenceEngine } from '../../src/modules/usageEvidence/engine.js';
import { detectScriptsEntryUsage } from '../../src/modules/usageEvidence/scriptsEntryDetector.js';
import { referenceHitsToEvidence } from '../../src/modules/usageEvidence/pypiTopLevelCache.js';
import { isPackageUsed } from '../../src/modules/import/packageMatcher.js';
import { UnusedConfidenceAnalyzer } from '../../src/modules/import/confidence.js';

suite('usageEvidence', () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppv-evidence-'));
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('django-cors-headers detected via INSTALLED_APPS', () => {
    const settingsDir = path.join(tmpDir, 'backend', 'backend');
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, 'settings.py'),
      `
INSTALLED_APPS = [
    'django.contrib.admin',
    'corsheaders',
    'rest',
]
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
]
`
    );

    const evidence = detectDjangoSettingsUsage(tmpDir);
    assert.ok(evidence.has('django-cors-headers'));
    assert.ok(evidence.get('django-cors-headers')!.some(e => e.strength === 'strong'));
  });

  test('pytest-django detected via pyproject DJANGO_SETTINGS_MODULE', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'pyproject.toml'),
      `
[tool.pytest.ini_options]
DJANGO_SETTINGS_MODULE = "backend.settings"
`
    );

    const evidence = detectPytestConfigUsage(tmpDir);
    assert.ok(evidence.has('pytest-django'));
  });

  test('phonenumberslite resolves via phonenumbers import', () => {
    const imports = new Set(['phonenumbers']);
    assert.ok(isPackageUsed('phonenumberslite', imports));
  });

  test('orphan chain marks social-auth when djoser is likely unused', () => {
    const unused = new Map([
      ['djoser', {
        name: 'djoser',
        confidence: 95,
        reasons: [] as string[],
        verdict: 'likely_unused' as const,
      }],
    ]);

    applyOrphanChainAnalysis(unused, [
      'djoser',
      'social-auth-app-django',
      'social-auth-core',
      'requests',
    ]);

    assert.ok(unused.has('social-auth-app-django'));
    const chainInfo = unused.get('social-auth-app-django')!;
    assert.ok(chainInfo.reasons.some((r: string) => r.startsWith('orphan-chain:')));
  });

  test('django-guardian is uncertain when only weak settings evidence', () => {
    const settingsDir = path.join(tmpDir, 'project');
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, 'settings.py'),
      `INSTALLED_APPS = ['guardian']`
    );

    const evidence = detectDjangoSettingsUsage(tmpDir);
    const analyzer = new UnusedConfidenceAnalyzer();
    const result = analyzer.analyze(
      ['django-guardian', 'requests'],
      new Set(['requests']),
      undefined,
      evidence
    );

    const guardian = result.get('django-guardian');
    assert.ok(guardian);
    assert.strictEqual(guardian.verdict, 'uncertain');
  });

  test('UsageEvidenceEngine excludes packages with strong config evidence', () => {
    const settingsDir = path.join(tmpDir, 'app');
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(
      path.join(settingsDir, 'settings.py'),
      `INSTALLED_APPS = ['corsheaders']`
    );

    const engine = new UsageEvidenceEngine();
    const evidence = engine.collectEvidence([tmpDir]);
    const unused = engine.analyzeUnused(
      ['django-cors-headers', 'unused-pkg'],
      new Set<string>(),
      undefined,
      evidence
    );

    assert.ok(!unused.has('django-cors-headers'));
    assert.ok(unused.has('unused-pkg'));
  });

  test('reference hits from requirements do not suppress unused packages', () => {
    const engine = new UsageEvidenceEngine();
    const refHits = new Map([
      ['unused-pkg', [{
        package: 'unused-pkg',
        file: 'requirements.txt',
        line: 1,
        snippet: 'unused-pkg>=1.0',
      }]],
    ]);

    const refEvidence = referenceHitsToEvidence(refHits);
    assert.ok(refEvidence.get('unused-pkg')!.every(e => e.strength === 'weak'));

    const unused = engine.analyzeUnused(
      ['unused-pkg', 'requests'],
      new Set(['requests']),
      undefined,
      new Map(),
      refHits
    );

    assert.ok(unused.has('unused-pkg'));
    assert.strictEqual(unused.get('unused-pkg')!.verdict, 'uncertain');
    assert.ok(!unused.has('requests'));
  });

  test('scripts entry point marks package as used', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'pyproject.toml'),
      `
[project.scripts]
mycli = "click.core:main"
`
    );

    const evidence = detectScriptsEntryUsage(tmpDir);
    assert.ok(evidence.has('click'));

    const engine = new UsageEvidenceEngine();
    const unused = engine.analyzeUnused(
      ['click', 'unused-pkg'],
      new Set<string>(),
      undefined,
      evidence
    );

    assert.ok(!unused.has('click'));
    assert.ok(unused.has('unused-pkg'));
  });
});
