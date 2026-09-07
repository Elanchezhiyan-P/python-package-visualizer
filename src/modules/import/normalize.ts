/** Normalize a package or module name for comparison. */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

/** Common PyPI suffixes that do not change the import module name. */
const VARIANT_SUFFIXES = [
  '-headless', '-binary', '-cpu', '-gpu', '-cuda',
  '-linux', '-macosx', '-win', '-win32', '-win-amd64',
  '-standard', '-speedups', '-all', '-dev',
];

/** Returns normalized package name variants (e.g. opencv-python-headless → opencv-python). */
export function packageNameVariants(normalized: string): string[] {
  const variants = new Set<string>([normalized]);
  for (const suffix of VARIANT_SUFFIXES) {
    if (normalized.endsWith(suffix)) {
      variants.add(normalized.slice(0, -suffix.length));
    }
  }
  return [...variants];
}
