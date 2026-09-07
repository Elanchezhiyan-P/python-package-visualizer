import * as assert from 'assert';
import {
  hasDrift,
  versionsEquivalent,
  extractExactPinnedVersion,
  isExactPin,
  wouldTightenToExactPin,
  extractPinnedVersion,
} from '../../src/utils/version.js';

suite('version utils', () => {
  test('versionsEquivalent treats trailing zeros as equal', () => {
    assert.strictEqual(versionsEquivalent('1.0.0', '1.0'), true);
    assert.strictEqual(versionsEquivalent('2.28.0', '2.28'), true);
    assert.strictEqual(versionsEquivalent('1.0.1', '1.0.0'), false);
  });

  test('hasDrift ignores equivalent version forms', () => {
    assert.strictEqual(hasDrift('==1.0.0', '1.0'), false);
    assert.strictEqual(hasDrift('==2.28.0', '2.28'), false);
    assert.strictEqual(hasDrift('==1.0.0', '1.0.1'), true);
  });

  test('hasDrift detects real mismatch on exact pins', () => {
    assert.strictEqual(hasDrift('==1.2.3', '1.2.4'), true);
    assert.strictEqual(hasDrift('===1.2.3', '1.2.4'), true);
  });

  test('hasDrift returns false when no version is pinned', () => {
    assert.strictEqual(hasDrift('', '1.5.0'), false);
    assert.strictEqual(hasDrift('numpy', '1.5.0'), false);
  });

  test('hasDrift ignores satisfied ranges (not exact pins)', () => {
    assert.strictEqual(hasDrift('>=2.0', '2.5.0'), false);
    assert.strictEqual(hasDrift('>=2.0,<3.0', '2.5.0'), false);
    assert.strictEqual(hasDrift('~=1.2.0', '1.2.5'), false);
    assert.strictEqual(hasDrift('^2.28', '2.32.0'), false);
    assert.strictEqual(hasDrift('>1.0', '2.0.0'), false);
    assert.strictEqual(hasDrift('!=1.0.0', '1.0.1'), false);
  });

  test('hasDrift treats pre-release suffixes as distinct', () => {
    assert.strictEqual(hasDrift('==1.0.0a1', '1.0.0'), true);
    assert.strictEqual(hasDrift('==1.0.0a1', '1.0.0a1'), false);
    assert.strictEqual(hasDrift('==1.0.0rc1', '1.0.0'), true);
  });

  test('wildcards are not exact pins for drift', () => {
    assert.strictEqual(extractExactPinnedVersion('==1.2.*'), null);
    assert.strictEqual(hasDrift('==1.2.*', '1.2.5'), false);
  });

  test('hasDrift still detects mismatch when exact pin has environment marker', () => {
    assert.strictEqual(hasDrift("==1.2.3; python_version >= '3.10'", '1.2.4'), true);
    assert.strictEqual(hasDrift("==1.2.3; python_version >= '3.10'", '1.2.3'), false);
  });

  test('extractExactPinnedVersion only accepts sole == / ===', () => {
    assert.strictEqual(extractExactPinnedVersion('==1.2.3'), '1.2.3');
    assert.strictEqual(extractExactPinnedVersion('===2.0'), '2.0');
    assert.strictEqual(extractExactPinnedVersion('>=2.0'), null);
    assert.strictEqual(extractExactPinnedVersion('>=2.0,<3'), null);
    assert.strictEqual(extractExactPinnedVersion('==1.2.3,!=1.2.4'), null);
    assert.strictEqual(extractExactPinnedVersion(''), null);
  });

  test('isExactPin and wouldTightenToExactPin agree', () => {
    assert.strictEqual(isExactPin('==1.0.0'), true);
    assert.strictEqual(wouldTightenToExactPin('==1.0.0'), false);
    assert.strictEqual(isExactPin('>=1.0'), false);
    assert.strictEqual(wouldTightenToExactPin('>=1.0'), true);
    assert.strictEqual(wouldTightenToExactPin(''), true);
    assert.strictEqual(wouldTightenToExactPin('requests'), true);
  });

  test('extractPinnedVersion still reads first version from ranges (install hint)', () => {
    assert.strictEqual(extractPinnedVersion('>=2.0,<3.0'), '2.0');
    assert.strictEqual(extractPinnedVersion('==1.2.3'), '1.2.3');
  });
});
