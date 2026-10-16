const { app, BrowserWindow, shell, session } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const HOST = '127.0.0.1';
const MAX_BODY = 6 * 1024 * 1024;
const MAX_PDF_BYTES = 100 * 1024 * 1024;
const MAX_PART_BYTES = 4 * 1024 * 1024;
const MAX_PARTS = 25;
const SHARE_ID = /^[a-f0-9]{32}$/i;
const PROJECT_SCOPE = /^[a-f0-9]{64}$/i;

let server;
let baseUrl = '';
let mainWindow;
let siteRoot = '';
let dataRoot = '';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.bcmap': 'application/octet-stream',
  '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf'
};

function securityHeaders(extra = {}) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()',
    'Cache-Control': 'no-store',
    ...extra
  };
}

function json(res, status, body) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, securityHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(data.length)
  }));
  res.end(data);
}

function cleanName(value, fallback = 'arquivo.pdf') {
  const name = String(value || fallback)
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]/g, '_')
    .trim();
  return (name || fallback).slice(0, 180);
}

async function readBody(req, limit = MAX_BODY) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Payload acima do limite local.'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(file, fallback = null) {
  try { return JSON.parse(await fsp.readFile(file, 'utf8')); }
  catch { return fallback; }
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(value), 'utf8');
}

function catalogPath(scope) {
  return path.join(dataRoot, 'catalogs', `${scope}.json`);
}

function manifestPath(id) {
  return path.join(dataRoot, 'shares', id, 'manifest.json');
}

function partPath(id, part) {
  return path.join(dataRoot, 'shares', id, `part-${String(part).padStart(3, '0')}.bin`);
}

function cleanCatalog(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 40).flatMap(item => {
    if (!item || !SHARE_ID.test(String(item.id || ''))) return [];
    const size = Number(item.size);
    if (!Number.isSafeInteger(size) || size < 1 || size > MAX_PDF_BYTES) return [];
    return [{
      id: String(item.id).toLowerCase(),
      name: cleanName(item.name),
      size,
      floor: String(item.floor || '').slice(0, 120),
      elements: Array.isArray(item.elements) ? item.elements.filter(Number.isSafeInteger).slice(0, 1000) : []
    }];
  });
}

