import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

export async function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 10_000,
  });

  const grep = process.env.MOCHA_GREP;
  if (grep) {
    mocha.grep(grep);
  }

  const testsRoot = path.resolve(__dirname, '.');
  let files = await glob('**/*.test.js', { cwd: testsRoot });

  const testFile = process.env.MOCHA_TEST_FILE;
  if (testFile) {
    files = files.filter(f => f.includes(testFile));
    if (files.length === 0) {
      throw new Error(`No test files match MOCHA_TEST_FILE="${testFile}"`);
    }
  }

  files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

  return new Promise((resolve, reject) => {
    try {
      mocha.run(failures => {
        if (failures > 0) {
          reject(new Error(`${failures} test(s) failed`));
        } else {
          resolve();
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}
