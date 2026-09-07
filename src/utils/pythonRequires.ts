/**
 * Parses Requires-Python constraint strings against a current interpreter version.
 */

function parseVersion(v: string): [number, number] {
  const match = v.match(/(\d+)\.(\d+)/);
  return match ? [parseInt(match[1], 10), parseInt(match[2], 10)] : [0, 0];
}

/**
 * Returns true when currentPython satisfies the Requires-Python expression
 * (comma-separated >=, <=, ==, <, >, != constraints).
 */
export function checkPythonRequires(requiresPython: string, currentPython: string): boolean {
  const [currentMajor, currentMinor] = parseVersion(currentPython);
  const current = currentMajor * 100 + currentMinor;

  const constraints = requiresPython.split(',').map(c => c.trim());
  for (const constraint of constraints) {
    if (constraint.match(/^>=/)) {
      const [reqMajor, reqMinor] = parseVersion(constraint);
      const required = reqMajor * 100 + reqMinor;
      if (current < required) {
        return false;
      }
    } else if (constraint.match(/^<=/)) {
      const [reqMajor, reqMinor] = parseVersion(constraint);
      const required = reqMajor * 100 + reqMinor;
      if (current > required) {
        return false;
      }
    } else if (constraint.match(/^==/)) {
      const [reqMajor, reqMinor] = parseVersion(constraint);
      const required = reqMajor * 100 + reqMinor;
      if (current !== required) {
        return false;
      }
    } else if (constraint.match(/^</)) {
      const [reqMajor, reqMinor] = parseVersion(constraint);
      const required = reqMajor * 100 + reqMinor;
      if (current >= required) {
        return false;
      }
    } else if (constraint.match(/^>/)) {
      const [reqMajor, reqMinor] = parseVersion(constraint);
      const required = reqMajor * 100 + reqMinor;
      if (current <= required) {
        return false;
      }
    } else if (constraint.match(/^!=/)) {
      const [reqMajor, reqMinor] = parseVersion(constraint);
      const required = reqMajor * 100 + reqMinor;
      if (current === required) {
        return false;
      }
    }
  }

  return true;
}
