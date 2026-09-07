import * as assert from 'assert';
import { checkPythonRequires } from '../../src/utils/pythonRequires.js';

suite('checkPythonRequires', () => {
  test('accepts versions that meet >= and < bounds', () => {
    assert.strictEqual(checkPythonRequires('>=3.8,<4.0', '3.11'), true);
  });

  test('rejects versions below minimum', () => {
    assert.strictEqual(checkPythonRequires('>=3.10', '3.8'), false);
  });

  test('rejects versions on != and == mismatch', () => {
    assert.strictEqual(checkPythonRequires('!=3.9', '3.9'), false);
    assert.strictEqual(checkPythonRequires('==3.11', '3.10'), false);
    assert.strictEqual(checkPythonRequires('==3.11', '3.11'), true);
  });

  test('enforces <= and > bounds', () => {
    assert.strictEqual(checkPythonRequires('<=3.10', '3.11'), false);
    assert.strictEqual(checkPythonRequires('<=3.11', '3.11'), true);
    assert.strictEqual(checkPythonRequires('>3.10', '3.10'), false);
    assert.strictEqual(checkPythonRequires('>3.10', '3.11'), true);
  });
});
