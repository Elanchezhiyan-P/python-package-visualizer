/**
 * Targeted test runner: pass grep pattern and optional file substring as CLI args.
 * Usage: node out-test/test/runGrepTests.js "removePackage" requirementsSync
 */
import { run } from './suite/index.js';

async function main(): Promise<void> {
  const grep = process.argv[2];
  const testFile = process.argv[3];

  if (grep) {
    process.env.MOCHA_GREP = grep;
  }
  if (testFile) {
    process.env.MOCHA_TEST_FILE = testFile;
  }

  if (!grep && !testFile) {
    console.error('Usage: runGrepTests.js <grep-pattern> [test-file-substring]');
    process.exit(1);
  }

  await run();
}

void main().catch(err => {
  console.error(err);
  process.exit(1);
});
