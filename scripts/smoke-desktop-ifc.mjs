import { _electron as electron } from 'playwright';
import { resolve } from 'node:path';

const fixture = resolve('tests/fixtures/sample.ifc');
let app;
try {
  app = await electron.launch({
    args: ['.'],
    cwd: process.cwd(),
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
    timeout: 45_000
  });
  const page = await app.firstWindow({ timeout: 30_000 });
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
  await page.waitForSelector('#file', { timeout: 20_000 });
  await page.locator('#file').setInputFiles(fixture);
  await page.waitForFunction(() => {
    const welcome = document.getElementById('welcome');
    const layerCount = document.querySelectorAll('#layers .layer').length;
    const canvasCount = document.querySelectorAll('#canvas canvas').length;
    const status = document.getElementById('status')?.textContent || '';
    return welcome?.hidden === true && layerCount >= 1 && canvasCount >= 1 && !/erro|falha|não foi possível/i.test(status);
  }, null, { timeout: 45_000 });
  const result = await page.evaluate(() => ({
    filename: document.getElementById('filename')?.textContent || '',
    layers: document.querySelectorAll('#layers .layer').length,
    canvases: document.querySelectorAll('#canvas canvas').length,
    count: document.getElementById('count')?.textContent || '',
    status: document.getElementById('status')?.textContent || ''
  }));
  if (!/sample\.ifc/i.test(result.filename)) throw new Error(`Nome do IFC não confirmado: ${result.filename}`);
  if (result.layers < 1 || result.canvases < 1) throw new Error(`Geometria não confirmada: ${JSON.stringify(result)}`);
  if (errors.length) console.warn('Avisos do renderer:', errors.join('\n'));
  console.log('IFC desktop funcional:', JSON.stringify(result));
} finally {
  if (app) await app.close();
}
