/**
 * Registers a minimal vscode module stub for Node unit test runs (no Electron).
 * Loaded via: node -r ./test/helpers/registerVscodeMock.cjs
 */
const Module = require('module');
const path = require('path');

const stubPath = path.join(__dirname, 'vscodeStub.cjs');
const vscodeStub = require(stubPath);

Module._cache[stubPath] = {
  id: stubPath,
  exports: vscodeStub,
  loaded: true,
};

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'vscode') {
    return stubPath;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

module.exports = vscodeStub;
