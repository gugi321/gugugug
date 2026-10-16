import { chromium, webkit } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.env.SMOKE_ROOT || 'site');
const fixture = resolve('tests/fixtures/sample.ifc');
const fixtureBytes = await readFile(fixture);
const fixtureInput = { name:'sample.ifc', mimeType:'application/octet-stream', buffer:fixtureBytes };
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
  let context;
  let page;
  const diagnostics = [];
  const snapshot = async () => {
    if (!page) return {};
    try {
      return await page.evaluate(() => ({
        href: location.href,
        crossOriginIsolated: globalThis.crossOriginIsolated,
        filename: document.getElementById('filename')?.textContent || '',
        layers: document.querySelectorAll('#layers .layer').length,
        canvases: document.querySelectorAll('#canvas canvas').length,
        count: document.getElementById('count')?.textContent || '',
        status: document.getElementById('status')?.textContent || '',
        statusHidden: document.getElementById('status')?.hidden,
        welcomeHidden: document.getElementById('welcome')?.hidden,
        fileDisabled: document.getElementById('file')?.disabled,
        bodyClass: document.body.className
      }));
    } catch (error) { return { snapshotError:error.message }; }
  };
  try {
    context = await browser.newContext(options);
    page = await context.newPage();
    page.on('pageerror', e => diagnostics.push(`pageerror: ${e.message}`));
    page.on('console', msg => { if (msg.type()==='error' || msg.type()==='warning') diagnostics.push(`${msg.type()}: ${msg.text()}`); });
    page.on('requestfailed', req => diagnostics.push(`requestfailed: ${req.url()} :: ${req.failure()?.errorText || ''}`));
    await page.goto(url, { waitUntil:'domcontentloaded', timeout:30_000 });
    await page.waitForSelector('#file', { timeout:20_000 });
    console.log(`${name} antes do IFC:`, JSON.stringify(await snapshot()));
    // Use bytes instead of an OS path. This avoids platform-specific WebKit
    // file-handle behavior on Windows while exercising the exact same browser File API.
    await page.locator('#file').setInputFiles(fixtureInput);
    await page.waitForFunction(() => {
      const welcome = document.getElementById('welcome');
      const layers = document.querySelectorAll('#layers .layer').length;
      const canvases = document.querySelectorAll('#canvas canvas').length;
      const status = document.getElementById('status')?.textContent || '';
      return welcome?.hidden === true && layers >= 1 && canvases >= 1 && !/erro|falha|não foi possível/i.test(status);
    }, null, { timeout:60_000 });
    const result = await snapshot();
    if (!/sample\.ifc/i.test(result.filename || '') || result.layers < 1 || result.canvases < 1) {
      throw new Error(`${name}: IFC não carregou corretamente: ${JSON.stringify(result)}`);
    }
    console.log(`${name} IFC OK:`, JSON.stringify(result));
    if (diagnostics.length) console.warn(`${name} avisos:`, diagnostics.join('\n'));
  } catch (error) {
    console.error(`${name} IFC FALHOU:`, error?.stack || error);
    console.error(`${name} estado final:`, JSON.stringify(await snapshot()));
    if (diagnostics.length) console.error(`${name} console/rede:`, diagnostics.join('\n'));
    throw error;
  } finally {
    if (context) await context.close().catch(()=>{});
    await browser.close();
  }
}

try {
  await run('Android/Chromium', chromium, { viewport:{width:412,height:915}, isMobile:true, hasTouch:true, deviceScaleFactor:2 });
  await run('iPhone/WebKit', webkit, { viewport:{width:390,height:844}, isMobile:true, hasTouch:true, deviceScaleFactor:3 });
} finally {
  await new Promise(resolve => server.close(resolve));
}
