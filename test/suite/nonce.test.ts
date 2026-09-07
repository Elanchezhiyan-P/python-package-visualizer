import * as assert from 'assert';
import { getNonce } from '../../src/utils/nonce.js';

suite('getNonce', () => {
  test('returns a 32-character alphanumeric string', () => {
    const nonce = getNonce();
    assert.strictEqual(nonce.length, 32);
    assert.ok(/^[A-Za-z0-9]+$/.test(nonce));
  });
});
