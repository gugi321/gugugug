import { access, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('desktop-site');
const required = [
  'index.html',
  'app.js',
  'dwg.js',
  'desktop-runtime.js',
  'vendor/three/three.module.js',
  'vendor/web-ifc/web-ifc-api.js',
  'vendor/web-ifc/web-ifc.wasm',
  'vendor/pdfjs/pdf.mjs',
  'vendor/pdfjs/pdf.worker.mjs',
  'cad/index.html',
  'cad/assets/libredwg-parser-worker.js',
  'cad/assets/libredwg-web.wasm'
];

for (const rel of required) {
  const file = resolve(root, rel);
  await access(file);
  const info = await stat(file);
  if (!info.isFile() || info.size < 1) throw new Error(`Arquivo de desktop inválido: ${rel}`);
}

for (const rel of ['vendor/web-ifc/web-ifc.wasm', 'cad/assets/libredwg-web.wasm']) {
  const bytes = await readFile(resolve(root, rel));
  if (bytes.length < 500_000) throw new Error(`WASM muito pequeno: ${rel}`);
  if (bytes[0] !== 0x00 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) {
    throw new Error(`WASM inválido: ${rel}`);
  }
}

const index = await readFile(resolve(root, 'index.html'), 'utf8');
const app = await readFile(resolve(root, 'app.js'), 'utf8');
const runtime = await readFile(resolve(root, 'desktop-runtime.js'), 'utf8');

if (!index.includes('Eng Gustavo G')) throw new Error('Marca de desktop não aplicada.');
if (!index.includes('/vendor/three/three.module.js')) throw new Error('Three.js local não configurado.');
if (!app.includes("import('/vendor/web-ifc/web-ifc-api.js')")) throw new Error('web-ifc local não configurado.');
if (!app.includes("import('/vendor/pdfjs/pdf.mjs')")) throw new Error('PDF.js local não configurado.');
if (app.includes('eng-gustavogil.netlify.app') || app.includes('visualizar-gustavo-gil-20260915-222909-8602.netlify.app')) {
  throw new Error('O executável ainda contém dependência Netlify no runtime principal.');
}
if (!runtime.includes('share-fallback-r10.js')) throw new Error('Compartilhamento por arquivo não está ativo.');

console.log('Desktop R11 validado: IFC + PDF locais, CAD/WASM e compartilhamento por arquivo.');
