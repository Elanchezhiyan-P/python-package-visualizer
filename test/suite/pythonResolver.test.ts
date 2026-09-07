import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  findVenvOwningRoot,
  getActiveEditorWorkspaceRoot,
  isPythonInAnyWorkspaceVenv,
  listWorkspaceVenvProjects,
  resolveForWorkspace,
  resolveHealthCheckCwd,
  resolvePythonPath,
  resolveVenvAcrossRoots,
  willUseGlobalPython,
} from '../../src/modules/packageScanner/pythonResolver.js';
import { stubLogger } from '../helpers/stubLogger.js';

type VscodeTestApi = {
  __test: {
    reset: () => void;
    setWorkspaceFolders: (folders: Array<{ uri: { fsPath: string }; name?: string }> | null) => void;
    setActiveTextEditor: (editor: { document: { uri: { fsPath: string } } } | null) => void;
    setConfiguration: (values: Record<string, unknown>) => void;
    makeFolder: (fsPath: string, name?: string) => { uri: { fsPath: string }; name?: string };
  };
};

function getVscodeTestApi(): VscodeTestApi['__test'] {
  return (require('vscode') as VscodeTestApi).__test;
}

function createVenvPython(root: string, subdir = '.venv'): string {
  const isWindows = process.platform === 'win32';
  const pythonPath = isWindows
    ? path.join(root, subdir, 'Scripts', 'python.exe')
    : path.join(root, subdir, 'bin', 'python');
  fs.mkdirSync(path.dirname(pythonPath), { recursive: true });
  fs.writeFileSync(pythonPath, '');
  return pythonPath;
}

