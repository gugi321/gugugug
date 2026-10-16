import { chromium, webkit } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.env.SMOKE_ROOT || 'site');
const fixture = resolve('tests/fixtures/sample.ifc');
const mime = {
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.wasm':'application/wasm',
  '.png':'image/png','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'
};
const server = createServer(async (req,res) => {
  try {
    const u = new URL(req.url || '/', 'http://127.0.0.1');
    const rel = normalize(decodeURIComponent(u.pathname)).replace(/^[/\\]+/, '') || 'index.html';
    const file = join(root, rel);
    if (!file.startsWith(root)) throw new Error('forbidden');
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not-file');
    res.writeHead(200, {
      'Content-Type': mime[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cross-Origin-Opener-Policy':'same-origin',
      'Cross-Origin-Embedder-Policy':'credentialless',
      'Cache-Control':'no-store'
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const { port } = server.address();
const url = `http://127.0.0.1:${port}/`;

async function run(name, launcher, options) {
  const browser = await launcher.launch({ headless:true });
  try {
    const context = await browser.newContext(options);
    const page = await context.newPage();
    const fatal = [];
    page.on('pageerror', e => fatal.push(`pageerror: ${e.message}`));
    await page.goto(url, { waitUntil:'domcontentloaded', timeout:30_000 });
    await page.waitForSelector('#file', { timeout:20_000 });
    await page.locator('#file').setInputFiles(fixture);
    await page.waitForFunction(() => {
      const welcome = document.getElementById('welcome');
      const layers = document.querySelectorAll('#layers .layer').length;
      const canvases = document.querySelectorAll('#canvas canvas').length;
      const status = document.getElementById('status')?.textContent || '';
      return welcome?.hidden === true && layers >= 1 && canvases >= 1 && !/erro|falha|não foi possível/i.test(status);
    }, null, { timeout:45_000 });
    const result = await page.evaluate(() => ({
      filename: document.getElementById('filename')?.textContent || '',
      layers: document.querySelectorAll('#layers .layer').length,
      canvases: document.querySelectorAll('#canvas canvas').length,
      count: document.getElementById('count')?.textContent || '',
      status: document.getElementById('status')?.textContent || ''
    }));
    if (!/sample\.ifc/i.test(result.filename) || result.layers < 1 || result.canvases < 1) {
      throw new Error(`${name}: IFC não carregou corretamente: ${JSON.stringify(result)}`);
    }
    if (fatal.length) throw new Error(`${name}: ${fatal.join('\n')}`);
    console.log(`${name} IFC OK:`, JSON.stringify(result));
    await context.close();
  } finally { await browser.close(); }
}

try {
  await run('Android/Chromium', chromium, { viewport:{width:412,height:915}, isMobile:true, hasTouch:true, deviceScaleFactor:2 });
  await run('iPhone/WebKit', webkit, { viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:3 });
} finally {
  await new Promise(resolve => server.close(resolve));
}
