// esbuild.js — bundler for the VS Code extension host
const esbuild = require('esbuild');

const isWatch = process.argv.includes('--watch');
const isProduction = process.argv.includes('--production');

const baseConfig = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: !isProduction,
  minify: isProduction,
  // 'vscode' is injected by the extension host at runtime — never bundle it
  external: ['vscode'],
  logLevel: 'info',
};

async function build() {
  const ctx = await esbuild.context({
    ...baseConfig,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
  });

  if (isWatch) {
    await ctx.watch();
    console.log('[esbuild] Watching for changes...');
    // keep the process alive
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log('[esbuild] Build complete →  dist/extension.js');
  }
}

build().catch(err => {
  console.error('[esbuild] Build failed:', err);
  process.exit(1);
});
