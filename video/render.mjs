// Renders the film frame by frame in headless Chromium.
//   node render.mjs stills 0 3.2 ...         a few frames by time, into stills/
//   node render.mjs frames [fps] [workers]   every frame, into frames/, on parallel workers
// The film reaches into the prototype inside its iframes, which file:// forbids, so the repo is served over http.
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const EXE = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1194/chrome-mac/headless_shell');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PAGE = `http://127.0.0.1:${server.address().port}/video/film.html`;

async function open() {
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto(PAGE, { waitUntil: 'load' });
  await page.evaluate(() => window.__film.ready);
  return { browser, page };
}
async function shot(page, t, file) {
  await page.evaluate(t => { window.__film.frame(t); return new Promise(r => requestAnimationFrame(() => r())); }, t);
  await page.screenshot({ path: file, type: 'png' });
}

const [mode, ...args] = process.argv.slice(2);
if (mode === 'stills') {
  const dir = path.join(HERE, 'stills'); fs.mkdirSync(dir, { recursive: true });
  const { browser, page } = await open();
  for (const a of args) await shot(page, +a, path.join(dir, `t${(+a).toFixed(2).padStart(5, '0')}.png`));
  console.log('dur', await page.evaluate(() => window.__film.dur));
  await browser.close();
} else if (mode === 'frames') {
  const fps = +(args[0] || 60), workers = +(args[1] || 6);
  const dir = path.join(HERE, 'frames'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const probe = await open(); const dur = await probe.page.evaluate(() => window.__film.dur); await probe.browser.close();
  const n = Math.round(dur * fps), t0 = Date.now();
  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    const { browser, page } = await open();
    for (let i = Math.floor(n * w / workers); i < Math.floor(n * (w + 1) / workers); i++)
      await shot(page, i / fps, path.join(dir, `f${String(i).padStart(5, '0')}.png`));
    await browser.close();
  }));
  console.log(`${n} frames at ${fps} fps in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
server.close();
