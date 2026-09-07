/**
 * Dependency tree data builders for the D3 graph visualizer.
 */

const GRAPH_MAX_DEPTH = 4;

/** @returns {string} PEP 503 normalized package name */
function normalizeName(name) {
  return window.normalizePkgName ? window.normalizePkgName(name) : String(name ?? '').toLowerCase();
}

/** @param {string} name */
function isValidRequireName(name) {
  const raw = String(name ?? '').trim().toLowerCase();
  if (!raw || raw.includes('required-by') || /^requires\b/i.test(raw)) {
    return false;
  }
  const norm = normalizeName(name);
  return norm.length > 0 && !norm.includes('required-by');
}

/** @param {Array<object>} pkgs */
function sanitizePackageRequires(pkgs) {
  return (pkgs || []).map(pkg => ({
    ...pkg,
    requires: (pkg.requires || []).filter(r => r && isValidRequireName(r)),
  }));
}

/**
 * Builds a lookup map keyed by normalized package name.
 * Declared packages (allPackages) take precedence over transitive graphPackages.
 *
 * @param {Array<object>} declared
 * @param {Array<object>} transitive
 * @returns {Map<string, object>}
 */
function buildPkgLookup(declared, transitive) {
  const lookup = new Map();
  for (const pkg of transitive || []) {
    lookup.set(normalizeName(pkg.name), pkg);
  }
  for (const pkg of declared || []) {
    lookup.set(normalizeName(pkg.name), pkg);
  }
  return lookup;
}

/**
 * Resolves display status for a graph node.
 *
 * @param {object|null} pkg
 * @param {string} reqName
 * @returns {string}
 */
function resolveNodeStatus(pkg, reqName) {
  if (!pkg) {
    return 'not-installed';
  }
  if (pkg.vulnerabilities && pkg.vulnerabilities.length) {
    return 'vulnerable';
  }
  if (pkg.status === 'not-installed' || !pkg.installedVersion) {
    return 'not-installed';
  }
  return pkg.status || 'unknown';
}

/**
 * Builds a recursive dependency tree node.
 *
 * @param {string} reqName
 * @param {Map<string, object>} lookup
 * @param {number} depth
 * @param {number} maxDepth
 * @param {Set<string>} pathNorms - ancestor normalized names (cycle guard)
 * @returns {object|null}
 */
function buildReqNode(reqName, lookup, depth, maxDepth, pathNorms) {
  if (!isValidRequireName(reqName)) {
    return null;
  }

  const norm = normalizeName(reqName);
  if (pathNorms.has(norm)) {
    return null;
  }

  const pkg = lookup.get(norm) || null;
  const node = {
    name: pkg ? pkg.name : reqName,
    status: resolveNodeStatus(pkg, reqName),
    version: pkg ? (pkg.installedVersion || '') : '',
    pkg,
    children: [],
  };

  if (depth >= maxDepth) {
    return node;
  }

  const requires = pkg?.requires || [];
  const nextPath = new Set(pathNorms);
  nextPath.add(norm);

  node.children = requires
    .filter(r => r && isValidRequireName(r))
    .map(r => buildReqNode(r, lookup, depth + 1, maxDepth, nextPath))
    .filter(Boolean);

  if (!node.children.length) {
    delete node.children;
  }

  return node;
}

/**
 * Builds the full tree payload for D3 hierarchy.
 *
 * @param {Array<object>} packages
 * @param {Map<string, object>} lookup
 * @returns {object}
 */
function buildTreeData(packages, lookup) {
  return {
    name: 'Project',
    status: 'root',
    children: packages.map(pkg => {
      const rootNorm = normalizeName(pkg.name);
      const requires = pkg.requires || [];
      const pathNorms = new Set([rootNorm]);

      const children = requires
        .filter(r => r && isValidRequireName(r))
        .map(r => buildReqNode(r, lookup, 1, GRAPH_MAX_DEPTH, pathNorms))
        .filter(Boolean);

      return {
        name: pkg.name,
        status: resolveNodeStatus(pkg, pkg.name),
        version: pkg.installedVersion || '',
        pkg,
        children: children.length ? children : undefined,
      };
    }),
  };
}
