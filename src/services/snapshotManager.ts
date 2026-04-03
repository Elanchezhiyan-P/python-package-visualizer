import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger.js';

export interface Snapshot {
  id: string;
  name: string;
  createdAt: string;
  packages: Record<string, string>; // name → installedVersion
}

type SnapshotFile = Snapshot[];

export class SnapshotManager {
  private readonly storageDir: string;

  constructor(
    storageDir: string,
    private readonly logger: Logger
  ) {
    this.storageDir = storageDir;
    this.ensureDir();
  }

  takeSnapshot(workspaceRoot: string, name: string, packages: Array<{ name: string; installedVersion: string }>): void {
    const data = this.readFile(workspaceRoot);
    const snapshot: Snapshot = {
      id: String(Date.now()),
      name,
      createdAt: new Date().toISOString(),
      packages: Object.fromEntries(
        packages
          .filter(p => p.installedVersion)
          .map(p => [p.name, p.installedVersion])
      ),
    };
    data.unshift(snapshot);
    this.writeFile(workspaceRoot, data);
    this.logger.info(`Snapshot "${name}" saved with ${Object.keys(snapshot.packages).length} packages`);
  }

  listSnapshots(workspaceRoot: string): Snapshot[] {
    return this.readFile(workspaceRoot);
  }

  getSnapshot(workspaceRoot: string, id: string): Snapshot | null {
    return this.readFile(workspaceRoot).find(s => s.id === id) ?? null;
  }

  deleteSnapshot(workspaceRoot: string, id: string): void {
    const data = this.readFile(workspaceRoot).filter(s => s.id !== id);
    this.writeFile(workspaceRoot, data);
    this.logger.info(`Snapshot ${id} deleted`);
  }

  private getFilePath(workspaceRoot: string): string {
    const hash = this.hashPath(workspaceRoot);
    return path.join(this.storageDir, `snapshots-${hash}.json`);
  }

  private readFile(workspaceRoot: string): SnapshotFile {
    const filePath = this.getFilePath(workspaceRoot);
    try {
      if (!fs.existsSync(filePath)) { return []; }
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as SnapshotFile;
    } catch (err) {
      this.logger.warn(`Failed to read snapshots: ${String(err)}`);
      return [];
    }
  }

  private writeFile(workspaceRoot: string, data: SnapshotFile): void {
    const filePath = this.getFilePath(workspaceRoot);
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      this.logger.error(`Failed to write snapshots: ${String(err)}`);
    }
  }

  private ensureDir(): void {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
      }
    } catch (err) {
      this.logger.error(`Failed to create storage dir: ${String(err)}`);
    }
  }

  private hashPath(str: string): string {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h) ^ str.charCodeAt(i);
      h = h >>> 0;
    }
    return h.toString(16);
  }
}
