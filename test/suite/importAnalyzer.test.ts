import * as assert from 'assert';
import { ImportExtractor } from '../../src/modules/import/extractor.js';
import {
  buildUsedPackageSet,
  isPackageUsed,
  mapImportToPackageName,
  resolveImportToPackageNames,
} from '../../src/modules/import/packageMatcher.js';
import { UnusedConfidenceAnalyzer } from '../../src/modules/import/confidence.js';

suite('ImportExtractor', () => {
  const extractor = new ImportExtractor();

  test('extracts simple imports', () => {
    const mods = extractor.extract(`
import requests
from flask import Flask
from google.cloud import storage
`);
    assert.ok(mods.has('requests'));
    assert.ok(mods.has('flask'));
    assert.ok(mods.has('google.cloud'));
    assert.ok(mods.has('google'));
  });

  test('extracts parenthesized multiline imports', () => {
    const mods = extractor.extract(`
import (
    numpy,
    pandas as pd,
)
from typing import (
    Optional,
    List,
)
`);
    assert.ok(mods.has('numpy'));
    assert.ok(mods.has('pandas'));
    assert.ok(mods.has('typing'));
  });

  test('extracts dynamic imports', () => {
    const mods = extractor.extract(`
mod = importlib.import_module("cv2")
other = __import__("PIL.Image")
`);
    assert.ok(mods.has('cv2'));
    assert.ok(mods.has('pil.image'));
    assert.ok(mods.has('pil'));
  });

  test('ignores relative imports', () => {
    const mods = extractor.extract(`
from . import utils
from ..models import User
`);
    assert.ok(!mods.has('utils'));
    assert.ok(!mods.has('models'));
  });
});

suite('PackageMatcher', () => {
  test('maps cv2 to opencv-python', () => {
    const pkgs = resolveImportToPackageNames('cv2');
    assert.ok(pkgs.has('opencv-python'));
    assert.strictEqual(mapImportToPackageName('cv2'), 'opencv-python');
  });

  test('maps pillow import aliases', () => {
    const pkgs = resolveImportToPackageNames('PIL');
    assert.ok(pkgs.has('pillow'));
  });

  test('maps langchain subpackages', () => {
    const pkgs = resolveImportToPackageNames('langchain_openai');
    assert.ok(pkgs.has('langchain-openai'));
  });

  test('marks package used when import resolves to it', () => {
    const imports = new Set(['cv2', 'numpy']);
    assert.ok(isPackageUsed('opencv-python', imports));
    assert.ok(isPackageUsed('opencv-python-headless', imports));
    assert.ok(!isPackageUsed('flask', imports));
  });

  test('buildUsedPackageSet aggregates resolved packages', () => {
    const used = buildUsedPackageSet(new Set(['sklearn', 'dotenv', 'fitz']));
    assert.ok(used.has('scikit-learn'));
    assert.ok(used.has('python-dotenv'));
    assert.ok(used.has('pymupdf'));
  });

  test('maps django ecosystem imports', () => {
    assert.ok(resolveImportToPackageNames('corsheaders').has('django-cors-headers'));
    assert.ok(resolveImportToPackageNames('localflavor.it').has('django-localflavor'));
    assert.ok(resolveImportToPackageNames('phonenumber_field').has('django-phonenumber-field'));
    assert.ok(resolveImportToPackageNames('rest_framework_simplejwt').has('djangorestframework-simplejwt'));
  });

  test('phonenumberslite alias resolves via phonenumbers import', () => {
    const imports = new Set(['phonenumbers']);
    assert.ok(isPackageUsed('phonenumberslite', imports));
    assert.ok(isPackageUsed('phonenumbers', imports));
  });

  test('marks django-cors-headers used via corsheaders import', () => {
    const imports = new Set(['corsheaders.middleware']);
    assert.ok(isPackageUsed('django-cors-headers', imports));
  });
});

suite('UnusedConfidenceAnalyzer', () => {
  const analyzer = new UnusedConfidenceAnalyzer();

  test('does not flag packages with matching imports', () => {
    const result = analyzer.analyze(
      ['opencv-python', 'flask', 'unused-pkg'],
      new Set(['cv2', 'flask'])
    );
    const names = [...result.keys()];
    assert.ok(!names.includes('opencv-python'));
    assert.ok(!names.includes('flask'));
    assert.ok(names.includes('unused-pkg'));
  });

  test('skips transitive deps of used packages', () => {
    const result = analyzer.analyze(
      ['urllib3', 'requests'],
      new Set(['requests']),
      {
        requiresMap: new Map([
          ['requests', ['urllib3']],
        ]),
        downloadsMap: new Map(),
        groupMap: new Map(),
      }
    );
    assert.ok(!result.has('urllib3'));
    assert.ok(!result.has('requests'));
  });

  test('suppresses low-confidence unused reports', () => {
    const result = analyzer.analyze(
      ['helper-pkg'],
      new Set(),
      {
        requiresMap: new Map([
          ['main-pkg', ['helper-pkg']],
        ]),
        downloadsMap: new Map([['helper-pkg', 2_000_000]]),
        groupMap: new Map([['helper-pkg', 'dev']]),
      }
    );
    // 100 - 40 (required-by) - 15 (dev) - 5 (downloads) = 40 < threshold 50
    assert.strictEqual(result.size, 0);
  });
});
