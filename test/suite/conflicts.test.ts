import * as assert from 'assert';
import {
  detectConflicts,
  parseConflicts,
} from '../../src/modules/packageScanner/conflicts.js';
import type { ScannedPackage } from '../../src/modules/packageScanner/types.js';

suite('parseConflicts', () => {
  test('parses version mismatch lines', () => {
    const output = [
      'contourpy 1.3.0 has requirement numpy>=1.23, but you have numpy 1.21.0',
      'matplotlib 3.8.0 has requirement pillow>=8, but you have pillow 7.2.0',
    ].join('\n');

    const conflicts = parseConflicts(output);

    assert.strictEqual(conflicts.length, 2);
    assert.strictEqual(conflicts[0].package, 'contourpy');
    assert.strictEqual(conflicts[0].conflictingPackage, 'numpy');
    assert.strictEqual(conflicts[0].conflictingVersion, '1.21.0');
    assert.strictEqual(conflicts[0].requirement, 'numpy>=1.23');
  });

  test('parses missing dependency lines', () => {
    const output =
      'flask 3.0.0 requires blinker, which is not installed.';

    const conflicts = parseConflicts(output);

    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(conflicts[0].package, 'flask');
    assert.strictEqual(conflicts[0].conflictingPackage, 'blinker');
    assert.strictEqual(conflicts[0].conflictingVersion, 'not installed');
  });

  test('ignores empty lines and unrecognized output', () => {
    assert.deepStrictEqual(parseConflicts('\nNo broken requirements found.\n'), []);
  });
});

suite('detectConflicts', () => {
  test('marks packages involved in conflicts', () => {
    const scanned: ScannedPackage[] = [
      {
        name: 'numpy',
        specifiedVersion: '',
        installedVersion: '1.21.0',
        source: 'requirements.txt',
        extras: [],
        requires: [],
        group: 'main',
        environment: 'main',
      },
      {
        name: 'requests',
        specifiedVersion: '>=2.0',
        installedVersion: '2.32.0',
        source: 'requirements.txt',
        extras: [],
        requires: [],
        group: 'main',
        environment: 'main',
      },
    ];

    const updated = detectConflicts(scanned, [
      {
        package: 'contourpy',
        version: '1.3.0',
        requirement: 'numpy>=1.23',
        conflictingPackage: 'numpy',
        conflictingVersion: '1.21.0',
      },
    ]);

    const numpy = updated.find(p => p.name === 'numpy');
    const requests = updated.find(p => p.name === 'requests');

    assert.strictEqual(numpy?.hasConflict, true);
    assert.strictEqual(requests?.hasConflict, false);
  });
});