suite('pythonResolver', () => {
  let rootA: string;
  let rootB: string;

  setup(() => {
    rootA = fs.mkdtempSync(path.join(os.tmpdir(), 'ppv-root-a-'));
    rootB = fs.mkdtempSync(path.join(os.tmpdir(), 'ppv-root-b-'));
    getVscodeTestApi().reset();
  });

  teardown(() => {
    getVscodeTestApi().reset();
    fs.rmSync(rootA, { recursive: true, force: true });
    fs.rmSync(rootB, { recursive: true, force: true });
  });

  test('resolveVenvAcrossRoots returns venv from second root when first has none', () => {
    const venvB = createVenvPython(rootB);

    const resolved = resolveVenvAcrossRoots([rootA, rootB]);
    assert.strictEqual(resolved, venvB);
  });

  test('resolveVenvAcrossRoots prefers active editor root when both have venv', () => {
    const venvA = createVenvPython(rootA);
    createVenvPython(rootB);

    const resolved = resolveVenvAcrossRoots([rootA, rootB], rootB);
    assert.notStrictEqual(resolved, venvA);
    assert.ok(resolved?.includes(path.basename(rootB)));
  });

  test('resolveVenvAcrossRoots falls back to first root with venv in explorer order', () => {
    const venvA = createVenvPython(rootA);
    createVenvPython(rootB);

    const resolved = resolveVenvAcrossRoots([rootA, rootB], null);
    assert.strictEqual(resolved, venvA);
  });

  test('resolvePythonPath scans all workspace folders for venv', () => {
    const venvB = createVenvPython(rootB);
    const vscodeTest = getVscodeTestApi();
    vscodeTest.setWorkspaceFolders([
      vscodeTest.makeFolder(rootA, 'CogniLab_MR'),
      vscodeTest.makeFolder(rootB, 'cogniplay.webservice'),
    ]);

    const resolved = resolvePythonPath(stubLogger);
    assert.strictEqual(resolved, venvB);
  });

  test('resolvePythonPath prefers active editor workspace when both roots have venv', () => {
    createVenvPython(rootA);
    const venvB = createVenvPython(rootB);
    const vscodeTest = getVscodeTestApi();
    vscodeTest.setWorkspaceFolders([
      vscodeTest.makeFolder(rootA, 'CogniLab_MR'),
      vscodeTest.makeFolder(rootB, 'cogniplay.webservice'),
    ]);
    vscodeTest.setActiveTextEditor({
      document: { uri: { fsPath: path.join(rootB, 'app', 'main.py') } },
    });

    const resolved = resolvePythonPath(stubLogger);
    assert.strictEqual(resolved, venvB);
  });

  test('getActiveEditorWorkspaceRoot maps open file to containing workspace folder', () => {
    const vscodeTest = getVscodeTestApi();
    vscodeTest.setActiveTextEditor({
      document: { uri: { fsPath: path.join(rootB, 'src', 'server.py') } },
    });

    const activeRoot = getActiveEditorWorkspaceRoot([rootA, rootB]);
    assert.strictEqual(activeRoot, rootB);
  });

  test('findVenvOwningRoot locates workspace root for resolved python path', () => {
    const venvB = createVenvPython(rootB);

    const owningRoot = findVenvOwningRoot(venvB, [rootA, rootB]);
    assert.strictEqual(owningRoot, rootB);
  });

  test('willUseGlobalPython is false when python belongs to another workspace root', () => {
    const venvB = createVenvPython(rootB);
    const vscodeTest = getVscodeTestApi();
    vscodeTest.setWorkspaceFolders([
      vscodeTest.makeFolder(rootA, 'CogniLab_MR'),
      vscodeTest.makeFolder(rootB, 'cogniplay.webservice'),
    ]);

    assert.strictEqual(
      willUseGlobalPython(() => venvB, rootA),
      false
    );
    assert.strictEqual(isPythonInAnyWorkspaceVenv(venvB, [rootA, rootB]), true);
  });

  test('willUseGlobalPython is true for system python with no workspace venv match', () => {
    const vscodeTest = getVscodeTestApi();
    vscodeTest.setWorkspaceFolders([
      vscodeTest.makeFolder(rootA, 'CogniLab_MR'),
      vscodeTest.makeFolder(rootB, 'cogniplay.webservice'),
    ]);

    assert.strictEqual(
      willUseGlobalPython(() => 'C:\\Python314\\python.exe', rootA),
      true
    );
  });

  test('resolveHealthCheckCwd uses owning root for resolved python path', () => {
    const venvB = createVenvPython(rootB);
    const vscodeTest = getVscodeTestApi();
    vscodeTest.setWorkspaceFolders([
      vscodeTest.makeFolder(rootA, 'CogniLab_MR'),
      vscodeTest.makeFolder(rootB, 'cogniplay.webservice'),
    ]);

    const cwd = resolveHealthCheckCwd(() => venvB);
    assert.strictEqual(cwd, rootB);
  });

  test('resolveForWorkspace finds venv in backend subfolder', () => {
    const venvPath = createVenvPython(path.join(rootA, 'backend'), '.venv');

    const resolved = resolveForWorkspace(rootA);
    assert.strictEqual(resolved, venvPath);
  });

  test('resolvePythonPath prefers manually selected root over active editor', () => {
    createVenvPython(rootA);
    const venvB = createVenvPython(rootB);
    const vscodeTest = getVscodeTestApi();
    vscodeTest.setWorkspaceFolders([
      vscodeTest.makeFolder(rootA, 'CogniLab_MR'),
      vscodeTest.makeFolder(rootB, 'cogniplay.webservice'),
    ]);
    vscodeTest.setActiveTextEditor({
      document: { uri: { fsPath: path.join(rootA, 'app', 'main.py') } },
    });

    const resolved = resolvePythonPath(stubLogger, () => rootB);
    assert.strictEqual(resolved, venvB);
  });

  test('resolveHealthCheckCwd returns manually selected root', () => {
    createVenvPython(rootA);
    createVenvPython(rootB);
    const vscodeTest = getVscodeTestApi();
    vscodeTest.setWorkspaceFolders([
      vscodeTest.makeFolder(rootA),
      vscodeTest.makeFolder(rootB),
    ]);

    const cwd = resolveHealthCheckCwd(() => createVenvPython(rootA), () => rootB);
    assert.strictEqual(cwd, rootB);
  });

  test('listWorkspaceVenvProjects returns only folders with on-disk venv', () => {
    const venvB = createVenvPython(rootB);
    const vscodeTest = getVscodeTestApi();
    vscodeTest.setWorkspaceFolders([
      vscodeTest.makeFolder(rootA, 'frontend'),
      vscodeTest.makeFolder(rootB, 'backend'),
    ]);

    const projects = listWorkspaceVenvProjects();
    assert.strictEqual(projects.length, 1);
    assert.strictEqual(projects[0].name, 'backend');
    assert.strictEqual(projects[0].pythonPath, venvB);
  });

  test('resolvePythonPath honors pythonPath config override', () => {
    const venvA = createVenvPython(rootA);
    const isWindows = process.platform === 'win32';
    const configPath = isWindows
      ? '${workspaceFolder}/.venv/Scripts/python.exe'
      : '${workspaceFolder}/.venv/bin/python';
    const vscodeTest = getVscodeTestApi();
    vscodeTest.setWorkspaceFolders([vscodeTest.makeFolder(rootA)]);
    vscodeTest.setConfiguration({
      pythonPath: configPath,
    });

    const resolved = resolvePythonPath(stubLogger);
    assert.strictEqual(resolved, venvA);
  });
});
