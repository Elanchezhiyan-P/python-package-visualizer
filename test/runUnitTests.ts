/**
 * Runs the Mocha suite in Node without @vscode/test-electron.
 * Used for fast targeted runs (sabotage cycle) and c8 coverage measurement.
 */
import * as path from 'path';
import { run } from './suite/index.js';

async function main(): Promise<void> {
  try {
    await run();
  } catch (err) {
    console.error('Unit tests failed:', err);
    process.exit(1);
  }
}

void main();
