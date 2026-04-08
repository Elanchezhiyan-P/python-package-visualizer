import * as vscode from 'vscode';
import { parsePythonFunctions, FunctionInfo } from './functionCodeLens.js';

/**
 * Hover provider that shows detailed information when hovering over a Python
 * function definition. Explains metrics, warnings, and how to fix issues.
 */
export class FunctionHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | null {
    const config = vscode.workspace.getConfiguration('pythonPackageVisualizer');
    if (!config.get<boolean>('showFunctionMetrics', true) &&
        !config.get<boolean>('showComplexityWarnings', true) &&
        !config.get<boolean>('showTypeHintCoverage', true) &&
        !config.get<boolean>('showDocstringWarnings', true)) {
      return null;
    }

    // Find the function whose def line is at the hovered position
    const functions = parsePythonFunctions(document);
    const fn = functions.find(f => f.defLine === position.line);
    if (!fn) return null;

    // Only trigger when hovering over the function NAME (not random text on the line)
    const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_][\w]*/);
    if (!wordRange) return null;
    const hoveredWord = document.getText(wordRange);
    if (hoveredWord !== fn.name) return null;

    const refCount = this.countReferences(document, fn.name, fn.defLine);

    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;

    // ── Header ──────────────────────────────────────────────────────────────
    const asyncPrefix = fn.isAsync ? 'async ' : '';
    md.appendMarkdown(`### \u{1F4CA} ${asyncPrefix}\`${fn.name}()\`\n\n`);

    // ── Metrics ─────────────────────────────────────────────────────────────
    let complexityLabel = 'Low';
    let complexityEmoji = '\u{1F7E2}'; // green circle
    if (fn.complexity >= 10)      { complexityLabel = 'High';     complexityEmoji = '\u{1F534}'; }
    else if (fn.complexity >= 5)  { complexityLabel = 'Moderate'; complexityEmoji = '\u{1F7E1}'; }

    md.appendMarkdown(`| Metric | Value |\n`);
    md.appendMarkdown(`|---|---|\n`);
    md.appendMarkdown(`| Lines | ${fn.lineCount} |\n`);
    md.appendMarkdown(`| Parameters | ${fn.paramCount} |\n`);
    md.appendMarkdown(`| Typed parameters | ${fn.typedParamCount} / ${fn.paramCount} |\n`);
    md.appendMarkdown(`| Return type | ${fn.hasReturnType ? `\`${fn.returnType}\`` : 'None declared'} |\n`);
    md.appendMarkdown(`| Has docstring | ${fn.hasDocstring ? '\u2705 Yes' : '\u274C No'} |\n`);
    md.appendMarkdown(`| Cyclomatic complexity | ${complexityEmoji} ${fn.complexity} (${complexityLabel}) |\n`);
    md.appendMarkdown(`| References in file | ${refCount} |\n`);
    md.appendMarkdown(`| Async | ${fn.isAsync ? '\u2705 Yes' : 'No'} |\n\n`);

    // ── Warnings & explanations ─────────────────────────────────────────────
    const warnings: string[] = [];

    if (fn.complexity >= 10) {
      warnings.push(
        `**\u26A0\uFE0F High complexity (${fn.complexity})**\n\n` +
        `Cyclomatic complexity counts the number of independent paths through your function. ` +
        `A value \u2265 10 is considered high and makes the function harder to test and maintain.\n\n` +
        `**How to reduce it:**\n` +
        `- Extract helper functions for distinct logical blocks\n` +
        `- Use early \`return\` instead of deep nesting\n` +
        `- Replace long \`if/elif\` chains with dict lookups or \`match\` statements\n` +
        `- Split this function into smaller single-purpose functions`
      );
    }

    if (fn.paramCount > 0) {
      const missingTypes = fn.paramCount - fn.typedParamCount;
      if (missingTypes > 0 || !fn.hasReturnType) {
        const paramsExample = fn.params.map(p => {
          const name = p.split(/[:=]/)[0].trim();
          return `${name}: str`;
        }).join(', ');

        warnings.push(
          `**\u26A0\uFE0F Missing type hints**\n\n` +
          `${missingTypes > 0 ? `${missingTypes} of ${fn.paramCount} parameter${missingTypes > 1 ? 's are' : ' is'} missing type hints.\n` : ''}` +
          `${!fn.hasReturnType ? `No return type declared.\n` : ''}` +
          `\n**Why type hints matter:**\n` +
          `- Enable IDE autocomplete and error detection\n` +
          `- Used by static analyzers (mypy, pyright)\n` +
          `- Self-documenting \u2014 no need to guess types\n` +
          `- Safer refactoring\n\n` +
          `**Example:**\n` +
          `\`\`\`python\n` +
          `# Before\n` +
          `def ${fn.name}(${fn.params.map(p => p.split(/[:=]/)[0].trim()).join(', ')}):\n` +
          `    ...\n\n` +
          `# After\n` +
          `def ${fn.name}(${paramsExample}) -> str:\n` +
          `    ...\n` +
          `\`\`\``
        );
      }
    }

    if (!fn.hasDocstring) {
      const docstringExample = this.buildDocstringExample(fn);
      warnings.push(
        `**\u26A0\uFE0F Missing docstring**\n\n` +
        `A docstring describes what the function does. It's the first statement in the function body, ` +
        `wrapped in triple quotes (\`"""\`).\n\n` +
        `**Why docstrings matter:**\n` +
        `- Shown in IDE tooltips when the function is called\n` +
        `- Used by \`help()\` and Python's built-in documentation\n` +
        `- Generated into API docs by tools like Sphinx and pdoc\n` +
        `- Makes code maintainable for your team\n\n` +
        `**Example:**\n` +
        `\`\`\`python\n${docstringExample}\`\`\``
      );
    }

    if (warnings.length > 0) {
      md.appendMarkdown(`---\n\n`);
      md.appendMarkdown(`### \u{1F4A1} Issues & Fixes\n\n`);
      md.appendMarkdown(warnings.join('\n\n---\n\n'));
      md.appendMarkdown(`\n\n---\n\n`);
      md.appendMarkdown(`*Click the warnings above the \`def\` line to auto-insert templates.*`);
    } else {
      md.appendMarkdown(`---\n\n\u2705 **This function looks great!** It has type hints, a docstring, and reasonable complexity.`);
    }

    return new vscode.Hover(md, wordRange);
  }

  private buildDocstringExample(fn: FunctionInfo): string {
    const lines: string[] = [];
    lines.push(`def ${fn.name}(${fn.params.join(', ')}):`);
    lines.push(`    """Brief one-line description of what ${fn.name} does.`);
    lines.push(``);
    if (fn.params.length > 0) {
      lines.push(`    Args:`);
      for (const p of fn.params) {
        const name = p.split(/[:=]/)[0].trim();
        lines.push(`        ${name}: Description of ${name}.`);
      }
      lines.push(``);
    }
    lines.push(`    Returns:`);
    lines.push(`        Description of the return value.`);
    lines.push(`    """`);
    lines.push(`    ...`);
    return lines.join('\n') + '\n';
  }

  private countReferences(document: vscode.TextDocument, name: string, defLine: number): number {
    const text = document.getText();
    const regex = new RegExp(`\\b${name}\\s*\\(`, 'g');
    let count = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const matchLine = document.positionAt(match.index).line;
      if (matchLine !== defLine) count++;
    }
    return count;
  }
}
