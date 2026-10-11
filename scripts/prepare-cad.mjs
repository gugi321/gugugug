import { build } from 'esbuild';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const ROOT = resolve('node_modules/@flyfish-dev/cad-viewer/dist');
const outModule = resolve('dist/vendor/cad/cad-viewer.bundle.js');
const copies = [
  [resolve(ROOT, 'style.css'), resolve('dist/vendor/cad/style.css')],
  [resolve(ROOT, 'wasm/dwg-worker.js'), resolve('dist/wasm/dwg-worker.js')],
  [resolve(ROOT, 'wasm/libredwg-web.js'), resolve('dist/wasm/libredwg-web.js')],
  [resolve(ROOT, 'wasm/libredwg-web.wasm'), resolve('dist/wasm/libredwg-web.wasm')]
];

await mkdir(dirname(outModule), { recursive: true });
await mkdir(resolve('dist/wasm'), { recursive: true });

await build({
  entryPoints: [resolve(ROOT, 'cad-viewer.es.js')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2020'],
  outfile: outModule,
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  logLevel: 'info'
});

for (const [source, target] of copies) {
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}

const minimums = new Map([
  [outModule, 100_000],
  [resolve('dist/wasm/dwg-worker.js'), 10_000],
  [resolve('dist/wasm/libredwg-web.js'), 50_000],
  [resolve('dist/wasm/libredwg-web.wasm'), 500_000]
]);
for (const [file, minimum] of minimums) {
  const info = await stat(file);
  if (info.size < minimum) throw new Error(`${file} incompleto: ${info.size} bytes`);
}
const wasm = await readFile(resolve('dist/wasm/libredwg-web.wasm'));
if (!(wasm[0] === 0x00 && wasm[1] === 0x61 && wasm[2] === 0x73 && wasm[3] === 0x6d)) throw new Error('libredwg-web.wasm inválido');

const indexPath = resolve('dist/index.html');
let html = await readFile(indexPath, 'utf8');
html = html.replace(/<meta name="theme-color" content="[^"]*">/i, '<meta name="theme-color" content="#f7f9f8">');
if (!html.includes('src="quantities.js"')) {
  html = html.replace('<script type="module" src="dwg.js"></script>', '<script type="module" src="dwg.js"></script><script type="module" src="quantities.js"></script>');
}
await writeFile(indexPath, html, 'utf8');
console.log('CAD runtime local validado: bundle + worker + WASM.');
