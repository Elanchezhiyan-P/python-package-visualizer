/**
 * Known namespace prefixes where we must look at 2-level dotted names
 * to identify the actual package.
 * e.g. "google.generativeai" → "google-generativeai"
 *      "azure.storage"       → "azure-storage-blob" (approx)
 */
export const NAMESPACE_PREFIXES = new Set([
  'google', 'azure', 'opentelemetry', 'apache', 'aws',
]);

/**
 * Python standard library modules that should never be mapped
 * to a pip package.
 */
export const STDLIB_MODULES = new Set([
  'os','sys','re','json','math','random','time','datetime','collections','itertools',
  'functools','typing','abc','asyncio','pathlib','io','subprocess','threading',
  'multiprocessing','queue','socket','urllib','http','email','xml','html','csv',
  'logging','warnings','copy','pickle','struct','array','bisect','heapq','enum',
  'string','textwrap','unicodedata','base64','hashlib','hmac','secrets','uuid',
  'tempfile','shutil','glob','fnmatch','linecache','stat','filecmp','codecs',
  'argparse','getopt','platform','traceback','gc','inspect','types','dis','ast',
  'token','keyword','tokenize','operator','contextlib','dataclasses','weakref',
  'concurrent','sqlite3','zipfile','tarfile','gzip','zlib','bz2','lzma',
  '__future__','builtins','site','runpy','importlib','pkgutil','zipimport',
  'configparser','statistics','decimal','fractions','numbers','cmath',
  'ctypes','mmap','select','signal','errno','os.path','posixpath','ntpath',
  'shlex','readline','rlcompleter','code','codeop','test','unittest','doctest',
]);

/**
 * Maps import name (as written in Python) → normalized pip package name.
 * Only entries where the names DIFFER are listed.
 * Keys are lowercase.
 */
export const IMPORT_TO_PACKAGE: Record<string, string> = {
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
  'langchain_anthropic':          'langchain-anthropic',
  'langchain_google_genai':       'langchain-google-genai',
  'langchain_huggingface':        'langchain-huggingface',
  'langchain_chroma':             'langchain-chroma',
  'langchain_pinecone':           'langchain-pinecone',
  'langchain_text_splitters':     'langchain-text-splitters',
  'langgraph':                    'langgraph',
  'llama_index':                  'llama-index',
  'chromadb':                     'chromadb',
  'pinecone':                     'pinecone-client',
  'sentence_transformers':        'sentence-transformers',
  'huggingface_hub':              'huggingface-hub',
  'datasets':                     'datasets',
  'tokenizers':                   'tokenizers',
  'safetensors':                  'safetensors',
  'onnxruntime':                  'onnxruntime',
  'fitz':                         'pymupdf',
  'pymupdf':                      'pymupdf',
  'IPython':                      'ipython',
  'ipython':                      'ipython',
  'lxml':                         'lxml',
  'magic':                        'python-magic',
  'serial':                       'pyserial',
  'usb':                          'pyusb',
  'usb.core':                     'pyusb',
  'ruamel':                       'ruamel-yaml',
  'ruamel.yaml':                  'ruamel-yaml',
  'passlib':                      'passlib',
  'stripe':                       'stripe',
  'twilio':                       'twilio',
  'slack_sdk':                    'slack-sdk',
  'slack':                        'slack-sdk',
  'telegram':                     'python-telegram-bot',
  'paho':                         'paho-mqtt',
  'paho.mqtt':                    'paho-mqtt',
  'watchdog':                     'watchdog',
  'schedule':                     'schedule',
  'apscheduler':                  'apscheduler',
  'streamlit':                    'streamlit',
  'gradio':                       'gradio',
  'wandb':                        'wandb',
  'mlflow':                       'mlflow',
  'shapely':                      'shapely',
  'geopandas':                    'geopandas',
  'folium':                       'folium',
  'dash':                         'dash',
  'bokeh':                        'bokeh',
  'altair':                       'altair',
  'posthog':                      'posthog',
  'sentry_sdk':                   'sentry-sdk',
  'bson':                         'pymongo',
  'gridfs':                       'pymongo',
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
  // ── Django ecosystem ─────────────────────────────────────────────────────
  'corsheaders':                  'django-cors-headers',
  'localflavor':                  'django-localflavor',
  'phonenumber_field':            'django-phonenumber-field',
  'phonenumbers':                 'phonenumbers',
  'rest_framework_simplejwt':     'djangorestframework-simplejwt',
  'drf_spectacular':              'drf-spectacular',
  'guardian':                     'django-guardian',
  'weasyprint':                   'weasyprint',
  'stdnum':                       'python-stdnum',
  'social_django':                'social-auth-app-django',
  'social_core':                  'social-auth-core',
  'cities_light':                 'django-cities-light',
  'autoslug':                     'django-autoslug',
  'djoser':                       'djoser',
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
export const NEVER_IMPORTED_PACKAGES = new Set([
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
  // Testing / coverage CLI tools
  'pytest-cov', 'pytest-asyncio', 'pytest-mock', 'pytest-xdist', 'pytest-timeout',
  'pytest-django',
  'coverage', 'coveralls',
  // Django / typing stubs — loaded via config, not imported
  'django-stubs', 'django-stubs-ext', 'djangorestframework-stubs',
  'types-pyyaml',
  // DB drivers typically invoked by SQLAlchemy, not imported directly
  'psycopg2-binary', 'psycopg2', 'aiomysql', 'asyncpg',
  'aiosqlite', 'databases',
]);

/**
 * Packages that expose the same top-level import module under different PyPI names.
 * Key: normalized pip package → alternate packages sharing the same import module.
 */
export const PACKAGE_MODULE_ALIASES: Record<string, string[]> = {
  'phonenumberslite': ['phonenumbers'],
  'phonenumbers': ['phonenumberslite'],
};
