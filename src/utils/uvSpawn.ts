import * as path from 'path';

/** True when the executable is uv (handles `uv`, `uv.exe`, or a full path). */
export function isUvExecutable(exe: string): boolean {
  const base = path.basename(exe).toLowerCase().replace(/\.exe$/i, '');
  return base === 'uv';
}

/**
 * Prepends uv global flags required before the subcommand (e.g. `pip install`).
 * Uses the OS trust store so corporate/root CAs work on Windows.
 */
export function withUvGlobalArgs(args: string[]): string[] {
  if (args[0] === '--system-certs') {
    return args;
  }
  return ['--system-certs', ...args];
}
