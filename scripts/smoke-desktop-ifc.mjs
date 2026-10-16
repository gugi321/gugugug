import { _electron as electron } from 'playwright';
import { resolve } from 'node:path';

const fixture = resolve('tests/fixtures/sample.ifc');
let app;
let page;
const errors = [];
async function snapshot() {
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
  } catch (error) { return { snapshotError: error.message }; }
}

try {
  app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
    timeout: 45_000
  });
  page = await app.firstWindow({ timeout: 30_000 });
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', msg => { if (msg.type() === 'error' || msg.type() === 'warning') errors.push(`${msg.type()}: ${msg.text()}`); });
  page.on('requestfailed', req => errors.push(`requestfailed: ${req.url()} :: ${req.failure()?.errorText || ''}`));
  await page.waitForSelector('#file', { timeout: 20_000 });
  console.log('Estado antes do IFC:', JSON.stringify(await snapshot()));
  await page.locator('#file').setInputFiles(fixture);
  await page.waitForFunction(() => {
    const welcome = document.getElementById('welcome');
    const layerCount = document.querySelectorAll('#layers .layer').length;
    const canvasCount = document.querySelectorAll('#canvas canvas').length;
    const status = document.getElementById('status')?.textContent || '';
    return welcome?.hidden === true && layerCount >= 1 && canvasCount >= 1 && !/erro|falha|não foi possível/i.test(status);
  }, null, { timeout: 60_000 });
  const result = await snapshot();
  if (!/sample\.ifc/i.test(result.filename || '')) throw new Error(`Nome do IFC não confirmado: ${result.filename}`);
  if (result.layers < 1 || result.canvases < 1) throw new Error(`Geometria não confirmada: ${JSON.stringify(result)}`);
  if (errors.length) console.warn('Avisos do renderer:', errors.join('\n'));
  console.log('IFC desktop funcional:', JSON.stringify(result));
} catch (error) {
  console.error('IFC DESKTOP FALHOU:', error?.stack || error);
  console.error('Estado final:', JSON.stringify(await snapshot()));
  if (errors.length) console.error('Console/rede:', errors.join('\n'));
  throw error;
} finally {
  if (app) await app.close();
}
