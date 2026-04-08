import * as vscode from 'vscode';
import { VersionChecker } from '../services/versionChecker.js';
import { ImportScanner } from '../modules/importScanner.js';

// API cost / model info for known LLM and AI client classes
const LLM_INFO: Record<string, { provider: string; pricing: string; speed: string; notes?: string }> = {
  'ChatGroq':     { provider: 'Groq',      pricing: 'Free tier \u00B7 ~$0.05-0.10/1M tokens', speed: 'Very fast (~300 tok/s)', notes: 'LPU-accelerated inference' },
  'ChatOpenAI':   { provider: 'OpenAI',    pricing: '~$0.50-$30/1M tokens',                  speed: 'Fast',                  notes: 'Pricing varies by model' },
  'ChatAnthropic':{ provider: 'Anthropic', pricing: '~$3-$75/1M tokens',                     speed: 'Fast',                  notes: 'Claude family models' },
  'ChatGoogleGenerativeAI': { provider: 'Google', pricing: 'Free tier \u00B7 ~$0.50-$10/1M tokens', speed: 'Fast', notes: 'Gemini models' },
  'ChatVertexAI': { provider: 'Google Vertex', pricing: '~$0.50-$10/1M tokens', speed: 'Fast' },
  'ChatCohere':   { provider: 'Cohere',    pricing: '~$0.50-$15/1M tokens',  speed: 'Fast' },
  'ChatMistralAI':{ provider: 'Mistral',   pricing: '~$0.25-$8/1M tokens',   speed: 'Fast' },
  'OpenAI':       { provider: 'OpenAI',    pricing: '~$0.50-$30/1M tokens',  speed: 'Fast' },
  'Anthropic':    { provider: 'Anthropic', pricing: '~$3-$75/1M tokens',     speed: 'Fast' },
  'AzureChatOpenAI':{ provider: 'Azure OpenAI', pricing: 'Same as OpenAI', speed: 'Fast' },
  'OllamaLLM':    { provider: 'Ollama',    pricing: 'Free (local)',          speed: 'Depends on hardware', notes: 'Runs locally' },
  'HuggingFaceHub':{ provider: 'HuggingFace', pricing: 'Free tier + paid', speed: 'Varies' },
};

// Common method/class info from popular packages
const METHOD_INFO: Record<string, { package: string; description: string }> = {
  'fitz.open':                     { package: 'PyMuPDF',   description: 'Open a PDF, XPS, EPUB, or other supported document' },
  'page.get_text':                 { package: 'PyMuPDF',   description: 'Extract text from a PDF page' },
  'CharacterTextSplitter':         { package: 'langchain', description: 'Split text into chunks by character separators' },
  'RecursiveCharacterTextSplitter':{ package: 'langchain', description: 'Recursively split text by multiple separators' },
  'TokenTextSplitter':             { package: 'langchain', description: 'Split text by token count' },
  'Document':                      { package: 'langchain', description: 'Container for text chunks with metadata' },
  'HuggingFaceEmbeddings':         { package: 'langchain-huggingface', description: 'Use HuggingFace models for text embeddings' },
  'OpenAIEmbeddings':              { package: 'langchain-openai',     description: 'Use OpenAI embeddings API' },
  'FAISS':                         { package: 'faiss-cpu / faiss-gpu', description: 'Facebook AI Similarity Search vector store' },
  'Chroma':                        { package: 'langchain-chroma',     description: 'ChromaDB vector store' },
  'Pinecone':                      { package: 'langchain-pinecone',   description: 'Pinecone vector database' },
  'RetrievalQA':                   { package: 'langchain', description: 'Question-answering chain with retrieval' },
  'ConversationalRetrievalChain':  { package: 'langchain', description: 'Multi-turn conversational QA with retrieval' },
  'PromptTemplate':                { package: 'langchain', description: 'Template for formatting prompts' },
  'LLMChain':                      { package: 'langchain', description: 'Chain that runs an LLM with a prompt template' },
};

