import * as assert from 'assert';
import { detectIde } from '../../src/utils/ideDetector.js';

const CURSOR_ENV_KEYS = [
  'CURSOR_TRACE_ID',
  'CURSOR_CHANNEL',
  'CURSOR_EXTENSION_HOST_ROLE',
] as const;

function clearCursorEnv(): void {
  for (const key of CURSOR_ENV_KEYS) {
    delete process.env[key];
  }
}

suite('detectIde', () => {
  test('detects VS Code from app name', () => {
    clearCursorEnv();
    const info = detectIde();
    assert.strictEqual(info.type, 'vscode');
    assert.strictEqual(info.isCursor, false);
    assert.strictEqual(info.displayName, 'VS Code');
  });

  test('detects Cursor from environment flags', () => {
    clearCursorEnv();
    process.env.CURSOR_TRACE_ID = 'trace-test';
    const info = detectIde();
    delete process.env.CURSOR_TRACE_ID;
    assert.strictEqual(info.type, 'cursor');
    assert.strictEqual(info.isCursor, true);
  });
});
