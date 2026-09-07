import type { Logger } from '../../src/utils/logger.js';

/** No-op logger for unit tests that require a Logger instance. */
export const stubLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  show: () => {},
} as unknown as Logger;
