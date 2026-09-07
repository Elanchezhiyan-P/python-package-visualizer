import * as assert from 'assert';
import { shortLicenseLabel } from '../../src/utils/licenseLabel.js';

suite('shortLicenseLabel', () => {
  test('maps common SPDX and prose licenses', () => {
    assert.strictEqual(shortLicenseLabel('MIT'), 'MIT');
    assert.strictEqual(shortLicenseLabel('Apache-2.0'), 'Apache-2.0');
    assert.strictEqual(shortLicenseLabel('Permission is hereby granted, free of charge'), 'MIT');
  });

  test('truncates long unknown licenses', () => {
    const long = 'A'.repeat(50);
    const label = shortLicenseLabel(long);
    assert.ok(label.endsWith('…'));
    assert.ok(label.length <= 40);
  });

  test('returns empty string for blank input', () => {
    assert.strictEqual(shortLicenseLabel(''), '');
    assert.strictEqual(shortLicenseLabel(null), '');
  });
});
