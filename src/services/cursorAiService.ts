import * as vscode from 'vscode';
import { detectIde } from '../utils/ideDetector.js';
import type { PackageDisplayData } from '../ui/webviewTypes.js';
import type { UsageReferenceHit } from '../modules/import/usageReferenceSearch.js';

export interface CursorAiCapabilities {
  isCursor: boolean;
  ideName: string;
  canOpenChat: boolean;
  enabled: boolean;
  useAutoModel: boolean;
}

export interface UnusedAnalysisContext {
  workspaceRoot: string;
  packages: PackageDisplayData[];
  importedModules: string[];
  filesScanned: number;
  referenceHits: Map<string, UsageReferenceHit[]>;
}

/** Cursor maps "Auto" to model id `default` in composer model config. */
const CURSOR_AUTO_MODEL_CONFIG = {
  modelName: 'default',
  selectedModels: [{ modelId: 'default', parameters: [] as [] }],
} as const;

const CURSOR_CHAT_COMMANDS = [
  'composer.createNew',
  'composer.newAgentChat',
  'aichat.show-ai-chat',
  'workbench.action.chat.open',
] as const;

/**
 * Integrates with Cursor Agent chat for AI-assisted unused-package verification.
 * Falls back to VS Code chat when available outside Cursor.
 */
export class CursorAiService {
  async getCapabilities(): Promise<CursorAiCapabilities> {
    const ide = detectIde();
    const config = vscode.workspace.getConfiguration('pythonPackageVisualizer');
    const enabled = config.get<boolean>('cursorAiAnalysis', true);
    const useAutoModel = config.get<boolean>('cursorAiUseAutoModel', true);
    const commands = await vscode.commands.getCommands(true);
    const canOpenChat = CURSOR_CHAT_COMMANDS.some(cmd => commands.includes(cmd));

    return {
      isCursor: ide.isCursor,
      ideName: ide.displayName,
      canOpenChat,
      enabled: enabled && (ide.isCursor || canOpenChat),
      useAutoModel,
    };
  }

  buildUnusedAnalysisPrompt(ctx: UnusedAnalysisContext): string {
    const unused = ctx.packages.filter(p => !p.isUsed);
    const usedSample = ctx.importedModules.slice(0, 40).join(', ');

    const packageBlocks = unused.map(pkg => {
      const norm = pkg.name.toLowerCase();
      const refs = ctx.referenceHits.get(norm) ?? [];
      const refLines = refs.length
        ? refs.map(r => `  - ${r.file}:${r.line} → ${r.snippet}`).join('\n')
        : '  - (no references in config/scripts)';

      return [
        `### ${pkg.name}`,
        `- Installed: ${pkg.installedVersion || 'n/a'}`,
        `- Source: ${pkg.source || 'n/a'}`,
        `- Static confidence unused: ${pkg.unusedConfidence ?? 100}%`,
        `- Reasons: ${(pkg.unusedReasons ?? []).join(', ') || 'none'}`,
        `- Non-import references found:`,
        refLines,
      ].join('\n');
    }).join('\n\n');

    return [
      '# Python Package Visualizer — Unused Package AI Review',
      '',
      'Please analyze whether these **uncertain** declared dependencies are truly unused in this workspace.',
      'Packages already marked as likely unused were excluded — they were detected deterministically.',
      'Search the codebase for: direct imports, dynamic imports (`importlib`), CLI invocations,',
      'pytest plugins, FastAPI/Starlette runtime deps, Dockerfile/CI references, and pyproject scripts.',
      '',
      `Workspace: ${ctx.workspaceRoot}`,
      `Python files scanned: ${ctx.filesScanned}`,
      `Sample detected imports: ${usedSample || '(none)'}`,
      '',
      'For each package, respond with:',
      '1. **Verdict**: USED | UNUSED | UNCERTAIN',
      '2. **Evidence**: file paths or usage pattern',
      '3. **Safe to remove?**: yes / no / only after manual check',
      '',
      '---',
      '',
      packageBlocks || '(no unused packages flagged)',
      '',
      '---',
      '',
      'Prioritize false positives — if a package might be needed, say UNCERTAIN rather than UNUSED.',
      '',
      'After your review, return to the **Python Package Visualizer** → **Unused Packages** tab',
      'and click **Apply removals** to remove packages you marked as UNUSED (snapshot + confirmation).',
    ].join('\n');
  }

  async openAnalysisChat(prompt: string): Promise<void> {
    const caps = await this.getCapabilities();
    if (!caps.enabled) {
      throw new Error('Cursor AI analysis is disabled in settings.');
    }
    if (!caps.canOpenChat) {
      throw new Error(
        caps.isCursor
          ? 'Cursor chat commands are not available in this version.'
          : 'AI chat is only available when running inside Cursor (or VS Code with chat enabled).'
      );
    }

    const commands = await vscode.commands.getCommands(true);
    const commandSet = new Set(commands);

    if (caps.isCursor) {
      const opened = await this.openCursorAgentChat(prompt, commandSet, caps.useAutoModel);
      if (opened) {
        return;
      }
    }

    const originalClipboard = await vscode.env.clipboard.readText();

    try {
      if (commandSet.has('workbench.action.chat.open')) {
        await vscode.commands.executeCommand('workbench.action.chat.open', prompt);
        return;
      }

      await vscode.env.clipboard.writeText(prompt);

      if (commandSet.has('composer.newAgentChat')) {
        await vscode.commands.executeCommand('composer.newAgentChat');
      } else if (commandSet.has('aichat.show-ai-chat')) {
        await vscode.commands.executeCommand('aichat.show-ai-chat');
      } else {
        throw new Error('No compatible chat command found.');
      }

      await delay(400);
      await vscode.commands.executeCommand('editor.action.clipboardPasteAction');

      void vscode.window.showInformationMessage(
        'Analysis prompt sent to Cursor Agent. Review the suggestions before removing packages.'
      );
    } finally {
      await vscode.env.clipboard.writeText(originalClipboard);
    }
  }

  /**
   * Opens a new Agent chat in Cursor with the prompt prefilled.
   * When enabled, selects the Auto model (`default`) for the new composer.
   */
  private async openCursorAgentChat(
    prompt: string,
    commands: Set<string>,
    useAutoModel: boolean
  ): Promise<boolean> {
    if (commands.has('composer.createNew')) {
      await vscode.commands.executeCommand(
        'composer.createNew',
        buildCursorAgentCreateOptions(prompt, useAutoModel)
      );
      return true;
    }

    if (commands.has('composer.startComposerPrompt')) {
      await vscode.commands.executeCommand('composer.startComposerPrompt', prompt);
      return true;
    }

    if (commands.has('workbench.action.chat.open')) {
      await vscode.commands.executeCommand('workbench.action.chat.open', prompt);
      return true;
    }

    return false;
  }
}

function buildCursorAgentCreateOptions(prompt: string, useAutoModel: boolean) {
  const partialState: Record<string, unknown> = {
    unifiedMode: 'agent',
    text: prompt,
    richText: prompt,
  };

  if (useAutoModel) {
    partialState.modelConfig = { ...CURSOR_AUTO_MODEL_CONFIG };
  }

  return {
    unifiedMode: 'agent',
    openInNewTab: true,
    partialState,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
