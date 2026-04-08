import * as vscode from 'vscode';
import { Logger } from '../utils/logger.js';

export interface FunctionInfo {
  name: string;
  defLine: number;
  defColumn: number;
  bodyEndLine: number;
  indent: number;
  paramCount: number;
  typedParamCount: number;
  hasReturnType: boolean;
  hasDocstring: boolean;
  complexity: number;
  lineCount: number;
  isAsync: boolean;
  params: string[];
  returnType: string;
}

/**
 * Parse all function definitions in a Python document.
 * Exported so the hover provider can reuse the same parser.
 */
export function parsePythonFunctions(document: vscode.TextDocument): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const lines = document.getText().split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(\s*)(async\s+)?def\s+([a-zA-Z_][\w]*)\s*\(([^)]*)\)(?:\s*->\s*([^:]+))?:/);
    if (!match) continue;

    const indent = match[1].length;
    const isAsync = !!match[2];
    const name = match[3];
    const paramsStr = match[4];
    const returnType = (match[5] || '').trim();
    const defColumn = line.indexOf('def ') + 4;

    // Find body end by indentation
    let bodyEnd = i;
    let firstBodyChecked = false;
    let hasDocstring = false;
    for (let j = i + 1; j < lines.length; j++) {
      const bodyLine = lines[j];
      if (!bodyLine.trim()) { bodyEnd = j; continue; }
      const bodyIndent = bodyLine.length - bodyLine.trimStart().length;
      if (bodyIndent <= indent) break;
      bodyEnd = j;
      if (!firstBodyChecked) {
        firstBodyChecked = true;
        const t = bodyLine.trim();
        if (t.startsWith('"""') || t.startsWith("'''") || t.startsWith('r"""') || t.startsWith("r'''")) {
          hasDocstring = true;
        }
      }
    }

    // Parse parameters
    const allParams = paramsStr.split(',').map(p => p.trim()).filter(Boolean);
    const params = allParams.filter(p => p !== 'self' && p !== 'cls' && !p.startsWith('*'));
    const paramCount = params.length;
    const typedParamCount = params.filter(p => p.includes(':')).length;

    // Cyclomatic complexity
    const bodyText = lines.slice(i + 1, bodyEnd + 1).join('\n');
    let complexity = 1;
    const branches = bodyText.match(/\b(if|elif|for|while|except|and|or|case)\b/g);
    if (branches) complexity += branches.length;

    functions.push({
      name,
      defLine: i,
      defColumn,
      bodyEndLine: bodyEnd,
      indent,
      paramCount,
      typedParamCount,
      hasReturnType: !!returnType,
      hasDocstring,
      complexity,
      lineCount: bodyEnd - i,
      isAsync,
      params,
      returnType,
    });
  }
  return functions;
}

