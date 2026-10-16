import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('.');
const source = resolve(root, 'dist');
const out = resolve(root, 'site');

await rm(out, { recursive: true, force: true });
await cp(source, out, { recursive: true });

await mkdir(resolve(out, 'vendor/three/addons'), { recursive: true });
await cp(resolve(root, 'node_modules/three-ifc/build/three.module.js'), resolve(out, 'vendor/three/three.module.js'));
await cp(resolve(root, 'node_modules/three-ifc/examples/jsm'), resolve(out, 'vendor/three/addons'), { recursive: true });

await mkdir(resolve(out, 'vendor/web-ifc'), { recursive: true });
await cp(resolve(root, 'node_modules/web-ifc/web-ifc-api.js'), resolve(out, 'vendor/web-ifc/web-ifc-api.js'));
await cp(resolve(root, 'node_modules/web-ifc/web-ifc.wasm'), resolve(out, 'vendor/web-ifc/web-ifc.wasm'));

await mkdir(resolve(out, 'vendor/pdfjs'), { recursive: true });
await cp(resolve(root, 'node_modules/pdfjs-dist/build/pdf.mjs'), resolve(out, 'vendor/pdfjs/pdf.mjs'));
await cp(resolve(root, 'node_modules/pdfjs-dist/build/pdf.worker.mjs'), resolve(out, 'vendor/pdfjs/pdf.worker.mjs'));
await cp(resolve(root, 'node_modules/pdfjs-dist/cmaps'), resolve(out, 'vendor/pdfjs/cmaps'), { recursive: true });
await cp(resolve(root, 'node_modules/pdfjs-dist/standard_fonts'), resolve(out, 'vendor/pdfjs/standard_fonts'), { recursive: true });

const indexPath = resolve(out, 'index.html');
let index = await readFile(indexPath, 'utf8');
index = index
  .replace('<base href="/">', '<base href="./">')
  .replace('https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js', './vendor/three/three.module.js')
  .replace('https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/', './vendor/three/addons/');
if (!index.includes('manifest.webmanifest')) {
  index = index.replace('</head>', '<link rel="manifest" href="manifest.webmanifest"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Eng Gustavo G"></head>');
}
if (!index.includes('github-pages.js')) {
  index = index.replace('</body>', '<script type="module" src="github-pages.js"></script></body>');
}
await writeFile(indexPath, index, 'utf8');

const appPath = resolve(out, 'app.js');
let app = await readFile(appPath, 'utf8');
app = app
  .replace("const PUBLIC_VIEWER_ORIGIN='https://visualizar-gustavo-gil-20260915-222909-8602.netlify.app';", "const PUBLIC_VIEWER_ORIGIN=location.origin;")
  .replaceAll("(location.protocol==='file:'?'https://eng-gustavogil.netlify.app':'')", "''")
  .replace("import('https://cdn.jsdelivr.net/npm/web-ifc@0.0.68/web-ifc-api.js')", "import('./vendor/web-ifc/web-ifc-api.js')")
  .replace("api.SetWasmPath('https://cdn.jsdelivr.net/npm/web-ifc@0.0.68/')", "api.SetWasmPath('./vendor/web-ifc/')")
  .replace("import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs')", "import('./vendor/pdfjs/pdf.mjs')")
  .replace("pdfReader.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs'", "pdfReader.GlobalWorkerOptions.workerSrc='./vendor/pdfjs/pdf.worker.mjs'")
  .replace("standardFontDataUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/'", "standardFontDataUrl:'./vendor/pdfjs/standard_fonts/'")
  .replace("cMapUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/'", "cMapUrl:'./vendor/pdfjs/cmaps/'");
await writeFile(appPath, app, 'utf8');

await writeFile(resolve(out, '.nojekyll'), '', 'utf8');
console.log('GitHub Pages preparado com IFC/PDF/CAD locais.');
