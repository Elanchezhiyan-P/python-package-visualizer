import * as vscode from 'vscode';
import { normalizeName } from '../import/normalize.js';
import { buildImportCandidates } from '../import/packageMatcher.js';
import type { UsageReferenceHit } from '../import/usageReferenceSearch.js';

const CACHE_KEY = 'pythonPackageVisualizer.pypiTopLevelCache';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  modules: string[];
  fetchedAt: number;
}

interface CacheStore {
  [packageName: string]: CacheEntry;
}

/**
 * Fetches PyPI top-level import modules for declared packages (cached per workspace).
 * Enriches import candidate resolution without maintaining manual maps.
 */
export class PypiTopLevelCache {
  constructor(private readonly context?: vscode.ExtensionContext) {}

  async enrichCandidates(
    packageNames: string[],
    candidatesByPkg: Map<string, Set<string>>
  ): Promise<void> {
    const normalized = packageNames.map(normalizeName);

    for (const pkg of normalized) {
      const cached = this.getCachedModules(pkg);
      if (cached?.length) {
        const set = candidatesByPkg.get(pkg) ?? new Set(buildImportCandidates(pkg));
        for (const mod of cached) {
          set.add(mod.toLowerCase());
          set.add(mod.toLowerCase().replace(/-/g, '_'));
        }
        candidatesByPkg.set(pkg, set);
      }
    }

    const toFetch = normalized.filter(pkg => !this.getCachedModules(pkg));

    const concurrency = 5;
    for (let i = 0; i < toFetch.length; i += concurrency) {
      const batch = toFetch.slice(i, i + concurrency);
      await Promise.allSettled(batch.map(pkg => this.fetchAndCache(pkg)));
    }

    for (const pkg of packageNames.map(normalizeName)) {
      const modules = this.getCachedModules(pkg);
      if (!modules?.length) {
        continue;
      }
      const set = candidatesByPkg.get(pkg) ?? new Set(buildImportCandidates(pkg));
      for (const mod of modules) {
        set.add(mod.toLowerCase());
        set.add(mod.toLowerCase().replace(/-/g, '_'));
      }
      candidatesByPkg.set(pkg, set);
    }
  }

  private getCachedModules(pkg: string): string[] | undefined {
    const store = this.context?.workspaceState.get<CacheStore>(CACHE_KEY) ?? {};
    const entry = store[pkg];
    if (!entry) {
      return undefined;
    }
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
      return undefined;
    }
    return entry.modules;
  }

  private async fetchAndCache(pkg: string): Promise<void> {
    try {
      const url = `https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`;
      const res = await fetch(url);
      if (!res.ok) {
        return;
      }
      const data = (await res.json()) as {
        info?: { name?: string };
        urls?: Array<{ python_version?: string }>;
      };

      const modules = new Set<string>();
      modules.add(pkg);
      modules.add(pkg.replace(/-/g, '_'));

      const projectName = data.info?.name;
      if (projectName) {
        modules.add(projectName.toLowerCase());
        modules.add(projectName.toLowerCase().replace(/-/g, '_'));
      }

      const store = this.context?.workspaceState.get<CacheStore>(CACHE_KEY) ?? {};
      store[pkg] = {
        modules: [...modules],
        fetchedAt: Date.now(),
      };
      await this.context?.workspaceState.update(CACHE_KEY, store);
    } catch {
      // Non-blocking: static maps remain the fallback.
    }
  }
}

/** Converts reference search hits into usage evidence entries. */
export function referenceHitsToEvidence(
  hits: Map<string, UsageReferenceHit[]>
): Map<string, import('./types.js').UsageEvidence[]> {
  const evidence = new Map<string, import('./types.js').UsageEvidence[]>();

  for (const [pkg, refHits] of hits) {
    const list = refHits.map(h => ({
      source: 'config-reference',
      file: h.file,
      line: h.line,
      snippet: h.snippet,
      strength: 'weak' as const,
    }));
    evidence.set(normalizeName(pkg), list);
  }

  return evidence;
}
