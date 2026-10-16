import { readFile, stat, readdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'

const ROOT = resolve('dist/cad')
const required = [
  'index.html',
  'assets/libredwg-parser-worker.js',
  'assets/libredwg-web.wasm'
]

function fail(message) {
  throw new Error(`[Mini CAD validation] ${message}`)
}

for (const rel of required) {
  const file = resolve(ROOT, rel)
  const info = await stat(file).catch(() => null)
  if (!info?.isFile()) fail(`arquivo ausente: ${rel}`)
  if (info.size < 100) fail(`arquivo vazio/incompleto: ${rel} (${info.size} bytes)`)
}

const wasmPath = resolve(ROOT, 'assets/libredwg-web.wasm')
const wasm = await readFile(wasmPath)
if (wasm.length < 500_000) fail(`WASM pequeno demais: ${wasm.length} bytes`)
if (!(wasm[0] === 0x00 && wasm[1] === 0x61 && wasm[2] === 0x73 && wasm[3] === 0x6d)) {
  fail('assinatura do libredwg-web.wasm inválida')
}

const htmlPath = resolve(ROOT, 'index.html')
const html = await readFile(htmlPath, 'utf8')
if (/src=["'][^"']+\.ts["']/i.test(html)) fail('index.html ainda referencia TypeScript bruto')
if (/localhost|127\.0\.0\.1|file:\/\//i.test(html)) fail('index.html contém caminho local')

const refs = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/gi)]
  .map(m => m[1])
  .filter(v => !/^(?:https?:|data:|#)/i.test(v))
for (const ref of refs) {
  const clean = ref.split('?')[0].split('#')[0]
  if (!clean) continue
  const target = resolve(dirname(htmlPath), clean)
  const info = await stat(target).catch(() => null)
  if (!info?.isFile()) fail(`recurso referenciado pelo HTML não existe: ${ref}`)
}

const assetNames = await readdir(resolve(ROOT, 'assets'))
const jsAssets = assetNames.filter(name => name.endsWith('.js'))
if (jsAssets.length < 3) fail(`poucos bundles JS gerados: ${jsAssets.length}`)
for (const name of jsAssets) {
  const text = await readFile(resolve(ROOT, 'assets', name), 'utf8')
  if (/localhost|127\.0\.0\.1|file:\/\//i.test(text)) fail(`bundle ${name} contém endereço local`)
  if (/\/src\/main\.ts/.test(text)) fail(`bundle ${name} contém referência de desenvolvimento`)
}

const appBundles = jsAssets
  .filter(name => name !== 'libredwg-parser-worker.js')
  .map(name => readFile(resolve(ROOT, 'assets', name), 'utf8'))
const appText = (await Promise.all(appBundles)).join('\n')
if (!appText.includes('useMainThreadDraw')) fail('bundle CAD não contém configuração de desenho no thread principal')

const versionPath = resolve('dist/version.json')
const version = JSON.parse(await readFile(versionPath, 'utf8'))
if (!version.version || typeof version.version !== 'string') fail('dist/version.json não contém uma versão válida')
const features = Array.isArray(version.features) ? version.features : []
if (!features.includes('mini-cad-online-static')) fail('release atual não declara o Mini CAD online')
if (!features.includes('dwg-libredwg-web-direct')) fail('release atual não declara o motor LibreDWG')

const parentDwg = await readFile(resolve('dist/dwg.js'), 'utf8')
if (!parentDwg.includes('cad/index.html')) fail('integração principal não aponta para dist/cad')
if (!parentDwg.includes('GG_CAD_READY')) fail('watchdog do CAD não está presente')
if (!/CAD_EMBED_VERSION\s*=\s*['"][^'"]+['"]/.test(parentDwg)) fail('versão do iframe CAD não foi definida')

console.log(`Mini CAD validado com sucesso para ${version.version}: HTML + bundles + LibreDWG worker + WASM + MTEXT no thread principal.`)
