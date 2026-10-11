import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const VERSION = '0.8.0';
const ROOT = `https://cdn.jsdelivr.net/npm/@flyfish-dev/cad-viewer@${VERSION}/dist`;
const assets = [
  ['cad-viewer.es.js', 'dist/vendor/cad/cad-viewer.es.js', 100_000],
  ['style.css', 'dist/vendor/cad/style.css', 1_000],
  ['wasm/dwg-worker.js', 'dist/wasm/dwg-worker.js', 10_000],
  ['wasm/libredwg-web.js', 'dist/wasm/libredwg-web.js', 50_000],
  ['wasm/libredwg-web.wasm', 'dist/wasm/libredwg-web.wasm', 500_000],
];

async function download(source, target, minimumBytes) {
  const url = `${ROOT}/${source}`;
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Falha ao baixar ${source}: HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < minimumBytes) throw new Error(`${source} retornou apenas ${bytes.byteLength} bytes`);
  if (source.endsWith('.wasm') && !(bytes[0] === 0x00 && bytes[1] === 0x61 && bytes[2] === 0x73 && bytes[3] === 0x6d)) {
    throw new Error(`${source} não contém um WebAssembly válido`);
  }
  const out = resolve(target);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, bytes);
  console.log(`CAD asset OK: ${target} (${bytes.byteLength} bytes)`);
}

for (const [source, target, minimumBytes] of assets) {
  await download(source, target, minimumBytes);
}

const indexPath = resolve('dist/index.html');
let html = await readFile(indexPath, 'utf8');
html = html.replace(/<meta name="theme-color" content="[^"]*">/i, '<meta name="theme-color" content="#f7f9f8">');
if (!html.includes('src="quantities.js"')) {
  html = html.replace('<script type="module" src="dwg.js"></script>', '<script type="module" src="dwg.js"></script><script type="module" src="quantities.js"></script>');
}
await writeFile(indexPath, html, 'utf8');

console.log(`Runtime CAD ${VERSION} preparado localmente e index validado.`);
