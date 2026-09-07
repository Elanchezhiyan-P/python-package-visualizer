const path = require('path');
const os = require('os');
const fs = require('fs');

const storageRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ppv-vscode-mock-'));

let workspaceFolders = null;
let activeTextEditor = null;
let configurationValues = {};

function makeFolder(fsPath, name) {
  return {
    uri: { fsPath, path: fsPath },
    name: name ?? path.basename(fsPath),
  };
}

module.exports = {
  workspace: {
    get workspaceFolders() {
      return workspaceFolders;
    },
    getConfiguration: (_section) => ({
      get: (key, defaultValue) => (
        Object.prototype.hasOwnProperty.call(configurationValues, key)
          ? configurationValues[key]
          : defaultValue
      ),
    }),
    createFileSystemWatcher: () => ({
      onDidCreate: () => ({ dispose: () => undefined }),
      onDidChange: () => ({ dispose: () => undefined }),
      onDidDelete: () => ({ dispose: () => undefined }),
      dispose: () => undefined,
    }),
    onDidChangeWorkspaceFolders: () => ({ dispose: () => undefined }),
  },
  window: {
    get activeTextEditor() {
      return activeTextEditor;
    },
    showWarningMessage: () => Promise.resolve(undefined),
    showErrorMessage: () => Promise.resolve(undefined),
    createOutputChannel: () => ({
      appendLine: () => undefined,
      show: () => undefined,
      dispose: () => undefined,
    }),
  },
  extensions: {
    getExtension: () => undefined,
  },
  env: {
    appName: 'Visual Studio Code',
  },
  Uri: {
    file: (p) => ({ fsPath: p, path: p }),
  },
  ExtensionContext: class {},
  __test: {
    reset() {
      workspaceFolders = null;
      activeTextEditor = null;
      configurationValues = {};
    },
    setWorkspaceFolders(folders) {
      workspaceFolders = folders;
    },
    setActiveTextEditor(editor) {
      activeTextEditor = editor;
    },
    setConfiguration(values) {
      configurationValues = { ...values };
    },
    makeFolder,
  },
};
