import * as vscode from 'vscode';

export type IdeType = 'cursor' | 'vscode' | 'windsurf' | 'unknown';

export interface IdeInfo {
  type: IdeType;
  displayName: string;
  isCursor: boolean;
}

/** Detects whether the extension runs inside Cursor, VS Code, or another fork. */
export function detectIde(): IdeInfo {
  const appName = vscode.env.appName.toLowerCase();
  const hasCursorEnv = Boolean(
    process.env.CURSOR_TRACE_ID ||
    process.env.CURSOR_CHANNEL ||
    process.env.CURSOR_EXTENSION_HOST_ROLE
  );
  const extensionsPath = (process.env.VSCODE_EXTENSIONS ?? '').toLowerCase();
  const isCursorPath = extensionsPath.includes('cursor');

  if (appName.includes('cursor') || hasCursorEnv || isCursorPath) {
    return { type: 'cursor', displayName: 'Cursor', isCursor: true };
  }
  if (appName.includes('windsurf')) {
    return { type: 'windsurf', displayName: 'Windsurf', isCursor: false };
  }
  if (appName.includes('visual studio code') || appName.includes('code')) {
    return { type: 'vscode', displayName: 'VS Code', isCursor: false };
  }
  return { type: 'unknown', displayName: vscode.env.appName, isCursor: false };
}
