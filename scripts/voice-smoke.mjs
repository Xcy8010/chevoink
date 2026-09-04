// Local-only production-bundle smoke server. Run: node scripts/voice-smoke.mjs
import { build } from 'vite';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'output/voice-assets/smoke-dist');
await build({
  configFile: false, root, publicDir: false,
  build: { outDir: dist, emptyOutDir: true, lib: { entry: path.join(root, 'src/features/studio/agent/voice/speech-engine.ts'), formats: ['es'], fileName: () => 'engine.mjs' } },
  worker: { format: 'iife' },
});
const html = '<!doctype html><meta charset="utf-8"><title>Local offline SenseVoice smoke</title><pre id="result">Ready</pre><script type="module" src="/smoke-client.mjs"></script>';
const csp = "default-src 'none'; script-src 'self'; worker-src 'self'; connect-src 'self'; style-src 'none'; base-uri 'none'";
createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    let base = dist;
    let relative = pathname.slice(1);
    if (pathname === '/') { response.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': csp }); response.end(html); return; }
    if (pathname === '/smoke-client.mjs') { base = path.join(root, 'scripts'); relative = 'voice-smoke-client.mjs'; }
    else if (pathname === '/voice-capture-worklet.js') { base = path.join(root, 'public'); relative = 'voice-capture-worklet.js'; }
    else if (pathname.startsWith('/voice/')) { base = path.join(root, 'public'); }
    else if (pathname.startsWith('/fixtures/')) { base = path.join(root, 'output/voice-assets'); relative = pathname.slice('/fixtures/'.length); }
    const filename = path.resolve(base, relative);
    if (!filename.startsWith(path.resolve(base) + path.sep)) throw new Error('Invalid path');
    const bytes = await readFile(filename);
    const type = /\.m?js$/.test(filename) ? 'text/javascript' : filename.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Content-Length': bytes.length, 'Cache-Control': 'max-age=3600' };
    if (/voice-worker-.*\.js$/.test(filename)) headers['Content-Security-Policy'] = "default-src 'none'; script-src 'self' blob: 'wasm-unsafe-eval'; connect-src 'self'";
    response.writeHead(200, headers); response.end(bytes);
  } catch { response.writeHead(404); response.end('Not found'); }
}).listen(5187, '127.0.0.1', () => console.log('Local smoke: http://127.0.0.1:5187 (no COOP/COEP; strict page CSP, separate worker CSP)'));