export class FunctionMetricsCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(private readonly logger: Logger) {}

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const config = vscode.workspace.getConfiguration('pythonPackageVisualizer');
    const showMetrics    = config.get<boolean>('showFunctionMetrics', true);
    const showComplexity = config.get<boolean>('showComplexityWarnings', true);
    const showTypeHints  = config.get<boolean>('showTypeHintCoverage', true);
    const showDocstrings = config.get<boolean>('showDocstringWarnings', true);

    if (!showMetrics && !showComplexity && !showTypeHints && !showDocstrings) {
      return [];
    }

    const functions = parsePythonFunctions(document);
    const lenses: vscode.CodeLens[] = [];

    for (const fn of functions) {
      const range = new vscode.Range(fn.defLine, 0, fn.defLine, 0);
      const refCount = this.countReferences(document, fn.name, fn.defLine);

      // ── Primary metrics lens (split so "refs" is clickable) ────────────
      if (showMetrics) {
        let complexityLabel = 'Low';
        if (fn.complexity >= 10)      complexityLabel = 'High';
        else if (fn.complexity >= 5)  complexityLabel = 'Moderate';

        // Lines lens
        lenses.push(new vscode.CodeLens(range, {
          title: `\u{1F4CA} ${fn.lineCount} line${fn.lineCount !== 1 ? 's' : ''}`,
          tooltip: `Function body spans ${fn.lineCount} line${fn.lineCount !== 1 ? 's' : ''}`,
          command: '',
        }));

        // Refs lens — CLICKABLE → opens VS Code Find All References panel
        const refsTooltip = refCount > 0
          ? `${refCount} reference${refCount !== 1 ? 's' : ''} found in this file\n\nClick to open the References panel showing all usages in the workspace.`
          : `No references found in this file\n\nClick to search the workspace for usages.`;
        lenses.push(new vscode.CodeLens(range, {
          title: `\u{1F517} ${refCount} ref${refCount !== 1 ? 's' : ''}`,
          tooltip: refsTooltip,
          command: 'extension.findFunctionReferences',
          arguments: [{ uri: document.uri.toString(), line: fn.defLine, column: fn.defColumn, name: fn.name }],
        }));

        // Complexity lens (non-clickable info)
        lenses.push(new vscode.CodeLens(range, {
          title: `\u26A1 ${complexityLabel}${fn.isAsync ? ' \u00B7 async' : ''}`,
          tooltip: `Cyclomatic complexity: ${fn.complexity} (${complexityLabel})${fn.isAsync ? '\nAsync function' : ''}\n\nHover over the function name for a full breakdown.`,
          command: '',
        }));
      }

      // ── Complexity warning ──────────────────────────────────────────────
      if (showComplexity && fn.complexity >= 10) {
        const tooltip = `Cyclomatic complexity: ${fn.complexity} (threshold: 10)\n\n` +
          `Complexity measures the number of independent code paths through your function.\n` +
          `High complexity makes code harder to test and maintain.\n\n` +
          `How to reduce complexity:\n` +
          `  \u2022 Extract helper functions for each logical block\n` +
          `  \u2022 Use early returns instead of nested conditionals\n` +
          `  \u2022 Replace long if/elif chains with dict lookups or match statements\n` +
          `  \u2022 Split this function into smaller single-purpose functions`;

        lenses.push(new vscode.CodeLens(range, {
          title: `\u26A0\uFE0F Complexity: ${fn.complexity} (High) \u2014 Click for tips`,
          tooltip,
          command: 'extension.showComplexityHelp',
          arguments: [fn.name, fn.complexity],
        }));
      }

      // ── Type hint warning ───────────────────────────────────────────────
      if (showTypeHints && fn.paramCount > 0) {
        const missing = fn.paramCount - fn.typedParamCount;
        if (missing > 0 || !fn.hasReturnType) {
          const bits: string[] = [];
          if (missing > 0) bits.push(`${missing}/${fn.paramCount} param${missing > 1 ? 's' : ''} untyped`);
          if (!fn.hasReturnType) bits.push('no return type');

          const tooltip = `This function is missing type hints.\n\n` +
            `Type hints help:\n` +
            `  \u2022 IDE autocomplete and error detection\n` +
            `  \u2022 Static analysis tools (mypy, pyright)\n` +
            `  \u2022 Documentation \u2014 self-documenting signatures\n` +
            `  \u2022 Refactoring safety\n\n` +
            `Example:\n` +
            `  Before:  def greet(name):\n` +
            `  After:   def greet(name: str) -> str:\n\n` +
            `Click to insert type-hint template.`;

          lenses.push(new vscode.CodeLens(range, {
            title: `\u26A0\uFE0F Missing type hints (${bits.join(', ')}) \u2014 Click to fix`,
            tooltip,
            command: 'extension.addTypeHints',
            arguments: [{ uri: document.uri.toString(), defLine: fn.defLine }],
          }));
        }
      }

      // ── Docstring warning ───────────────────────────────────────────────
      if (showDocstrings && !fn.hasDocstring) {
        const tooltip = `A docstring is a string that describes what your function does.\n\n` +
          `It appears as the FIRST statement in the function body, wrapped in triple quotes.\n\n` +
          `Why docstrings matter:\n` +
          `  \u2022 Shown in IDE tooltips when the function is called\n` +
          `  \u2022 Used by help() and Python's built-in docs\n` +
          `  \u2022 Generated into API documentation by tools like Sphinx\n` +
          `  \u2022 Makes code maintainable for your team\n\n` +
          `Example:\n` +
          `  def chat(query):\n` +
          `      """Return the chatbot's answer to a user query."""\n` +
          `      ...\n\n` +
          `Click to insert a docstring template.`;

        lenses.push(new vscode.CodeLens(range, {
          title: `\u26A0\uFE0F Missing docstring \u2014 Click to add`,
          tooltip,
          command: 'extension.insertDocstring',
          arguments: [{ uri: document.uri.toString(), defLine: fn.defLine }],
        }));
      }
    }
    return lenses;
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
