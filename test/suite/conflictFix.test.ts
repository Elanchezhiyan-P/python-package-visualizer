import * as assert from 'assert';
import {
  getConflictInstallSpec,
  getConflictTargetPackage,
  packageNameFromRequirement,
} from '../../src/utils/conflictFix.js';

suite('conflictFix', () => {
  test('packageNameFromRequirement parses common specifiers', () => {
    assert.strictEqual(packageNameFromRequirement('contourpy>=1.0.1'), 'contourpy');
    assert.strictEqual(packageNameFromRequirement('requests[security]>=2.0'), 'requests');
    assert.strictEqual(packageNameFromRequirement('scipy'), 'scipy');
  });

  test('getConflictInstallSpec returns pip requirement string', () => {
    const spec = getConflictInstallSpec({
      package: 'numpy',
      version: '1.24.4',
      requirement: 'contourpy>=1.0.1',
      conflictingPackage: 'contourpy',
      conflictingVersion: '0.8.0',
    });
    assert.strictEqual(spec, 'contourpy>=1.0.1');
  });

  test('getConflictTargetPackage prefers conflictingPackage', () => {
    assert.strictEqual(
      getConflictTargetPackage({
        package: 'numpy',
        version: '1.24.4',
        requirement: 'contourpy>=1.0.1',
        conflictingPackage: 'contourpy',
        conflictingVersion: '0.8.0',
      }),
      'contourpy'
    );
  });
});
