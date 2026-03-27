import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger.js';

export interface ImportScanResult {
  /** Top-level module names AND dotted sub-names for namespace packages */
  importedModules: Set<string>;
  filesScanned: number;
}

/**
 * Known namespace prefixes where we must look at 2-level dotted names
 * to identify the actual package.
 * e.g. "google.generativeai" → "google-generativeai"
 *      "azure.storage"       → "azure-storage-blob" (approx)
 */
const NAMESPACE_PREFIXES = new Set([
  'google', 'azure', 'opentelemetry', 'apache', 'aws',
]);

/**
 * Maps import name (as written in Python) → normalized pip package name.
 * Only entries where the names DIFFER are listed.
 * Keys are lowercase.
 */
const IMPORT_TO_PACKAGE: Record<string, string> = {
  // ── Google ──────────────────────────────────────────────────────────────
  'google.generativeai':          'google-generativeai',
  'google.genai':                 'google-genai',
  'google.cloud.storage':         'google-cloud-storage',
  'google.cloud.bigquery':        'google-cloud-bigquery',
  'google.cloud.firestore':       'google-cloud-firestore',
  'google.cloud.pubsub':          'google-cloud-pubsub',
  'google.cloud.aiplatform':      'google-cloud-aiplatform',
  'google.cloud.vision':          'google-cloud-vision',
  'google.cloud.translate':       'google-cloud-translate',
  'google.cloud.speech':          'google-cloud-speech',
  'google.cloud.texttospeech':    'google-cloud-texttospeech',
  'google.cloud.run':             'google-cloud-run',
  'google.cloud.secretmanager':   'google-cloud-secret-manager',
  'google.cloud.logging':         'google-cloud-logging',
  'google.cloud.monitoring':      'google-cloud-monitoring',
  'google.cloud.tasks':           'google-cloud-tasks',
  'google.auth':                  'google-auth',
  'google.oauth2':                'google-auth',
  'googleapiclient':              'google-api-python-client',
  'google_auth_oauthlib':         'google-auth-oauthlib',
  'google.protobuf':              'protobuf',
  // ── Azure ────────────────────────────────────────────────────────────────
  'azure.storage.blob':           'azure-storage-blob',
  'azure.storage.queue':          'azure-storage-queue',
  'azure.identity':               'azure-identity',
  'azure.keyvault':               'azure-keyvault-secrets',
  'azure.cosmos':                 'azure-cosmos',
  'azure.ai.textanalytics':       'azure-ai-textanalytics',
  'azure.ai.formrecognizer':      'azure-ai-formrecognizer',
  'azure.mgmt':                   'azure-mgmt-core',
  // ── OpenTelemetry ────────────────────────────────────────────────────────
  'opentelemetry.sdk':            'opentelemetry-sdk',
  'opentelemetry.api':            'opentelemetry-api',
  // ── Image / Vision ───────────────────────────────────────────────────────
  'pil':                          'pillow',
  'cv2':                          'opencv-python',
  'skimage':                      'scikit-image',
  // ── ML / AI ──────────────────────────────────────────────────────────────
  'sklearn':                      'scikit-learn',
  'xgb':                          'xgboost',
  'lgb':                          'lightgbm',
  'tf':                           'tensorflow',
  'tensorflow':                   'tensorflow',
  'keras':                        'keras',
  'torch':                        'torch',
  'torchvision':                  'torchvision',
  'torchaudio':                   'torchaudio',
  'transformers':                 'transformers',
  'diffusers':                    'diffusers',
  'openai':                       'openai',
  'anthropic':                    'anthropic',
  'langchain':                    'langchain',
  'langchain_core':               'langchain-core',
  'langchain_community':          'langchain-community',
  'langchain_openai':             'langchain-openai',
  'llama_index':                  'llama-index',
  'chromadb':                     'chromadb',
  'pinecone':                     'pinecone-client',
  'sentence_transformers':        'sentence-transformers',
  // ── Data science ─────────────────────────────────────────────────────────
  'pd':                           'pandas',
  'np':                           'numpy',
  'sp':                           'scipy',
  'plt':                          'matplotlib',
  'sns':                          'seaborn',
  'px':                           'plotly',
  'plotly':                       'plotly',
  // ── Parsing / serialisation ──────────────────────────────────────────────
  'yaml':                         'pyyaml',
  'bs4':                          'beautifulsoup4',
  'dateutil':                     'python-dateutil',
  'dotenv':                       'python-dotenv',
  'jose':                         'python-jose',
  'jwt':                          'pyjwt',
  'crypto':                       'pycryptodome',
  'cryptography':                 'cryptography',
  'openssl':                      'pyopenssl',
  // ── Web / async ──────────────────────────────────────────────────────────
  'aiohttp':                      'aiohttp',
  'httpx':                        'httpx',
  'starlette':                    'starlette',
  'fastapi':                      'fastapi',
  'uvicorn':                      'uvicorn',
  'gunicorn':                     'gunicorn',
  'flask':                        'flask',
  'django':                       'django',
  'rest_framework':               'djangorestframework',
  'celery':                       'celery',
  'redis':                        'redis',
  'websockets':                   'websockets',
  'socketio':                     'python-socketio',
  'requests':                     'requests',
  // ── PDF / documents ──────────────────────────────────────────────────────
  'fpdf':                         'fpdf2',
  'fpdf2':                        'fpdf2',
  'reportlab':                    'reportlab',
  'pdfplumber':                   'pdfplumber',
  'pdfminer':                     'pdfminer-six',
  'pypdf':                        'pypdf',
  'pypdf2':                       'pypdf2',
  'docx':                         'python-docx',
  'openpyxl':                     'openpyxl',
  'xlrd':                         'xlrd',
  'xlwt':                         'xlwt',
  // ── DB ───────────────────────────────────────────────────────────────────
  'sqlalchemy':                   'sqlalchemy',
  'alembic':                      'alembic',
  'psycopg2':                     'psycopg2-binary',
  'pymongo':                      'pymongo',
  'motor':                        'motor',
  'aiomysql':                     'aiomysql',
  'pymysql':                      'pymysql',
  // ── CLI / config ─────────────────────────────────────────────────────────
  'click':                        'click',
  'typer':                        'typer',
  'rich':                         'rich',
  'pydantic':                     'pydantic',
  'toml':                         'toml',
  'tomllib':                      'tomli',
  // ── Testing ──────────────────────────────────────────────────────────────
  'pytest':                       'pytest',
  'hypothesis':                   'hypothesis',
  'faker':                        'faker',
  // ── Cloud / infra ────────────────────────────────────────────────────────
  'boto3':                        'boto3',
  'botocore':                     'botocore',
  // ── Misc ─────────────────────────────────────────────────────────────────
  'attr':                         'attrs',
  'attrs':                        'attrs',
  'pkg_resources':                'setuptools',
  'setuptools':                   'setuptools',
  'docutils':                     'docutils',
  'pygments':                     'pygments',
  'arrow':                        'arrow',
  'pendulum':                     'pendulum',
  'humanize':                     'humanize',
  'tabulate':                     'tabulate',
  'tqdm':                         'tqdm',
  'loguru':                       'loguru',
  'structlog':                    'structlog',
};

