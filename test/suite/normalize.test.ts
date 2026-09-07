import * as assert from 'assert';
import { normalizeName, packageNameVariants } from '../../src/modules/import/normalize.js';

suite('import normalize', () => {
  test('normalizeName lowercases and collapses delimiters', () => {
    assert.strictEqual(normalizeName('Requests'), 'requests');
    assert.strictEqual(normalizeName('my_package'), 'my-package');
    assert.strictEqual(normalizeName('My.Package'), 'my-package');
  });

  test('packageNameVariants strips common PyPI suffixes', () => {
    const variants = packageNameVariants('opencv-python-headless');
    assert.ok(variants.includes('opencv-python-headless'));
    assert.ok(variants.includes('opencv-python'));
  });

  test('packageNameVariants keeps base name when no suffix matches', () => {
    assert.deepStrictEqual(packageNameVariants('requests'), ['requests']);
  });
});
