import { cp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, dirname } from 'node:path';

const root = resolve('.');
const source = resolve(root, 'dist');
const out = resolve(root, 'desktop-site');

async function exists(file) {
  try { await access(file, constants.R_OK); return true; } catch { return false; }
}

async function copyFirst(candidates, destination) {
  const sourceFile = await candidates.reduce(async (foundPromise, candidate) => {
    const found = await foundPromise;
    if (found) return found;
    return (await exists(candidate)) ? candidate : null;
  }, Promise.resolve(null));
  if (!sourceFile) throw new Error(`Dependência de desktop não encontrada: ${candidates.join(' | ')}`);
  await mkdir(dirname(destination), { recursive: true });
  await cp(sourceFile, destination, { recursive: true });
}

await rm(out, { recursive: true, force: true });
await cp(source, out, { recursive: true });

await mkdir(resolve(out, 'vendor/three/addons'), { recursive: true });
await cp(resolve(root, 'node_modules/three-ifc/build/three.module.js'), resolve(out, 'vendor/three/three.module.js'));
await cp(resolve(root, 'node_modules/three-ifc/examples/jsm'), resolve(out, 'vendor/three/addons'), { recursive: true });

await copyFirst([
  resolve(root, 'node_modules/web-ifc/web-ifc-api.js'),
  resolve(root, 'node_modules/web-ifc/web-ifc-api-node.js')
], resolve(out, 'vendor/web-ifc/web-ifc-api.js'));
await copyFirst([
  resolve(root, 'node_modules/web-ifc/web-ifc.wasm'),
  resolve(root, 'node_modules/web-ifc/wasm/web-ifc.wasm')
], resolve(out, 'vendor/web-ifc/web-ifc.wasm'));

await mkdir(resolve(out, 'vendor/pdfjs'), { recursive: true });
await cp(resolve(root, 'node_modules/pdfjs-dist/build/pdf.mjs'), resolve(out, 'vendor/pdfjs/pdf.mjs'));
await cp(resolve(root, 'node_modules/pdfjs-dist/build/pdf.worker.mjs'), resolve(out, 'vendor/pdfjs/pdf.worker.mjs'));
await cp(resolve(root, 'node_modules/pdfjs-dist/cmaps'), resolve(out, 'vendor/pdfjs/cmaps'), { recursive: true });
await cp(resolve(root, 'node_modules/pdfjs-dist/standard_fonts'), resolve(out, 'vendor/pdfjs/standard_fonts'), { recursive: true });

const indexPath = resolve(out, 'index.html');
let index = await readFile(indexPath, 'utf8');
index = index
  .replace(/<meta name="description" content="[^"]*">/, '<meta name="description" content="Eng Gustavo G · Aplicativo técnico local IFC, CAD e PDF">')
  .replace(/<title>[^<]*<\/title>/, '<title>Eng Gustavo G</title>')
  .replace(/<strong>Visualizador de Projeto<\/strong><small>ENG\. GUSTAVO GIL<\/small>/, '<strong>Eng Gustavo G</strong><small>IFC · CAD · PDF</small>')
  .replace(/Desenvolvido pelo Eng\. Gustavo Gil/g, 'Eng Gustavo G · Engenharia')
  .replace('https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js', '/vendor/three/three.module.js')
  .replace('https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/', '/vendor/three/addons/');
if (!index.includes('name="robots"')) index = index.replace('</head>', '<meta name="robots" content="noindex,nofollow,noarchive"></head>');
if (!index.includes('desktop-runtime.js')) index = index.replace('</body>', '<script type="module" src="desktop-runtime.js"></script></body>');
await writeFile(indexPath, index, 'utf8');

const appPath = resolve(out, 'app.js');
let app = await readFile(appPath, 'utf8');
app = app
  .replace("const PUBLIC_VIEWER_ORIGIN='https://visualizar-gustavo-gil-20260915-222909-8602.netlify.app';", "const PUBLIC_VIEWER_ORIGIN=location.origin;")
  .replaceAll("(location.protocol==='file:'?'https://eng-gustavogil.netlify.app':'')", "''")
  .replace("import('https://cdn.jsdelivr.net/npm/web-ifc@0.0.68/web-ifc-api.js')", "import('/vendor/web-ifc/web-ifc-api.js')")
  .replace("api.SetWasmPath('https://cdn.jsdelivr.net/npm/web-ifc@0.0.68/')", "api.SetWasmPath('/vendor/web-ifc/')")
  .replace("import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs')", "import('/vendor/pdfjs/pdf.mjs')")
  .replace("pdfReader.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs'", "pdfReader.GlobalWorkerOptions.workerSrc='/vendor/pdfjs/pdf.worker.mjs'")
  .replace("standardFontDataUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/'", "standardFontDataUrl:'/vendor/pdfjs/standard_fonts/'")
  .replace("cMapUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/'", "cMapUrl:'/vendor/pdfjs/cmaps/'");
await writeFile(appPath, app, 'utf8');

const runtime = `
import './eng-r10.js';
import './share-fallback-r10.js';
document.body.classList.add('desktop-app');
document.title='Eng Gustavo G';
const version=document.querySelector('.build-version');
if(version)version.textContent='Aplicativo Windows · R11';
const hint=document.getElementById('pdfOwnerHint');
if(hint)hint.textContent='PDFs são guardados localmente neste computador. Nenhum crédito de hospedagem é necessário.';
const shareStatus=document.getElementById('shareStatus');
if(shareStatus)shareStatus.textContent='No aplicativo Windows, compartilhe por arquivo HTML ou pacote ZIP somente leitura.';
`;
await writeFile(resolve(out, 'desktop-runtime.js'), runtime.trimStart(), 'utf8');

console.log('Desktop site prepared:', out);