/**
 * Packages that are NEVER imported directly in Python source.
 * Includes CLI tools AND transitive/runtime dependencies that work
 * without an explicit import statement.
 */
const NEVER_IMPORTED_PACKAGES = new Set([
  // ASGI/WSGI servers — run via CLI only
  'uvicorn', 'uvicorn-standard', 'gunicorn', 'hypercorn', 'daphne',
  // Code quality / linting CLI tools
  'black', 'isort', 'flake8', 'pylint', 'mypy', 'ruff', 'bandit',
  'pycodestyle', 'pydocstyle', 'pyflakes', 'autopep8', 'yapf',
  // Build / publish tools
  'pre-commit', 'nox', 'tox', 'twine', 'build', 'flit', 'hatch',
  'pip-tools', 'pipdeptree', 'pip-audit', 'setuptools', 'wheel',
  // FastAPI / Starlette runtime deps — used automatically, never imported by users
  'python-multipart',   // form data parsing for FastAPI
  'email-validator',    // pydantic[email] extra
  'httptools',          // uvicorn speedup
  'watchfiles',         // uvicorn --reload
  'websockets',         // uvicorn ws support (may also be imported)
  'h11',                // http/1.1 layer
  'anyio',              // async backend
  'sniffio',            // anyio helper
  'exceptiongroup',     // backport
  'typing-extensions',  // type hints backport
  'annotated-types',    // pydantic helper
  // DB drivers typically invoked by SQLAlchemy, not imported directly
  'psycopg2-binary', 'psycopg2', 'aiomysql', 'asyncpg',
  'aiosqlite', 'databases',
]);

