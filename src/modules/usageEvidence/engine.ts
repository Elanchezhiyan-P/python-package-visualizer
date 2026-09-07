import { detectDjangoSettingsUsage } from './djangoSettingsDetector.js';
import { detectDevToolConfigUsage } from './devToolConfigDetector.js';
import { detectMigrationUsage } from './migrationDetector.js';
import { detectPytestConfigUsage } from './pytestConfigDetector.js';
import { detectScriptsEntryUsage } from './scriptsEntryDetector.js';
import { applyOrphanChainAnalysis } from './orphanChainAnalyzer.js';
import { referenceHitsToEvidence } from './pypiTopLevelCache.js';
import type { UsageReferenceHit } from '../import/usageReferenceSearch.js';
import {
  UnusedConfidenceAnalyzer,
  type UnusedPackageInfo,
  type UnusedConfidenceContext,
} from '../import/confidence.js';
import { normalizeName } from '../import/normalize.js';
import type { UsageEvidence } from './types.js';

export type { UsageEvidence, UsageVerdict, PackageUsageResult } from './types.js';
export { PypiTopLevelCache, referenceHitsToEvidence } from './pypiTopLevelCache.js';
export { applyOrphanChainAnalysis, ORPHAN_CLUSTERS } from './orphanChainAnalyzer.js';

function mergeEvidenceMaps(
  ...maps: Array<Map<string, UsageEvidence[]>>
): Map<string, UsageEvidence[]> {
  const merged = new Map<string, UsageEvidence[]>();

  for (const map of maps) {
    for (const [pkg, hits] of map) {
      const norm = normalizeName(pkg);
      const existing = merged.get(norm) ?? [];
      const combined = [...existing, ...hits].slice(0, 8);
      merged.set(norm, combined);
    }
  }

  return merged;
}

function hasStrongEvidence(hits: UsageEvidence[] | undefined): boolean {
  return Boolean(hits?.some(h => h.strength === 'strong'));
}

function hasWeakEvidenceOnly(hits: UsageEvidence[] | undefined): boolean {
  return Boolean(hits?.length) && !hasStrongEvidence(hits);
}

/**
 * Orchestrates deterministic usage detectors and produces the final unused map.
 */
export class UsageEvidenceEngine {
  private readonly analyzer = new UnusedConfidenceAnalyzer();

  collectEvidence(workspaceRoots: string[]): Map<string, UsageEvidence[]> {
    const maps: Array<Map<string, UsageEvidence[]>> = [];

    for (const root of workspaceRoots) {
      maps.push(detectDjangoSettingsUsage(root));
      maps.push(detectPytestConfigUsage(root));
      maps.push(detectDevToolConfigUsage(root));
      maps.push(detectMigrationUsage(root));
      maps.push(detectScriptsEntryUsage(root));
    }

    return mergeEvidenceMaps(...maps);
  }

  analyzeUnused(
    declaredPackages: string[],
    importedModules: Set<string>,
    context: UnusedConfidenceContext | undefined,
    evidence: Map<string, UsageEvidence[]>,
    referenceHits?: Map<string, UsageReferenceHit[]>
  ): Map<string, UnusedPackageInfo> {
    const refEvidence = referenceHits ? referenceHitsToEvidence(referenceHits) : new Map();
    const allEvidence = mergeEvidenceMaps(evidence, refEvidence);

    const rawUnused = this.analyzer.analyze(
      declaredPackages,
      importedModules,
      context,
      allEvidence
    );

    applyOrphanChainAnalysis(rawUnused, declaredPackages);
    return rawUnused;
  }
}

/** Returns packages with strong evidence (treated as used). */
export function getUsedPackagesFromEvidence(
  evidence: Map<string, UsageEvidence[]>
): Set<string> {
  const used = new Set<string>();
  for (const [pkg, hits] of evidence) {
    if (hasStrongEvidence(hits)) {
      used.add(normalizeName(pkg));
    }
  }
  return used;
}

export { hasStrongEvidence, hasWeakEvidenceOnly, mergeEvidenceMaps };