async function handleApi(req, res, url) {
  if (url.pathname === '/health') {
    json(res, 200, { ok: true, service: 'eng-gustavo-g-desktop', local: true });
    return true;
  }
  if (url.pathname !== '/api/share') return false;

  const scope = url.searchParams.get('catalog');
  if (scope !== null) {
    if (!PROJECT_SCOPE.test(scope)) return json(res, 400, { ok: false, error: 'Projeto inválido.' }), true;
    if (req.method === 'GET') {
      const saved = await readJson(catalogPath(scope), { pdfs: [] });
      return json(res, 200, { ok: true, pdfs: cleanCatalog(saved?.pdfs), updatedAt: saved?.updatedAt || null }), true;
    }
    if (req.method === 'POST') {
      const payload = JSON.parse((await readBody(req, 1024 * 1024)).toString('utf8') || '{}');
      const pdfs = cleanCatalog(payload.pdfs);
      const saved = { version: 1, pdfs, updatedAt: new Date().toISOString() };
      await writeJson(catalogPath(scope), saved);
      return json(res, 200, { ok: true, count: pdfs.length, updatedAt: saved.updatedAt }), true;
    }
    return json(res, 405, { ok: false, error: 'Método não permitido.' }), true;
  }

  const id = String(url.searchParams.get('id') || '').toLowerCase();
  if (!SHARE_ID.test(id)) return json(res, 400, { ok: false, error: 'Identificador inválido.' }), true;

  if (req.method === 'GET') {
    const manifest = await readJson(manifestPath(id));
    if (!manifest) return json(res, 404, { ok: false, error: 'Arquivo local não encontrado.' }), true;
    const part = url.searchParams.get('part');
    if (part === null) return json(res, 200, manifest), true;
    const index = Number(part);
    if (!Number.isInteger(index) || index < 0 || index >= manifest.total) return json(res, 400, { ok: false, error: 'Parte inválida.' }), true;
    const file = partPath(id, index);
    try {
      const stat = await fsp.stat(file);
      res.writeHead(200, securityHeaders({
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(stat.size)
      }));
      fs.createReadStream(file).pipe(res);
    } catch {
      json(res, 404, { ok: false, error: 'Parte não encontrada.' });
    }
    return true;
  }

  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método não permitido.' }), true;

  if (req.headers['x-share-action'] === 'upload') {
    const part = Number(req.headers['x-share-part']);
    const total = Number(req.headers['x-share-total']);
    if (!Number.isInteger(part) || !Number.isInteger(total) || total < 1 || total > MAX_PARTS || part < 0 || part >= total) {
      return json(res, 400, { ok: false, error: 'Parte inválida.' }), true;
    }
    const data = await readBody(req, MAX_PART_BYTES + 1);
    if (!data.length || data.length > MAX_PART_BYTES) return json(res, 413, { ok: false, error: 'Parte acima do limite.' }), true;
    const file = partPath(id, part);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, data);
    return json(res, 200, { ok: true, part, total, bytes: data.length }), true;
  }

  const payload = JSON.parse((await readBody(req, 256 * 1024)).toString('utf8') || '{}');
  if (payload.action !== 'finalize') return json(res, 400, { ok: false, error: 'Ação inválida.' }), true;
  const total = Number(payload.total);
  const size = Number(payload.size);
  if (!Number.isInteger(total) || total < 1 || total > MAX_PARTS || !Number.isSafeInteger(size) || size < 1 || size > MAX_PDF_BYTES) {
    return json(res, 413, { ok: false, error: 'Arquivo fora do limite local.' }), true;
  }
  let stored = 0;
  for (let i = 0; i < total; i++) {
    try { stored += (await fsp.stat(partPath(id, i))).size; }
    catch { return json(res, 409, { ok: false, error: 'Envio incompleto.' }), true; }
  }
  if (stored !== size) return json(res, 409, { ok: false, error: 'Tamanho enviado não confere.' }), true;
  const manifest = {
    ok: true,
    id,
    name: cleanName(payload.name),
    size,
    total,
    permission: 'view',
    createdAt: new Date().toISOString(),
    state: payload.state || null
  };
  await writeJson(manifestPath(id), manifest);
  return json(res, 200, manifest), true;
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname || '/');
  if (pathname === '/') pathname = '/index.html';
  const normalized = path.posix.normalize(pathname).replace(/^\/+/, '');
  if (normalized.startsWith('..')) return json(res, 403, { error: 'Acesso negado.' });
  const file = path.join(siteRoot, normalized);
  const relative = path.relative(siteRoot, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return json(res, 403, { error: 'Acesso negado.' });
  try {
    const stat = await fsp.stat(file);
    if (!stat.isFile()) throw new Error('not-file');
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, securityHeaders({
      'Content-Type': type,
      'Content-Length': String(stat.size),
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'same-origin'
    }));
    fs.createReadStream(file).pipe(res);
  } catch {
    json(res, 404, { error: 'Arquivo não encontrado.' });
  }
}

async function requestHandler(req, res) {
  try {
    const url = new URL(req.url || '/', `http://${HOST}`);
    if (await handleApi(req, res, url)) return;
    await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    json(res, error.status || 500, { ok: false, error: error.message || 'Falha interna do aplicativo.' });
  }
}

async function startServer() {
  siteRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'desktop-site')
    : path.join(__dirname, '..', 'desktop-site');
  dataRoot = path.join(app.getPath('userData'), 'project-data');
  await fsp.mkdir(dataRoot, { recursive: true });
  server = http.createServer((req, res) => void requestHandler(req, res));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, HOST, resolve);
  });
  const address = server.address();
  baseUrl = `http://${HOST}:${address.port}`;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 650,
    show: false,
    autoHideMenuBar: true,
    title: 'Eng Gustavo G',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  const allowedOrigin = new URL(baseUrl).origin;
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || url.startsWith(allowedOrigin)) return { action: 'allow' };
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(allowedOrigin)) event.preventDefault();
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  void mainWindow.loadURL(`${baseUrl}/`);
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  await startServer();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}).catch(error => {
  console.error(error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try { server?.close(); } catch {}
});
