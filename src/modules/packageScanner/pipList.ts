import * as cp from 'child_process';
import type { Logger } from '../../utils/logger.js';
import { withUvGlobalArgs } from '../../utils/uvSpawn.js';
import { normalizePackageName } from './types.js';

export async function getPipInstalledVersions(
  cwd: string,
  resolveUvPath: (cwd: string) => Promise<string | null>,
  resolvePythonPath: () => string,
  logger: Logger
): Promise<Map<string, string>> {
  const uvPath = await resolveUvPath(cwd);
  const cmd = uvPath ?? resolvePythonPath();
  const args = uvPath
    ? withUvGlobalArgs(['pip', 'list', '--format=json'])
    : ['-m', 'pip', 'list', '--format=json'];

  return new Promise((resolve, reject) => {
    logger.debug(`Running: ${cmd} ${args.join(' ')}`);
    const child = cp.spawn(cmd, args, { cwd });

    let stdout = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 30_000);

    child.stdout.on('data', (data: Buffer) => { stdout += data.toString(); });

    child.on('close', (code: number | null) => {
      clearTimeout(timer);
      if (timedOut) {
        return reject(new Error('pip list timed out'));
      }
      if (code !== 0) {
        return reject(new Error(`pip list exited with code ${code}`));
      }
      try {
        const entries = JSON.parse(stdout) as Array<{ name: string; version: string }>;
        const map = new Map<string, string>();
        for (const e of entries) {
          map.set(normalizePackageName(e.name), e.version);
        }
        resolve(map);
      } catch {
        logger.warn('Failed to parse pip list output');
        resolve(new Map());
      }
    });

    child.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
