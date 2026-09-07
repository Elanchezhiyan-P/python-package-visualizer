/** Strength of a usage signal collected by deterministic detectors. */
export type EvidenceStrength = 'strong' | 'weak';

/** A single piece of evidence that a declared package is in use. */
export interface UsageEvidence {
  source: string;
  file: string;
  line?: number;
  snippet?: string;
  strength: EvidenceStrength;
}

export type UsageVerdict = 'likely_unused' | 'uncertain';

/** Aggregated evidence for one declared package. */
export interface PackageUsageResult {
  package: string;
  evidence: UsageEvidence[];
  verdict?: UsageVerdict;
}