function normalize(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

export class ImportScanner {
  constructor(private readonly logger: Logger) {}

  async scanImports(workspaceRoot: string): Promise<ImportScanResult> {
    this.logger.info(`Scanning imports in: ${workspaceRoot}`);
    const pyFiles = this.findPyFiles(workspaceRoot);
    this.logger.info(`Found ${pyFiles.length} Python files to scan`);

    const importedModules = new Set<string>();

    for (const file of pyFiles) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        this.extractImports(content, importedModules);
      } catch (err) {
        this.logger.warn(`Could not read ${file}: ${String(err)}`);
      }
    }

    this.logger.info(
      `Import scan complete: ${importedModules.size} unique modules found`
    );
    return { importedModules, filesScanned: pyFiles.length };
  }

  getUnusedPackages(
    declaredPackages: string[],
    importedModules: Set<string>
  ): Set<string> {
    // Normalize all imported modules for comparison
    const normalizedImports = new Set(
      [...importedModules].map(m => m.toLowerCase())
    );

    const unused = new Set<string>();

    for (const pkg of declaredPackages) {
      const norm = normalize(pkg);

      // These packages are never imported directly — skip them
      if (NEVER_IMPORTED_PACKAGES.has(norm)) {
        continue;
      }

      if (this.isPackageUsed(norm, normalizedImports)) {
        continue;
      }

      unused.add(norm);
    }

    return unused;
  }

  private isPackageUsed(
    normalizedPkg: string,
    normalizedImports: Set<string>
  ): boolean {
    // Candidates: all the ways this package might appear in import statements
    const candidates = new Set<string>();

    // 1. Direct name variants
    candidates.add(normalizedPkg);                          // google-generativeai
    candidates.add(normalizedPkg.replace(/-/g, '_'));       // google_generativeai
    candidates.add(normalizedPkg.replace(/-/g, ''));        // googlegenerativeai
    candidates.add(normalizedPkg.replace(/-/g, '.'));       // google.generativeai

    // 2. Check the IMPORT_TO_PACKAGE reverse map: any import name → this pkg?
    for (const [importName, pkgName] of Object.entries(IMPORT_TO_PACKAGE)) {
      if (normalize(pkgName) === normalizedPkg) {
        candidates.add(importName.toLowerCase());
        // Also add dotted parent (e.g. "google.generativeai" → "google")
        const top = importName.split('.')[0].toLowerCase();
        if (top !== importName.toLowerCase()) {
          candidates.add(top);
        }
      }
    }

    // 3. For packages like "google-generativeai", also try top-level "google"
    //    only if the full dotted name IS in imports (prevents false positives)
    const parts = normalizedPkg.split('-');
    if (parts.length >= 2 && NAMESPACE_PREFIXES.has(parts[0])) {
      // e.g. google-generativeai → look for "google.generativeai" in imports
      const dotted = parts.join('.'); // google.generativeai
      candidates.add(dotted);
    }

    for (const candidate of candidates) {
      if (normalizedImports.has(candidate)) {
        return true;
      }
      // Partial prefix match for dotted names
      // e.g. imports has "google.generativeai.types" → candidate "google.generativeai" matches
      for (const imp of normalizedImports) {
        if (imp === candidate || imp.startsWith(candidate + '.')) {
          return true;
        }
      }
    }

    return false;
  }

  private findPyFiles(root: string): string[] {
    const results: string[] = [];
    const SKIP_DIRS = new Set([
      'node_modules', '.git', '__pycache__', '.venv', 'venv',
      'env', '.env', 'dist', 'build', 'site-packages', '.tox',
      '.mypy_cache', '.pytest_cache', '.eggs',
    ]);

    const walk = (dir: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
            walk(path.join(dir, entry.name));
          }
        } else if (entry.isFile() && entry.name.endsWith('.py')) {
          results.push(path.join(dir, entry.name));
        }
      }
    };

    walk(root);
    return results;
  }

  /**
   * Extract module names from Python import statements.
   * For namespace packages (google.*, azure.*), records BOTH the
   * top-level name AND the 2-level dotted path.
   */
  private extractImports(source: string, out: Set<string>): void {
    // Strip triple-quoted strings and comments to avoid false positives
    const cleaned = source
      .replace(/"""[\s\S]*?"""/g, '""')
      .replace(/'''[\s\S]*?'''/g, "''")
      .replace(/#.*/g, '');

    for (const line of cleaned.split('\n')) {
      const trimmed = line.trim();

      // "import X" / "import X as Y" / "import X, Y"
      const importMatch = trimmed.match(/^import\s+(.+)/);
      if (importMatch) {
        for (const part of importMatch[1].split(',')) {
          const name = part.trim().split(/\s+as\s+/i)[0].trim().toLowerCase();
          this.addModuleName(name, out);
        }
        continue;
      }

      // "from X import ..." — skip relative imports (start with .)
      const fromMatch = trimmed.match(/^from\s+([^\s.][^\s]*)\s+import/);
      if (fromMatch) {
        const name = fromMatch[1].trim().toLowerCase();
        this.addModuleName(name, out);
      }
    }
  }

  /**
   * Add a module name to the set, and for namespace packages also add
   * the 2-level dotted name so we can match e.g. google-generativeai.
   */
  private addModuleName(name: string, out: Set<string>): void {
    const top = name.split('.')[0];
    if (!top || top.startsWith('_')) {
      return;
    }

    out.add(name);       // full path: google.generativeai
    out.add(top);        // top-level: google

    // For namespace packages, also add 2-level path
    if (NAMESPACE_PREFIXES.has(top) && name.includes('.')) {
      const parts = name.split('.');
      if (parts.length >= 2) {
        out.add(`${parts[0]}.${parts[1]}`); // google.generativeai
      }
      if (parts.length >= 3) {
        out.add(`${parts[0]}.${parts[1]}.${parts[2]}`); // google.cloud.storage
      }
    }
  }
}
