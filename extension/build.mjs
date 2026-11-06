import { build, context } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const watch = process.argv.includes('--watch');
const proxy = process.env.GT_PROXY_BASE;
const token = process.env.GT_CLIENT_TOKEN;
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('public', 'dist', { recursive: true });
cpSync('src/popup/popup.html', 'dist/popup.html');
cpSync('src/popup/popup.css', 'dist/popup.css');

const opts = {
  entryPoints: { content: 'src/content/content.ts', background: 'src/background.ts', popup: 'src/popup/popup.ts' },
  bundle: true, outdir: 'dist', format: 'iife', target: 'chrome114', minify: !watch, sourcemap: watch ? 'inline' : false,
  define: {
    ...(proxy ? { 'globalThis.__GT_PROXY_BASE__': JSON.stringify(proxy) } : {}),
    ...(token ? { 'globalThis.__GT_CLIENT_TOKEN__': JSON.stringify(token) } : {}),
  },
  logLevel: 'info',
};
// Web demo target: same panel code as a standalone ES module (no chrome.* APIs).
const webOpts = {
  entryPoints: { 'groundtruth-panel': 'src/web/groundtruth-panel.ts' },
  bundle: true, outdir: 'dist-web', format: 'esm', target: 'es2020', minify: !watch, sourcemap: false, logLevel: 'info',
};
rmSync('dist-web', { recursive: true, force: true });
if (watch) {
  const ctx = await context(opts); await ctx.watch();
  const wctx = await context(webOpts); await wctx.watch();
} else { await build(opts); await build(webOpts); }
