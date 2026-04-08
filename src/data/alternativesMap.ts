export interface PackageAlternative {
  name: string;
  reason: string;
  url?: string;
}

export const PACKAGE_ALTERNATIVES: Record<string, PackageAlternative[]> = {
  'requests': [
    { name: 'httpx', reason: 'HTTP/2 support, async/await, ~2x faster', url: 'https://www.python-httpx.org/' },
    { name: 'aiohttp', reason: 'Fully async, great for high-throughput scraping', url: 'https://docs.aiohttp.org/' },
  ],
  'flask': [
    { name: 'fastapi', reason: '3x faster, built-in OpenAPI docs, type hints', url: 'https://fastapi.tiangolo.com/' },
    { name: 'litestar', reason: 'Modern, fast, great DX', url: 'https://litestar.dev/' },
  ],
  'urllib3': [
    { name: 'httpx', reason: 'Higher-level, async support', url: 'https://www.python-httpx.org/' },
  ],
  'pip': [
    { name: 'uv', reason: '10-100x faster, written in Rust by Astral', url: 'https://github.com/astral-sh/uv' },
    { name: 'poetry', reason: 'Better dependency resolution and lock files', url: 'https://python-poetry.org/' },
  ],
  'virtualenv': [
    { name: 'uv', reason: 'Built-in venv support, much faster', url: 'https://github.com/astral-sh/uv' },
  ],
  'setuptools': [
    { name: 'hatchling', reason: 'Modern PEP 517 build backend', url: 'https://hatch.pypa.io/' },
  ],
  'black': [
    { name: 'ruff', reason: '100x faster, includes formatting + linting', url: 'https://docs.astral.sh/ruff/' },
  ],
  'flake8': [
    { name: 'ruff', reason: 'All linters in one, written in Rust', url: 'https://docs.astral.sh/ruff/' },
  ],
  'pylint': [
    { name: 'ruff', reason: 'Faster, easier config', url: 'https://docs.astral.sh/ruff/' },
  ],
  'isort': [
    { name: 'ruff', reason: 'Includes import sorting', url: 'https://docs.astral.sh/ruff/' },
  ],
  'mypy': [
    { name: 'pyright', reason: 'Faster, used by Microsoft Pylance', url: 'https://github.com/microsoft/pyright' },
  ],
  'pytest-cov': [
    { name: 'coverage', reason: 'Direct coverage tool, more configurable' },
  ],
  'pandas': [
    { name: 'polars', reason: '10-100x faster, written in Rust, lazy evaluation', url: 'https://pola.rs/' },
  ],
  'numpy': [
    { name: 'jax', reason: 'GPU acceleration, autodiff', url: 'https://jax.readthedocs.io/' },
  ],
  'pickle': [
    { name: 'msgpack', reason: 'Cross-language, faster, more compact' },
    { name: 'orjson', reason: 'Fastest JSON library for Python', url: 'https://github.com/ijl/orjson' },
  ],
  'json': [
    { name: 'orjson', reason: '10x faster JSON serialization', url: 'https://github.com/ijl/orjson' },
  ],
  'celery': [
    { name: 'dramatiq', reason: 'Simpler API, less buggy', url: 'https://dramatiq.io/' },
    { name: 'arq', reason: 'Async-first, Redis-based', url: 'https://arq-docs.helpmanual.io/' },
  ],
  'sqlalchemy': [
    { name: 'sqlmodel', reason: 'Built on SQLAlchemy + Pydantic, by FastAPI author', url: 'https://sqlmodel.tiangolo.com/' },
  ],
  'beautifulsoup4': [
    { name: 'selectolax', reason: 'Much faster HTML parsing', url: 'https://github.com/rushter/selectolax' },
  ],
  'pillow': [
    { name: 'pillow-simd', reason: 'SIMD-accelerated drop-in replacement' },
  ],
};

export function getAlternatives(packageName: string): PackageAlternative[] {
  return PACKAGE_ALTERNATIVES[packageName.toLowerCase()] || [];
}
