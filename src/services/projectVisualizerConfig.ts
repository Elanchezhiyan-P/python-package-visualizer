/**
 * Project-local Pin/Ignore config (.python-package-visualizer.json).
 * File is the source of truth; workspaceState is only a one-time migration source.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { normalizeRootPath } from '../utils/normalizeRootPath.js';

export const CONFIG_FILENAME = '.python-package-visualizer.json';
export const PINS_WORKSPACE_STATE_KEY = 'pythonPackageVisualizer.pinnedPackages';
export const IGNORED_WORKSPACE_STATE_KEY = 'pythonPackageVisualizer.ignoredUpdates';
export const WRITE_IN_FLIGHT_GRACE_MS = 150;

export interface ProjectVisualizerPinEntry {
  version: string;
  ignoredLatest: string;
}

export interface ProjectVisualizerFile {
  version: 1;
  pins: Record<string, ProjectVisualizerPinEntry>;
  ignoredUpdates: Record<string, string>;
}

type PinStore = Record<string, Record<string, ProjectVisualizerPinEntry>>;
type IgnoreStore = Record<string, Record<string, string>>;

const cache = new Map<string, ProjectVisualizerFile>();
const corruptRoots = new Set<string>();
const warnedCorruptRoots = new Set<string>();
const writeQueues = new Map<string, Promise<void>>();
const inFlightUntil = new Map<string, number>();
const inFlightTimers = new Map<string, ReturnType<typeof setTimeout>>();

function emptyFile(): ProjectVisualizerFile {
  return { version: 1, pins: {}, ignoredUpdates: {} };
}

function normalizePackageName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

/** Same key as the legacy workspaceState maps (not a filesystem path). */
export function workspaceStateRootKey(workspaceRoot: string): string {
  return workspaceRoot.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function configFilePath(workspaceRoot: string): string {
  return path.join(workspaceRoot, CONFIG_FILENAME);
}

function cacheKey(workspaceRoot: string): string {
  return normalizeRootPath(workspaceRoot);
}

function cloneFile(data: ProjectVisualizerFile): ProjectVisualizerFile {
  const pins: Record<string, ProjectVisualizerPinEntry> = {};
  for (const [name, entry] of Object.entries(data.pins)) {
    pins[name] = { version: entry.version, ignoredLatest: entry.ignoredLatest };
  }
  return {
    version: 1,
    pins,
    ignoredUpdates: { ...data.ignoredUpdates },
  };
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.keys(record).sort().map(key => [key, record[key]]));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizePinMap(pins: Record<string, unknown>): Record<string, ProjectVisualizerPinEntry> {
  const out: Record<string, ProjectVisualizerPinEntry> = {};
  for (const [name, value] of Object.entries(pins)) {
    if (!isPlainObject(value) || typeof value.version !== 'string' || !value.version) {
      throw new Error(`invalid pin entry for "${name}"`);
    }
    out[normalizePackageName(name)] = {
      version: value.version,
      ignoredLatest: typeof value.ignoredLatest === 'string' ? value.ignoredLatest : '',
    };
  }
  return out;
}

function normalizeIgnoreMap(ignored: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(ignored)) {
    if (typeof value !== 'string' || !value) {
      throw new Error(`invalid ignoredUpdates entry for "${name}"`);
    }
    out[normalizePackageName(name)] = value;
  }
  return out;
}

function parseConfig(raw: string): ProjectVisualizerFile {
  const data: unknown = JSON.parse(raw);
  if (!isPlainObject(data)) {
    throw new Error('root is not an object');
  }
  if (data.version !== undefined && data.version !== 1) {
    throw new Error(`unsupported version ${String(data.version)}`);
  }
  const pins = data.pins === undefined ? {} : data.pins;
  const ignoredUpdates = data.ignoredUpdates === undefined ? {} : data.ignoredUpdates;
  if (!isPlainObject(pins)) {
    throw new Error('pins is not an object');
  }
  if (!isPlainObject(ignoredUpdates)) {
    throw new Error('ignoredUpdates is not an object');
  }
  return {
    version: 1,
    pins: normalizePinMap(pins),
    ignoredUpdates: normalizeIgnoreMap(ignoredUpdates),
  };
}

