import { normalizeName } from '../import/normalize.js';
import type { UnusedPackageInfo } from '../import/confidence.js';

/**
 * Known dependency clusters removable only when the root package is unused.
 * Key: root package → orphan dependents that share no other used parent.
 */
export const ORPHAN_CLUSTERS: Record<string, string[]> = {
  djoser: [
    'social-auth-app-django',
    'social-auth-core',
    'python3-openid',
    'defusedxml',
  ],
  'django-cities-light': [
    'django-autoslug',
    'progressbar2',
    'psutil',
    'python-utils',
    'unidecode',
  ],
  'factory-boy': ['faker'],
};

/** Optional runtime deps that may be needed when parent is used. */
export const OPTIONAL_PARENT_DEPS: Array<{ pkg: string; parent: string }> = [
  { pkg: 'zopfli', parent: 'weasyprint' },
  { pkg: 'brotli', parent: 'weasyprint' },
];

const LIKELY_UNUSED_MIN_CONFIDENCE = 80;

/**
 * Marks orphan cluster members as likely_unused when root is confidently unused.
 * Marks optional deps as uncertain when parent is not in the unused set.
 */
export function applyOrphanChainAnalysis(
  unused: Map<string, UnusedPackageInfo>,
  declaredPackages: string[]
): void {
  const declared = new Set(declaredPackages.map(normalizeName));

  for (const [root, children] of Object.entries(ORPHAN_CLUSTERS)) {
    const normRoot = normalizeName(root);
    const rootInfo = unused.get(normRoot);
    if (
      !rootInfo ||
      rootInfo.verdict !== 'likely_unused' ||
      rootInfo.confidence < LIKELY_UNUSED_MIN_CONFIDENCE
    ) {
      continue;
    }

    for (const child of children) {
      const normChild = normalizeName(child);
      if (!declared.has(normChild)) {
        continue;
      }
      if (unused.has(normChild)) {
        continue;
      }

      unused.set(normChild, {
        name: normChild,
        confidence: Math.min(rootInfo.confidence, 95),
        reasons: [`orphan-chain:${normRoot}`],
        verdict: 'likely_unused',
        usageEvidence: [],
      });
    }
  }

  for (const { pkg, parent } of OPTIONAL_PARENT_DEPS) {
    const normPkg = normalizeName(pkg);
    const normParent = normalizeName(parent);
    if (!declared.has(normPkg)) {
      continue;
    }

    const pkgInfo = unused.get(normPkg);
    if (!pkgInfo) {
      continue;
    }

    const parentUnused = unused.has(normParent);
    if (!parentUnused) {
      unused.set(normPkg, {
        ...pkgInfo,
        confidence: Math.min(pkgInfo.confidence, 55),
        verdict: 'uncertain',
        reasons: [...pkgInfo.reasons.filter(r => !r.startsWith('orphan-chain')), `optional-dep:${normParent}`],
      });
    }
  }
}
