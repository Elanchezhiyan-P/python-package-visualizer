import * as assert from 'assert';
import {
  packagesEligibleForPostBulkReconcile,
  type PostBulkReconcilePackage,
} from '../../src/commands/handlers/packageInstaller/postBulkReconcile.js';

function pkg(
  name: string,
  specifiedVersion: string,
  installedVersion: string,
  source = 'requirements.txt'
): PostBulkReconcilePackage {
  return { name, specifiedVersion, installedVersion, source };
}

suite('packagesEligibleForPostBulkReconcile', () => {
  test('does not reconcile an unselected drifted package after updating others', () => {
    const scanned = [
      pkg('requests', '==2.28.0', '2.32.0'),
      pkg('flask', '==2.3.0', '3.0.0'),
      pkg('numpy', '==1.24.0', '1.26.0'),
    ];

    const eligible = packagesEligibleForPostBulkReconcile(['requests', 'flask'], scanned);

    assert.deepStrictEqual(
      eligible.map(p => p.name),
      ['requests', 'flask']
    );
  });

  test('matches updated names case-insensitively', () => {
    const scanned = [pkg('Django', '==4.2.0', '5.0.0')];

    const eligible = packagesEligibleForPostBulkReconcile(['django'], scanned);

    assert.strictEqual(eligible.length, 1);
    assert.strictEqual(eligible[0].name, 'Django');
  });

  test('skips a successfully updated package already in sync after the first pass', () => {
    const scanned = [
      pkg('requests', '==2.32.0', '2.32.0'),
      pkg('numpy', '==1.24.0', '1.26.0'),
    ];

    const eligible = packagesEligibleForPostBulkReconcile(['requests'], scanned);

    assert.deepStrictEqual(eligible.map(p => p.name), []);
  });

  test('skips flexible constraints even when the installed version differs', () => {
    const scanned = [pkg('requests', '>=2.0', '2.32.0')];

    const eligible = packagesEligibleForPostBulkReconcile(['requests'], scanned);

    assert.deepStrictEqual(eligible.map(p => p.name), []);
  });

  test('does not include a failed update that was never added to succeeded names', () => {
    const scanned = [
      pkg('requests', '==2.28.0', '2.32.0'),
      pkg('broken', '==0.9.0', '1.0.0'),
    ];

    const eligible = packagesEligibleForPostBulkReconcile(['requests'], scanned);

    assert.deepStrictEqual(eligible.map(p => p.name), ['requests']);
  });
});