function warnCorrupt(workspaceRoot: string, reason: string): void {
  const key = cacheKey(workspaceRoot);
  if (warnedCorruptRoots.has(key)) {
    return;
  }
  warnedCorruptRoots.add(key);
  const filePath = configFilePath(workspaceRoot);
  void vscode.window.showWarningMessage(
    `Python Package Visualizer: could not read ${filePath} (${reason}). ` +
      'Pin/Ignore changes will not be saved until the file is fixed.'
  );
}

function markCorrupt(workspaceRoot: string, reason: string): void {
  corruptRoots.add(cacheKey(workspaceRoot));
  cache.delete(cacheKey(workspaceRoot));
  warnCorrupt(workspaceRoot, reason);
}

function seedFromWorkspaceState(
  context: vscode.ExtensionContext,
  workspaceRoot: string
): ProjectVisualizerFile {
  const key = workspaceStateRootKey(workspaceRoot);
  const pins = context.workspaceState.get<PinStore>(PINS_WORKSPACE_STATE_KEY)?.[key] ?? {};
  const ignored = context.workspaceState.get<IgnoreStore>(IGNORED_WORKSPACE_STATE_KEY)?.[key] ?? {};
  return {
    version: 1,
    pins: normalizePinMap(pins as Record<string, unknown>),
    ignoredUpdates: normalizeIgnoreMap(ignored as Record<string, unknown>),
  };
}

function isEmpty(data: ProjectVisualizerFile): boolean {
  return Object.keys(data.pins).length === 0 && Object.keys(data.ignoredUpdates).length === 0;
}

function beginWriteInFlight(workspaceRoot: string): void {
  const key = cacheKey(workspaceRoot);
  const existing = inFlightTimers.get(key);
  if (existing) {
    clearTimeout(existing);
    inFlightTimers.delete(key);
  }
  inFlightUntil.set(key, Number.POSITIVE_INFINITY);
}

function endWriteInFlight(workspaceRoot: string): void {
  const key = cacheKey(workspaceRoot);
  inFlightUntil.set(key, Date.now() + WRITE_IN_FLIGHT_GRACE_MS);
  const timer = setTimeout(() => {
    inFlightUntil.delete(key);
    inFlightTimers.delete(key);
  }, WRITE_IN_FLIGHT_GRACE_MS);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  inFlightTimers.set(key, timer);
}

async function removeRootFromStore(
  context: vscode.ExtensionContext,
  storeKey: string,
  rootKey: string
): Promise<void> {
  const store = context.workspaceState.get<Record<string, unknown>>(storeKey) ?? {};
  if (!(rootKey in store)) {
    return;
  }
  const next = { ...store };
  delete next[rootKey];
  await context.workspaceState.update(storeKey, next);
}

async function clearWorkspaceStateRoot(
  context: vscode.ExtensionContext,
  workspaceRoot: string
): Promise<void> {
  const key = workspaceStateRootKey(workspaceRoot);
  await removeRootFromStore(context, PINS_WORKSPACE_STATE_KEY, key);
  await removeRootFromStore(context, IGNORED_WORKSPACE_STATE_KEY, key);
}

function persistToDisk(workspaceRoot: string, data: ProjectVisualizerFile): void {
  const filePath = configFilePath(workspaceRoot);
  const key = cacheKey(workspaceRoot);
  if (isEmpty(data)) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    cache.delete(key);
    return;
  }
  const toWrite: ProjectVisualizerFile = {
    version: 1,
    pins: sortRecord(data.pins),
    ignoredUpdates: sortRecord(data.ignoredUpdates),
  };
  fs.writeFileSync(filePath, `${JSON.stringify(toWrite, null, 2)}\n`, 'utf-8');
  cache.set(key, cloneFile(toWrite));
}

