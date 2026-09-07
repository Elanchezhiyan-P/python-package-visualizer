import {
  IMPORT_TO_PACKAGE,
  NAMESPACE_PREFIXES,
  PACKAGE_MODULE_ALIASES,
  STDLIB_MODULES,
} from './maps.js';
import { normalizeName, packageNameVariants } from './normalize.js';

/**
 * Resolves a Python import path to one or more possible pip package names.
 * Walks dotted prefixes so `google.cloud.storage` also checks mapped parents.
 */
export function resolveImportToPackageNames(importName: string): Set<string> {
  const results = new Set<string>();
  const lower = importName.toLowerCase().trim();
  if (!lower || lower.startsWith('.')) {
    return results;
  }

  const top = lower.split('.')[0];
  if (!top || top.startsWith('_') || STDLIB_MODULES.has(top)) {
    return results;
  }

  const parts = lower.split('.');

  // Mapped prefixes (longest first)
  for (let len = parts.length; len >= 1; len--) {
    const prefix = parts.slice(0, len).join('.');
    const mapped = IMPORT_TO_PACKAGE[prefix];
    if (mapped) {
      results.add(normalizeName(mapped));
    }
  }

  // Top-level module name is often the package name (requests, numpy, flask)
  results.add(normalizeName(top));

  // Underscore ↔ hyphen variants (langchain_openai → langchain-openai)
  if (top.includes('_')) {
    results.add(normalizeName(top.replace(/_/g, '-')));
  }

  // Namespace packages: google-generativeai ↔ google.generativeai
  if (parts.length >= 2 && NAMESPACE_PREFIXES.has(parts[0])) {
    results.add(normalizeName(parts.join('-')));
    if (parts.length >= 3) {
      results.add(normalizeName(`${parts[0]}-${parts[1]}-${parts[2]}`));
    }
  }

  return results;
}

/** Builds the set of declared packages that appear used according to import scan. */
export function buildUsedPackageSet(importedModules: Iterable<string>): Set<string> {
  const used = new Set<string>();

  for (const imp of importedModules) {
    for (const pkg of resolveImportToPackageNames(imp)) {
      used.add(pkg);
    }
  }

  return used;
}

/** Generates import-name candidates that may refer to a pip package. */
export function buildImportCandidates(normalizedPkg: string): Set<string> {
  const candidates = new Set<string>();

  for (const variant of packageNameVariants(normalizedPkg)) {
    candidates.add(variant);
    candidates.add(variant.replace(/-/g, '_'));
    candidates.add(variant.replace(/-/g, ''));
    candidates.add(variant.replace(/-/g, '.'));
  }

  for (const [importName, pkgName] of Object.entries(IMPORT_TO_PACKAGE)) {
    if (packageNameVariants(normalizeName(pkgName)).includes(normalizedPkg)) {
      candidates.add(importName.toLowerCase());
      const top = importName.split('.')[0].toLowerCase();
      candidates.add(top);
    }
  }

  const parts = normalizedPkg.split('-');
  if (parts.length >= 2 && NAMESPACE_PREFIXES.has(parts[0])) {
    candidates.add(parts.join('.'));
    if (parts.length >= 3) {
      candidates.add(`${parts[0]}.${parts[1]}.${parts[2]}`);
    }
  }

  for (const alias of PACKAGE_MODULE_ALIASES[normalizedPkg] ?? []) {
    candidates.add(alias);
    candidates.add(alias.replace(/-/g, '_'));
  }

  return candidates;
}

/**
 * Returns true when imports indicate the package is used.
 * Uses bidirectional resolution (import → package) plus candidate matching.
 */
export function isPackageUsed(
  normalizedPkg: string,
  importedModules: Set<string>,
  extraCandidates?: Set<string>
): boolean {
  const normalizedImports = new Set(
    [...importedModules].map(m => m.toLowerCase())
  );

  const usedPackages = buildUsedPackageSet(normalizedImports);
  for (const variant of packageNameVariants(normalizedPkg)) {
    if (usedPackages.has(variant)) {
      return true;
    }
  }

  // Shared top-level module (e.g. phonenumberslite ↔ phonenumbers)
  for (const alias of PACKAGE_MODULE_ALIASES[normalizedPkg] ?? []) {
    for (const variant of packageNameVariants(normalizeName(alias))) {
      if (usedPackages.has(variant)) {
        return true;
      }
    }
  }

  const candidates = buildImportCandidates(normalizedPkg);
  if (extraCandidates) {
    for (const c of extraCandidates) {
      candidates.add(c);
    }
  }
  for (const candidate of candidates) {
    if (normalizedImports.has(candidate)) {
      return true;
    }
    for (const imp of normalizedImports) {
      if (imp === candidate || imp.startsWith(candidate + '.')) {
        return true;
      }
    }
  }

  return false;
}

/** Primary package name for CodeLens / hover (first resolved name or top-level). */
export function mapImportToPackageName(moduleName: string): string | null {
  const resolved = resolveImportToPackageNames(moduleName);
  if (resolved.size === 0) {
    return null;
  }
  return [...resolved][0];
}
