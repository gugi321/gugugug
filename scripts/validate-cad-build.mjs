import { readFile, stat, readdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'

const ROOT = resolve('dist/cad')
const EXPECTED_VERSION = '2026-10-14-mini-cad-r7'
const required = [
  'index.html',
  'assets/libredwg-parser-worker.js',
  'assets/libredwg-web.wasm',
  'assets/mtext-renderer-worker.js'
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

const versionPath = resolve('dist/version.json')
const version = JSON.parse(await readFile(versionPath, 'utf8'))
if (version.version !== EXPECTED_VERSION) fail(`version.json=${version.version}; esperado=${EXPECTED_VERSION}`)

const parentDwg = await readFile(resolve('dist/dwg.js'), 'utf8')
if (!parentDwg.includes('20261014-r7')) fail('integração principal não aponta para o Mini CAD R7')
if (!parentDwg.includes('GG_CAD_READY')) fail('watchdog do CAD não está presente')

console.log('Mini CAD R7 validado com sucesso: HTML + bundles + workers + WASM + integração.')
