import * as assert from 'assert';
import {
  isLegacyRequirementsFile,
  LEGACY_REQUIREMENTS_BASENAMES,
} from '../../src/modules/migrationHelper.js';

suite('migrationHelper', () => {
  test('isLegacyRequirementsFile recognizes requirements manifests', () => {
    for (const name of LEGACY_REQUIREMENTS_BASENAMES) {
      assert.strictEqual(isLegacyRequirementsFile(`/project/${name}`), true);
    }
    assert.strictEqual(isLegacyRequirementsFile('/project/requirements-foo.in'), true);
  });

  test('isLegacyRequirementsFile rejects non-requirements manifests', () => {
    assert.strictEqual(isLegacyRequirementsFile('/project/pyproject.toml'), false);
    assert.strictEqual(isLegacyRequirementsFile('/project/setup.py'), false);
    assert.strictEqual(isLegacyRequirementsFile('/project/setup.cfg'), false);
    assert.strictEqual(isLegacyRequirementsFile('/project/Pipfile'), false);
    assert.strictEqual(isLegacyRequirementsFile('/project/package.json'), false);
  });
});
