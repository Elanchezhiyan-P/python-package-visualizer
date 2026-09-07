/**
 * Patch gate: newly added src/ files with unit coverage must meet line threshold.
 * Modified legacy files are warned but not blocked (global floor in c8.json).
 * Usage: node scripts/check-patch-coverage.mjs [base-ref]
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PATCH_THRESHOLD = 70;
const PATCH_EXEMPT = [
  'src/modules/packageScanner/pythonResolver.ts',
  'src/modules/usageEvidence/pypiTopLevelCache.ts',
];
const PATCH_ENSEMBLE_PREFIXES = [
  'src/modules/usageEvidence/',
];
const UI_GLUE_PREFIXES = [
  'src/commands/',
  'src/providers/',
  'src/ui/',
  'src/extension.ts',
  'src/services/cursorAiService.ts',
  'src/services/venvHealthChecker.ts',
  'src/services/manualUsedPackages.ts',
  'src/services/ignoredUpdates.ts',
  'src/services/snapshotManager.ts',
];
const UNIT_TESTABLE_PREFIXES = [
  'src/modules/',
  'src/utils/',
  'src/services/',
  'src/data/',
];

const baseRef = process.argv[2] ?? 'origin/main';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function gitLines(args) {
  return execSync(`git ${args}`, { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function isUiGlue(rel) {
  return UI_GLUE_PREFIXES.some(p => rel === p || rel.startsWith(p));
}

function isUnitTestable(rel) {
  return UNIT_TESTABLE_PREFIXES.some(p => rel.startsWith(p));
}

const addedOut = gitLines(`diff --diff-filter=A --name-only ${baseRef} HEAD -- src/`);
if (!addedOut) {
  console.log(`Patch coverage: no new src/ files vs ${baseRef}`);
  process.exit(0);
}

const addedFiles = addedOut.split(/\r?\n/).filter(Boolean);
const summaryPath = path.join(repoRoot, 'coverage', 'coverage-summary.json');
const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));

const failures = [];
const warnings = [];

for (const rel of addedFiles) {
  if (PATCH_EXEMPT.includes(rel)) {
    warnings.push(`${rel} (exempt: spawn/network)`);
    continue;
  }
  if (PATCH_ENSEMBLE_PREFIXES.some(p => rel.startsWith(p))) {
    warnings.push(`${rel} (ensemble-tested in usageEvidence.test.ts)`);
    continue;
  }
  if (isUiGlue(rel)) {
    warnings.push(`${rel} (UI/glue — no unit coverage expected)`);
    continue;
  }

  const absTs = path.resolve(repoRoot, rel.replace(/\//g, path.sep));
  const key = Object.keys(summary).find(k => path.resolve(k) === absTs);

  if (!key) {
    if (isUnitTestable(rel)) {
      failures.push({ rel, pct: 0, reason: 'no coverage entry — add unit tests' });
      continue;
    }
    warnings.push(`${rel} (no coverage entry — not in unit-testable paths)`);
    continue;
  }

  const pct = summary[key]?.lines?.pct ?? 0;
  if (pct < PATCH_THRESHOLD) {
    failures.push({ rel, pct, reason: 'below threshold' });
  }
}

for (const w of warnings) {
  console.warn(`Patch coverage note: ${w}`);
}

if (failures.length > 0) {
  console.error(`Patch coverage failures (threshold ${PATCH_THRESHOLD}%):`);
  for (const f of failures) {
    console.error(`  ${f.rel}: ${f.reason}${f.pct ? ` (${f.pct}%)` : ''}`);
  }
  process.exit(1);
}

console.log(
  `Patch coverage OK (${addedFiles.length} new src file(s) vs ${baseRef}, threshold ${PATCH_THRESHOLD}%)`
);
