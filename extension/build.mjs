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
// 3D card: extension page + MapLibre CSP worker (MV3: no remote code, no blob workers).
const MAPLIBRE_WORKER = 'node_modules/maplibre-gl/dist/maplibre-gl-csp-worker.js';
cpSync('src/context3d/map3d.html', 'dist/map3d.html');
cpSync(MAPLIBRE_WORKER, 'dist/maplibre-gl-csp-worker.js');

const opts = {
  entryPoints: { content: 'src/content/content.ts', background: 'src/background.ts', popup: 'src/popup/popup.ts', map3d: 'src/context3d/frame.ts' },
  bundle: true, outdir: 'dist', format: 'iife', target: 'chrome114', minify: !watch, sourcemap: watch ? 'inline' : false,
  define: {
    ...(proxy ? { 'globalThis.__GT_PROXY_BASE__': JSON.stringify(proxy) } : {}),
    ...(token ? { 'globalThis.__GT_CLIENT_TOKEN__': JSON.stringify(token) } : {}),
  },
  loader: { '.css': 'text' },
  logLevel: 'info',
};
// Web demo target: same panel code as a standalone ES module (no chrome.* APIs).
const webOpts = {
  entryPoints: { 'groundtruth-panel': 'src/web/groundtruth-panel.ts', 'groundtruth-map3d': 'src/web/map3d-entry.ts' },
  bundle: true, outdir: 'dist-web', format: 'esm', target: 'es2020', minify: !watch, sourcemap: false, loader: { '.css': 'text' }, logLevel: 'info',
};
rmSync('dist-web', { recursive: true, force: true });
mkdirSync('dist-web', { recursive: true });
cpSync(MAPLIBRE_WORKER, 'dist-web/maplibre-gl-csp-worker.js');
if (watch) {
  const ctx = await context(opts); await ctx.watch();
  const wctx = await context(webOpts); await wctx.watch();
} else { await build(opts); await build(webOpts); }
