import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger.js';

export class RequirementsSync {
  constructor(private readonly logger: Logger) {}

  /**
   * Remove a package entry from its requirements file entirely.
   * Returns true if the line was found and removed.
   */
  async removePackage(
    workspaceRoot: string,
    packageName: string,
    sourceFile: string
  ): Promise<boolean> {
    const filePath = path.join(workspaceRoot, sourceFile);
    if (!fs.existsSync(filePath)) { return false; }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const namePattern = packageName.replace(/[-_.]/g, '[-_.]');
      const regex = new RegExp(
        `^\\s*(${namePattern}(?:\\[.*?\\])?)\\s*([=!<>~^].*)?\\s*$`,
        'i'
      );

      const filtered = lines.filter(line => {
        const stripped = line.trim();
        if (stripped.startsWith('#') || stripped === '') { return true; }
        return !regex.test(stripped);
      });

      if (filtered.length !== lines.length) {
        // Remove trailing blank lines left by the deletion
        while (filtered.length > 0 && filtered[filtered.length - 1].trim() === '') {
          filtered.pop();
        }
        fs.writeFileSync(filePath, filtered.join('\n') + '\n', 'utf-8');
        this.logger.info(`Removed ${packageName} from ${sourceFile}`);
        return true;
      }
    } catch (err) {
      this.logger.error(`Failed to remove package from requirements: ${String(err)}`);
    }
    return false;
  }

  /**
   * After updating/rolling back a package, update its version pin
   * in the requirements file it came from.
   */
  async syncVersion(
    workspaceRoot: string,
    packageName: string,
    newVersion: string,
    sourceFile: string  // e.g. "requirements.txt"
  ): Promise<boolean> {
    const filePath = path.join(workspaceRoot, sourceFile);
    if (!fs.existsSync(filePath)) { return false; }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      let changed = false;

      const updatedLines = lines.map(line => {
        const stripped = line.trim();
        if (stripped.startsWith('#') || stripped === '') { return line; }

        // Match: package-name[extras]operator version
        const namePattern = packageName.replace(/[-_.]/g, '[-_.]');
        const regex = new RegExp(
          `^(${namePattern}(?:\\[.*?\\])?)\\s*([=!<>~^]+.*)$`,
          'i'
        );
        const match = stripped.match(regex);
        if (match) {
          changed = true;
          const extras = match[1].includes('[') ? match[1].slice(match[1].indexOf('[')) : '';
          const pkgBase = packageName;
          return `${pkgBase}${extras}==${newVersion}`;
        }
        // Also match bare package name with no version specifier
        const bareRegex = new RegExp(`^(${namePattern}(?:\\[.*?\\])?)\\s*$`, 'i');
        if (stripped.match(bareRegex)) {
          changed = true;
          return `${packageName}==${newVersion}`;
        }
        return line;
      });

      if (changed) {
        fs.writeFileSync(filePath, updatedLines.join('\n'), 'utf-8');
        this.logger.info(`Synced ${packageName}==${newVersion} in ${sourceFile}`);
        return true;
      }
    } catch (err) {
      this.logger.error(`Failed to sync requirements: ${String(err)}`);
    }
    return false;
  }
}
