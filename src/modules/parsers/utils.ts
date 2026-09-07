import * as fs from 'fs';

export type DepFileEncoding = 'utf8' | 'utf16le';

export interface DepFileContent {
  content: string;
  encoding: DepFileEncoding;
}

/**
 * Reads a dependency manifest file, handling UTF-8/UTF-16 encodings common on Windows.
 */
export function readDependencyFileContent(filePath: string): DepFileContent {
  const rawBuf = fs.readFileSync(filePath);
  if (rawBuf[0] === 0xFF && rawBuf[1] === 0xFE) {
    return {
      content: rawBuf.toString('utf16le').replace(/^\uFEFF/, ''),
      encoding: 'utf16le',
    };
  }
  if (rawBuf[0] === 0xFE && rawBuf[1] === 0xFF) {
    const swapped = Buffer.alloc(rawBuf.length);
    for (let i = 0; i < rawBuf.length - 1; i += 2) {
      swapped[i] = rawBuf[i + 1];
      swapped[i + 1] = rawBuf[i];
    }
    return {
      content: swapped.toString('utf16le').replace(/^\uFEFF/, ''),
      encoding: 'utf16le',
    };
  }

  let content = rawBuf.toString('utf-8').replace(/^\uFEFF/, '');
  if (content.includes('\x00')) {
    content = content.replace(/\x00/g, '');
  }
  return { content, encoding: 'utf8' };
}

/**
 * Writes a dependency manifest file, preserving the original encoding when possible.
 */
export function writeDependencyFileContent(
  filePath: string,
  content: string,
  encoding: DepFileEncoding
): void {
  if (encoding === 'utf16le') {
    fs.writeFileSync(filePath, '\uFEFF' + content, 'utf16le');
    return;
  }
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * Normalizes Python package names to ensure consistent comparisons.
 * Delimiter variation (dashes vs underscores vs dots) and case differences
 * frequently cause duplicate keys or missing matches in dependency tools.
 * 
 * @param name The raw Python package name.
 * @returns The PEP 503 normalized package name.
 */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

/**
 * Maps a file name to a dependency group.
 * Group designations help categorize packages for targeted installations
 * (e.g., skipping development packages in production environments).
 * 
 * @param filename The base name of the file being processed.
 * @returns The identified dependency group.
 */
export function getGroupFromFileName(filename: string): 'main' | 'dev' | 'test' | 'docs' | 'lint' {
  const name = filename.toLowerCase();
  if (name.includes('dev')) { return 'dev'; }
  if (name.includes('test')) { return 'test'; }
  if (name.includes('docs') || name.includes('doc')) { return 'docs'; }
  if (name.includes('lint')) { return 'lint'; }
  return 'main';
}

/**
 * Maps a file name to an execution environment.
 * Environments specify the target context (e.g., testing or local development)
 * where the dependencies are intended to run.
 * 
 * @param filename The base name of the file being processed.
 * @returns The identified execution environment.
 */
export function getEnvironmentFromFileName(filename: string): 'main' | 'dev' | 'test' | 'prod' {
  const name = filename.toLowerCase();
  if (name.includes('dev')) { return 'dev'; }
  if (name.includes('test')) { return 'test'; }
  if (name.includes('prod')) { return 'prod'; }
  return 'main';
}

/**
 * Resolves a dictionary key/section name from TOML/setup.py configuration files to a dependency group.
 * Allows arbitrary nested configurations to align with standard categorizations.
 * 
 * @param key The configuration key or section name.
 * @returns The mapped dependency group.
 */
export function keyToGroup(key: string): 'main' | 'dev' | 'test' | 'docs' | 'lint' | 'optional' {
  const k = key.toLowerCase();
  if (k.includes('dev')) { return 'dev'; }
  if (k.includes('test')) { return 'test'; }
  if (k.includes('docs') || k.includes('doc')) { return 'docs'; }
  if (k.includes('lint')) { return 'lint'; }
  return 'optional';
}

/**
 * Resolves a dictionary key/section name from TOML/setup.py configuration files to an execution environment.
 * Facilitates matching specific dependency profiles to correct environments.
 * 
 * @param key The configuration key or section name.
 * @returns The mapped execution environment.
 */
export function keyToEnvironment(key: string): 'main' | 'dev' | 'test' | 'prod' {
  const k = key.toLowerCase();
  if (k.includes('dev')) { return 'dev'; }
  if (k.includes('test')) { return 'test'; }
  if (k.includes('prod')) { return 'prod'; }
  return 'main';
}