export class ImportHoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly checker: VersionChecker,
    private readonly importScanner: ImportScanner,
  ) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | null> {
    const config = vscode.workspace.getConfiguration('pythonPackageVisualizer');
    if (!config.get<boolean>('showImportHover', true)) {
      return null;
    }

    // Find the word being hovered
    const wordRange = document.getWordRangeAtPosition(position, /[a-zA-Z_][\w.]*/);
    if (!wordRange) { return null; }
    const hoveredWord = document.getText(wordRange);

    // First check: is this directly an import line?
    const line = document.lineAt(position.line).text;
    let packageName: string | null = null;
    let symbolKind = '';

    const directImport = line.match(/^\s*(?:import|from)\s+([a-zA-Z_][\w.]*)/);
    if (directImport && line.indexOf(directImport[1]) <= position.character &&
        line.indexOf(directImport[1]) + directImport[1].length >= position.character) {
      packageName = this.importScanner.mapToPackageName(directImport[1]);
      symbolKind = 'module';
    }

    // Second check: scan the document for `from X import Y, Z` and check if hoveredWord is in the imported list
    if (!packageName) {
      const imports = this.collectImportedSymbols(document);
      const sym = imports.get(hoveredWord);
      if (sym) {
        packageName = sym.packageName;
        symbolKind = sym.kind;
      }
    }

    if (!packageName) {
      // Fallback: check if this is a method call / LLM class from a known package
      if (config.get<boolean>('showMethodCallHover', true)) {
        const fullLine = document.lineAt(position.line).text;

        // Detect LLM client classes (e.g., ChatGroq, ChatOpenAI, OpenAI, etc.)
        if (LLM_INFO[hoveredWord]) {
          const info = LLM_INFO[hoveredWord];
          const md = new vscode.MarkdownString();
          md.isTrusted = true;
          md.supportHtml = true;
          md.appendMarkdown(`### \u{1F916} ${hoveredWord}\n\n`);
          md.appendMarkdown(`**Provider:** ${info.provider}\n\n`);
          md.appendMarkdown(`\u{1F4B0} **Pricing:** ${info.pricing}\n\n`);
          md.appendMarkdown(`\u26A1 **Speed:** ${info.speed}\n\n`);
          if (info.notes) md.appendMarkdown(`\u{1F4DD} ${info.notes}\n\n`);
          md.appendMarkdown(`---\n\n*Estimated costs are approximate. Check provider docs for current pricing.*`);
          return new vscode.Hover(md, wordRange);
        }

        // Detect known method/class names from popular packages
        if (METHOD_INFO[hoveredWord]) {
          const info = METHOD_INFO[hoveredWord];
          const md = new vscode.MarkdownString();
          md.isTrusted = true;
          md.appendMarkdown(`### \u{1F4E6} ${hoveredWord}\n\n`);
          md.appendMarkdown(`**Package:** \`${info.package}\`\n\n`);
          md.appendMarkdown(`${info.description}\n`);
          return new vscode.Hover(md, wordRange);
        }

        // Detect dotted method calls like "fitz.open"
        const dotMatch = fullLine.match(new RegExp(`(\\w+)\\.${hoveredWord}\\b`));
        if (dotMatch) {
          const fullMethod = `${dotMatch[1]}.${hoveredWord}`;
          if (METHOD_INFO[fullMethod]) {
            const info = METHOD_INFO[fullMethod];
            const md = new vscode.MarkdownString();
            md.isTrusted = true;
            md.appendMarkdown(`### \u{1F4E6} ${fullMethod}\n\n`);
            md.appendMarkdown(`**Package:** \`${info.package}\`\n\n`);
            md.appendMarkdown(`${info.description}\n`);
            return new vscode.Hover(md, wordRange);
          }
        }
      }
      return null;
    }

    try {
      const result = await this.checker.checkPackage(packageName, '');
      const md = this.buildPackageCard(result, packageName, hoveredWord, symbolKind);
      return new vscode.Hover(md, wordRange);
    } catch {
      return null;
    }
  }

  /**
   * Build a minimal, clean hover card with only the essentials.
   */
  private buildPackageCard(
    result: import('../services/versionChecker.js').VersionCheckResult,
    packageName: string,
    hoveredWord: string,
    symbolKind: string,
  ): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;

    const vulnCount = result.vulnerabilities?.length ?? 0;

    // ── Status dot ──────────────────────────────────────────────────────────
    const statusIcon = vulnCount > 0
      ? '\u{1F534}'
      : result.status === 'up-to-date'
        ? '\u{1F7E2}'
        : result.status === 'update-available'
          ? '\u{1F7E1}'
          : '\u26AA';

    // ── Header: package · version · license ────────────────────────────────
    const headerBits: string[] = [`\u{1F4E6} **${result.packageName}**`];
    headerBits.push(`\`v${result.latestVersion}\``);
    if (result.license) { headerBits.push(result.license); }
    md.appendMarkdown(`#### ${headerBits.join(' \u00B7 ')}\n\n`);

    // ── Summary (short, 1 line) ─────────────────────────────────────────────
    if (result.summary) {
      const summary = result.summary.length > 100
        ? result.summary.slice(0, 97) + '...'
        : result.summary;
      md.appendMarkdown(`${summary}\n\n`);
    }

    // ── Status line: single compact row ─────────────────────────────────────
    const statusBits: string[] = [];
    if (vulnCount > 0) {
      statusBits.push(`${statusIcon} ${vulnCount} CVE${vulnCount !== 1 ? 's' : ''}`);
    } else if (result.status === 'up-to-date') {
      statusBits.push(`${statusIcon} Up to date`);
    } else if (result.status === 'update-available') {
      statusBits.push(`${statusIcon} Update available`);
    }
    if (result.pythonRequires) {
      statusBits.push(`\u{1F40D} ${result.pythonRequires}`);
    }
    const relDate = this.formatRelativeDate(result.releaseDate);
    if (relDate) {
      statusBits.push(`\u{1F4C5} ${relDate}`);
    }

    if (statusBits.length > 0) {
      md.appendMarkdown(`${statusBits.join(' \u00A0\u00B7\u00A0 ')}\n\n`);
    }

    // ── Quick Actions (compact, 2-3 max) ────────────────────────────────────
    const actions: string[] = [];
    if (result.status === 'update-available') {
      actions.push(`[\u2191 Update](command:extension.updatePackage?${encodeURIComponent(JSON.stringify(packageName))} "pip install --upgrade ${packageName}")`);
    }
    actions.push(`[\u{1F50D} Inspect](command:extension.openPackageVisualizer "Open Package Visualizer")`);
    actions.push(`[PyPI \u2197](https://pypi.org/project/${packageName}/ "View on PyPI")`);

    md.appendMarkdown(actions.join(' \u00A0\u00B7\u00A0 '));

    return md;
  }

  /** Returns human-friendly relative date like "2 days ago" or "3 months ago". */
  private formatRelativeDate(dateStr: string | undefined): string {
    if (!dateStr) { return ''; }
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) { return ''; }
    const diff = Date.now() - date.getTime();
    const days = Math.floor(diff / (24 * 60 * 60 * 1000));
    if (days < 0) { return ''; }
    if (days === 0) { return 'today'; }
    if (days === 1) { return 'yesterday'; }
    if (days < 30) { return `${days} days ago`; }
    const months = Math.floor(days / 30);
    if (months < 12) { return `${months} month${months !== 1 ? 's' : ''} ago`; }
    const years = Math.floor(days / 365);
    return `${years} year${years !== 1 ? 's' : ''} ago`;
  }

  /** Format large numbers: 3200000 → "3.2M", 45000 → "45K" */
  private formatNumber(n: number): string {
    if (n >= 1_000_000) { return (n / 1_000_000).toFixed(1) + 'M'; }
    if (n >= 1_000)     { return (n / 1_000).toFixed(1) + 'K'; }
    return String(n);
  }

  /** Scan the document and build a map of "imported symbol name → package info" */
  private collectImportedSymbols(document: vscode.TextDocument): Map<string, { packageName: string; kind: string }> {
    const map = new Map<string, { packageName: string; kind: string }>();
    for (let i = 0; i < document.lineCount; i++) {
      const text = document.lineAt(i).text;
      if (text.trim().startsWith('#')) { continue; }

      // import X (as Y)
      const importMatch = text.match(/^\s*import\s+([a-zA-Z_][\w.]*)(?:\s+as\s+([a-zA-Z_]\w*))?/);
      if (importMatch) {
        const mod = importMatch[1];
        const alias = importMatch[2];
        const pkg = this.importScanner.mapToPackageName(mod);
        if (pkg) {
          const topName = mod.split('.')[0];
          map.set(alias || topName, { packageName: pkg, kind: 'module' });
        }
        continue;
      }

      // from X import Y, Z (as W)
      const fromMatch = text.match(/^\s*from\s+([a-zA-Z_][\w.]*)\s+import\s+(.+)$/);
      if (fromMatch) {
        const mod = fromMatch[1];
        const pkg = this.importScanner.mapToPackageName(mod);
        if (!pkg) { continue; }

        // Parse the imported names list (handles parens, commas, "as")
        const importsRaw = fromMatch[2].replace(/[()]/g, '');
        const items = importsRaw.split(',').map(s => s.trim()).filter(Boolean);
        for (const item of items) {
          const parts = item.split(/\s+as\s+/);
          const name = parts[parts.length - 1].trim();
          if (name && /^[a-zA-Z_]\w*$/.test(name)) {
            map.set(name, { packageName: pkg, kind: 'symbol' });
          }
        }
      }
    }
    return map;
  }
}
