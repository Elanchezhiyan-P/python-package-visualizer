import { NEVER_IMPORTED_PACKAGES } from './maps.js';
import { normalizeName } from './normalize.js';
import {
  buildUsedPackageSet,
  isPackageUsed,
} from './packageMatcher.js';
import type { UsageEvidence, UsageVerdict } from '../usageEvidence/types.js';

export interface UnusedPackageInfo {
  /** Normalized package name */
  name: string;
  /** Confidence percentage (5–100) that the package is truly unused */
  confidence: number;
  /** Human-readable reasons explaining the confidence deductions */
  reasons: string[];
  /** Classification aligned with deterministic review tiers */
  verdict: UsageVerdict;
  /** Evidence collected by framework/config detectors */
  usageEvidence?: UsageEvidence[];
}

export interface UnusedConfidenceContext {
  /** Map of package name → list of its dependency names (from pip show) */
  requiresMap: Map<string, string[]>;
  /** Map of package name → weekly download count */
  downloadsMap: Map<string, number>;
  /** Map of package name → group (main, dev, test, docs, lint, optional) */
  groupMap: Map<string, string>;
  /** Extra import-name candidates from PyPI cache or other sources */
  extraImportCandidates?: Map<string, Set<string>>;
}

/** Packages below this threshold are not reported as unused (likely false positives). */
export const UNUSED_REPORT_THRESHOLD = 50;

function hasStrongEvidence(hits: UsageEvidence[] | undefined): boolean {
  return Boolean(hits?.some(h => h.strength === 'strong'));
}

function hasWeakEvidenceOnly(hits: UsageEvidence[] | undefined): boolean {
  return Boolean(hits?.length) && !hasStrongEvidence(hits);
}

/**
 * Computes unused packages with multi-signal confidence scoring.
 */
export class UnusedConfidenceAnalyzer {
  analyze(
    declaredPackages: string[],
    importedModules: Set<string>,
    context?: UnusedConfidenceContext,
    evidence?: Map<string, UsageEvidence[]>
  ): Map<string, UnusedPackageInfo> {
    const normalizedImports = new Set(
      [...importedModules].map(m => m.toLowerCase())
    );
    const usedPackages = buildUsedPackageSet(normalizedImports);
    const result = new Map<string, UnusedPackageInfo>();

    const requiredBy = this.buildRequiredByIndex(context?.requiresMap);

    for (const pkg of declaredPackages) {
      const norm = normalizeName(pkg);
      const pkgEvidence = evidence?.get(norm);

      if (hasStrongEvidence(pkgEvidence)) {
        continue;
      }

      if (NEVER_IMPORTED_PACKAGES.has(norm)) {
        continue;
      }

      if (isPackageUsed(norm, normalizedImports, context?.extraImportCandidates?.get(norm))) {
        continue;
      }

      if (this.isTransitiveOfUsedPackage(norm, requiredBy, usedPackages)) {
        continue;
      }

      let { confidence, reasons } = this.scoreUnusedConfidence(norm, context, requiredBy);

      if (hasWeakEvidenceOnly(pkgEvidence)) {
        confidence = Math.min(confidence, 55);
        reasons = [...reasons, 'weak-config-evidence'];
      }

      if (confidence < UNUSED_REPORT_THRESHOLD) {
        continue;
      }

      const verdict: UsageVerdict =
        hasWeakEvidenceOnly(pkgEvidence) ? 'uncertain' : 'likely_unused';

      result.set(norm, {
        name: norm,
        confidence,
        reasons,
        verdict,
        usageEvidence: pkgEvidence,
      });
    }

    return result;
  }

  private buildRequiredByIndex(
    requiresMap?: Map<string, string[]>
  ): Map<string, string[]> {
    const requiredBy = new Map<string, string[]>();
    if (!requiresMap) {
      return requiredBy;
    }

    for (const [parentPkg, deps] of requiresMap) {
      for (const dep of deps) {
        const normDep = normalizeName(dep);
        const list = requiredBy.get(normDep) ?? [];
        list.push(parentPkg);
        requiredBy.set(normDep, list);
      }
    }
    return requiredBy;
  }

  /** Skip deps that are only pulled in by packages already marked as used. */
  private isTransitiveOfUsedPackage(
    normalizedPkg: string,
    requiredBy: Map<string, string[]>,
    usedPackages: Set<string>
  ): boolean {
    const parents = requiredBy.get(normalizedPkg);
    if (!parents?.length) {
      return false;
    }
    return parents.every(parent => usedPackages.has(normalizeName(parent)));
  }

  private scoreUnusedConfidence(
    norm: string,
    context: UnusedConfidenceContext | undefined,
    requiredBy: Map<string, string[]>
  ): { confidence: number; reasons: string[] } {
    let confidence = 100;
    const reasons: string[] = [];

    const parents = requiredBy.get(norm);
    if (parents?.length) {
      confidence -= 40;
      reasons.push(`required-by:${parents.slice(0, 3).join(',')}`);
    }

    const group = context?.groupMap?.get(norm);
    if (group && group !== 'main') {
      confidence -= 15;
      reasons.push(`group:${group}`);
    }

    const downloads = context?.downloadsMap?.get(norm) ?? 0;
    if (downloads > 1_000_000) {
      confidence -= 5;
      reasons.push('high-downloads');
    }

    return { confidence: Math.max(5, confidence), reasons };
  }
}
