import * as vscode from 'vscode';
import { parsePythonFunctions, FunctionInfo } from './functionCodeLens.js';

/**
 * Quick-fix commands invoked from the function CodeLens warnings.
 * Registered once in extension.ts.
 */
export function registerFunctionQuickFixes(context: vscode.ExtensionContext): void {
  // ── Insert docstring template ─────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('extension.insertDocstring', async (args: { uri: string; defLine: number }) => {
      const doc = await openDoc(args.uri);
      if (!doc) return;
      const fn = findFunction(doc, args.defLine);
      if (!fn) return;

      const indentStr = ' '.repeat(fn.indent + 4);
      const docstring = buildDocstring(fn, indentStr);

      const editor = await vscode.window.showTextDocument(doc);
      const insertPosition = new vscode.Position(fn.defLine + 1, 0);
      await editor.edit(edit => {
        edit.insert(insertPosition, docstring);
      });

      // Position cursor inside the summary line
      const summaryLine = fn.defLine + 1;
      const cursorPos = new vscode.Position(summaryLine, indentStr.length + 3);
      editor.selection = new vscode.Selection(cursorPos, cursorPos);
    })
  );

  // ── Add type hints template ───────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('extension.addTypeHints', async (args: { uri: string; defLine: number }) => {
      const doc = await openDoc(args.uri);
      if (!doc) return;
      const fn = findFunction(doc, args.defLine);
      if (!fn) return;

      const lineText = doc.lineAt(fn.defLine).text;

      // Build a typed version of the signature.
      const typedParams = fn.params.map(p => {
        const [rawName, maybeDefault] = p.split('=').map(s => s.trim());
        const nameOnly = rawName.split(':')[0].trim();
        const alreadyTyped = rawName.includes(':');
        if (alreadyTyped) return p;
        const suggested = guessType(nameOnly);
        return maybeDefault !== undefined
          ? `${nameOnly}: ${suggested} = ${maybeDefault}`
          : `${nameOnly}: ${suggested}`;
      });

      // Rebuild the function signature keeping original self/cls/*args
      const allOriginalParams = lineText.match(/\(([^)]*)\)/)?.[1] ?? '';
      const allParts = allOriginalParams.split(',').map(p => p.trim()).filter(Boolean);
      let typedIdx = 0;
      const rebuilt = allParts.map(p => {
        if (p === 'self' || p === 'cls' || p.startsWith('*')) return p;
        return typedParams[typedIdx++] ?? p;
      });

      const returnType = fn.hasReturnType ? fn.returnType : 'Any';
      const asyncPart = fn.isAsync ? 'async ' : '';
      const indentStr = ' '.repeat(fn.indent);
      const newLine = `${indentStr}${asyncPart}def ${fn.name}(${rebuilt.join(', ')}) -> ${returnType}:`;

      const editor = await vscode.window.showTextDocument(doc);
      await editor.edit(edit => {
        edit.replace(
          new vscode.Range(fn.defLine, 0, fn.defLine, lineText.length),
          newLine
        );
      });

      // Show a reminder to import typing hints if needed
      if (returnType === 'Any') {
        void vscode.window.showInformationMessage(
          `Added type-hint placeholders to ${fn.name}(). Remember to import from typing: from typing import Any`
        );
      }
    })
  );

  // ── Find function references ──────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('extension.findFunctionReferences', async (args: { uri: string; line: number; column: number; name: string }) => {
      try {
        const doc = await openDoc(args.uri);
        if (!doc) return;
        const editor = await vscode.window.showTextDocument(doc);

        // Position cursor on the function name so references panel works
        const pos = new vscode.Position(args.line, args.column);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);

        // Trigger VS Code's built-in "Find All References" panel
        await vscode.commands.executeCommand('editor.action.referenceSearch.trigger');
      } catch (err) {
        void vscode.window.showErrorMessage(`Could not find references: ${String(err)}`);
      }
    })
  );

  // ── Show complexity help ──────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('extension.showComplexityHelp', (name: string, complexity: number) => {
      void vscode.window.showInformationMessage(
        `Function '${name}' has cyclomatic complexity of ${complexity} (high). ` +
        `Consider splitting it into smaller functions, using early returns, or replacing if/elif chains with dict lookups or match statements.`,
        'Learn more'
      ).then(choice => {
        if (choice === 'Learn more') {
          void vscode.env.openExternal(vscode.Uri.parse('https://en.wikipedia.org/wiki/Cyclomatic_complexity'));
        }
      });
    })
  );
}

async function openDoc(uriStr: string): Promise<vscode.TextDocument | null> {
  try {
    return await vscode.workspace.openTextDocument(vscode.Uri.parse(uriStr));
  } catch {
    return null;
  }
}

function findFunction(doc: vscode.TextDocument, defLine: number): FunctionInfo | undefined {
  const functions = parsePythonFunctions(doc);
  return functions.find(f => f.defLine === defLine);
}

function buildDocstring(fn: FunctionInfo, indent: string): string {
  const lines: string[] = [];
  lines.push(`${indent}"""Brief description of ${fn.name}.`);
  lines.push(``);
  if (fn.params.length > 0) {
    lines.push(`${indent}Args:`);
    for (const p of fn.params) {
      const name = p.split(/[:=]/)[0].trim();
      lines.push(`${indent}    ${name}: Description of ${name}.`);
    }
    lines.push(``);
  }
  if (fn.hasReturnType || fn.lineCount > 1) {
    lines.push(`${indent}Returns:`);
    lines.push(`${indent}    Description of the return value.`);
    lines.push(``);
  }
  lines.push(`${indent}"""`);
  return lines.join('\n') + '\n';
}

function guessType(paramName: string): string {
  const lower = paramName.toLowerCase();
  if (/count|num|idx|index|size|length|len|age|year|month|day|limit|offset/.test(lower)) return 'int';
  if (/price|amount|rate|ratio|pct|percent|score|ratio|weight|distance/.test(lower)) return 'float';
  if (/is_|has_|should_|can_|enabled|disabled|flag|valid|active/.test(lower)) return 'bool';
  if (/name|text|msg|message|str|path|url|id|email|title|query|key|token/.test(lower)) return 'str';
  if (/list|items|results|rows|values|arr/.test(lower)) return 'list';
  if (/dict|map|config|opts|options|params|kwargs/.test(lower)) return 'dict';
  return 'Any';
}
