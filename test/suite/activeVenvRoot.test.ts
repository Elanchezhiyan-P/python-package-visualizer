import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import {
  findMatchingWorkspaceRoot,
  getSelectedVenvRoot,
  setSelectedVenvRoot,
} from '../../src/services/activeVenvRoot.js';
import { normalizeRootPath } from '../../src/utils/normalizeRootPath.js';

function makeStubContext(): import('vscode').ExtensionContext {
  return {
    workspaceState: {
      _data: {} as Record<string, unknown>,
      get<T>(key: string): T | undefined {
        return this._data[key] as T | undefined;
      },
      async update(key: string, value: unknown): Promise<void> {
        if (value === undefined) {
          delete this._data[key];
          return;
        }
        this._data[key] = value;
      },
    },
  } as unknown as import('vscode').ExtensionContext;
}

suite('activeVenvRoot', () => {
  test('persists and reads selected venv root', async () => {
    const context = makeStubContext();
    const root = 'C:\\projects\\cogniplay.webservice';

    assert.strictEqual(getSelectedVenvRoot(context), null);
    await setSelectedVenvRoot(context, root);
    assert.strictEqual(getSelectedVenvRoot(context), root);
    await setSelectedVenvRoot(context, null);
    assert.strictEqual(getSelectedVenvRoot(context), null);
  });

  test('findMatchingWorkspaceRoot matches case-insensitive Windows paths', () => {
    const roots = ['C:\\Workspace\\ProjectA', 'C:\\Workspace\\ProjectB'];
    const match = findMatchingWorkspaceRoot('c:/workspace/projectb', roots);
    assert.strictEqual(match, roots[1]);
  });

  test('normalizeRootPath resolves relative segments consistently', () => {
    const input = path.join(os.tmpdir(), 'foo', 'bar', '..', 'baz');
    const expected = path.join(os.tmpdir(), 'foo', 'baz');
    const normalized = normalizeRootPath(input);

    if (process.platform === 'win32') {
      assert.strictEqual(normalized, expected.toLowerCase());
    } else {
      assert.strictEqual(normalized, expected);
    }
  });
});