export function load(
  context: vscode.ExtensionContext,
  workspaceRoot: string
): ProjectVisualizerFile {
  const key = cacheKey(workspaceRoot);
  if (corruptRoots.has(key)) {
    return emptyFile();
  }
  const cached = cache.get(key);
  if (cached) {
    return cloneFile(cached);
  }

  const filePath = configFilePath(workspaceRoot);
  if (fs.existsSync(filePath)) {
    try {
      const parsed = parseConfig(fs.readFileSync(filePath, 'utf-8'));
      cache.set(key, parsed);
      return cloneFile(parsed);
    } catch (err) {
      markCorrupt(workspaceRoot, err instanceof Error ? err.message : String(err));
      return emptyFile();
    }
  }

  try {
    const seeded = seedFromWorkspaceState(context, workspaceRoot);
    cache.set(key, seeded);
    return cloneFile(seeded);
  } catch {
    const seeded = emptyFile();
    cache.set(key, seeded);
    return cloneFile(seeded);
  }
}

export async function update(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  mutator: (data: ProjectVisualizerFile) => void
): Promise<void> {
  const key = cacheKey(workspaceRoot);
  if (corruptRoots.has(key)) {
    warnCorrupt(workspaceRoot, 'file is malformed');
    return;
  }

  const previous = writeQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => persistUpdate(context, workspaceRoot, mutator));
  writeQueues.set(key, next.then(() => undefined, () => undefined));
  await next;
}

async function persistUpdate(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  mutator: (data: ProjectVisualizerFile) => void
): Promise<void> {
  const key = cacheKey(workspaceRoot);
  if (corruptRoots.has(key)) {
    warnCorrupt(workspaceRoot, 'file is malformed');
    return;
  }

  beginWriteInFlight(workspaceRoot);
  try {
    const data = load(context, workspaceRoot);
    if (corruptRoots.has(key)) {
      return;
    }
    const hadFile = fs.existsSync(configFilePath(workspaceRoot));
    mutator(data);
    persistToDisk(workspaceRoot, data);
    if (!hadFile || isEmpty(data)) {
      await clearWorkspaceStateRoot(context, workspaceRoot);
    }
  } finally {
    endWriteInFlight(workspaceRoot);
  }
}

export function invalidateCache(workspaceRoot: string): void {
  const key = cacheKey(workspaceRoot);
  cache.delete(key);
  corruptRoots.delete(key);
  warnedCorruptRoots.delete(key);
}

export function isWriteInFlight(workspaceRoot: string): boolean {
  const until = inFlightUntil.get(cacheKey(workspaceRoot));
  if (until === undefined) {
    return false;
  }
  if (until === Number.POSITIVE_INFINITY) {
    return true;
  }
  return Date.now() < until;
}

/** Write seeded workspaceState to the file when the file is absent and state is non-empty. */
export async function migrateFromWorkspaceState(
  context: vscode.ExtensionContext,
  workspaceRoot: string
): Promise<void> {
  if (!workspaceRoot) {
    return;
  }
  if (fs.existsSync(configFilePath(workspaceRoot))) {
    await clearWorkspaceStateRoot(context, workspaceRoot);
    return;
  }
  const seeded = load(context, workspaceRoot);
  if (isEmpty(seeded)) {
    return;
  }
  await update(context, workspaceRoot, () => undefined);
}

export function resetProjectVisualizerConfigForTests(): void {
  cache.clear();
  corruptRoots.clear();
  warnedCorruptRoots.clear();
  writeQueues.clear();
  inFlightUntil.clear();
  for (const timer of inFlightTimers.values()) {
    clearTimeout(timer);
  }
  inFlightTimers.clear();
}
