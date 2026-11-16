import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { resolve, sep, extname, join } from 'node:path';

const dist = resolve('dist');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
};
const server = createServer((request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); }
  catch { response.writeHead(400); response.end(); return; }
  const filename = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const destination = resolve(dist, filename);
  if (!destination.startsWith(dist + sep) && destination !== join(dist, 'index.html')) {
    response.writeHead(403); response.end(); return;
  }
  try {
    if (statSync(destination).isFile()) {
      response.writeHead(200, { 'Content-Type': types[extname(destination)] || 'application/octet-stream' });
      response.end(readFileSync(destination));
      return;
    }
  } catch { /* GitHub Pages serves 404.html when the requested file does not exist. */ }
  response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(readFileSync(resolve(dist, '404.html')));
});

let browser;
try {
  const port = await new Promise((resolvePort, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolvePort(server.address().port));
  });
  const origin = 'http://127.0.0.1:' + port;
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const paths = [
    '/upscale?utm_source=chatgpt.com',
    '/compress?from=direct',
    '/details',
    '/세부페이지',
    '/upscale/?utm_source=bookmark#models',
  ];
  for (const path of paths) {
    const page = await browser.newPage();
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    await page.goto(origin + path, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const expected = new URL(path, origin);
    const canonical = expected.pathname === '/' ? '/' : expected.pathname.replace(/\/+$/, '');
    const after = await page.waitForFunction(
      ({ path, query, hash }) => {
        return window.location.pathname === path && window.location.search === query &&
          window.location.hash === hash && document.querySelector('#root')?.children.length > 0;
      }, { path: canonical, query: expected.search, hash: expected.hash },
      { timeout: 30000 },
    );
    if (!after) throw new Error('URL did not restore for ' + path);
    if (canonical === '/upscale') {
      await page.locator('[data-upscale-studio]').waitFor({ state: 'visible', timeout: 25000 });
    }
    if (failures.length) throw new Error('SPA error at ' + path + ': ' + failures.join(' | '));
    console.log('PASS deep link:', path, '→', new URL(page.url()).pathname + new URL(page.url()).search);
    await page.close();
  }
  // Home must remain a normal 200 response without a fallback redirect.
  const home = await browser.newPage();
  const response = await home.goto(origin + '/', { waitUntil: 'domcontentloaded' });
  if (response?.status() !== 200) throw new Error('Root did not serve with 200');
  if (new URL(home.url()).searchParams.has('__localvert_path')) throw new Error('Internal redirect marker leaked into root');
  console.log('PASS root and GitHub Pages 404 fallback in a real browser');
} finally {
  await browser?.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
