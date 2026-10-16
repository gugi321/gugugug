import { readdir, readFile } from 'node:fs/promises'
import { extname, join, relative } from 'node:path'

const root = process.cwd()
const skipDirs = new Set(['.git', 'node_modules', 'site'])
const skipFiles = new Set([
  'SEGURANCA-ACESSO.md',
  'scripts/check-secrets.mjs'
])
const textExtensions = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.toml', '.yml', '.yaml',
  '.md', '.html', '.css', '.txt', '.env', '.ini', '.conf'
])
const secretNames = ['SHARE_KEY', 'IFC_SESSION_SECRET']
const assignment = new RegExp(
  `\\b(${secretNames.join('|')})\\b\\s*[:=]\\s*["'](?!\\$\\{|\\{\\{|<)([^"']{8,})["']`,
  'g'
)

const findings = []

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory() && skipDirs.has(entry.name)) continue
    const full = join(dir, entry.name)
    const rel = relative(root, full).replaceAll('\\\\', '/')
    if (entry.isDirectory()) {
      await walk(full)
      continue
    }
    if (!entry.isFile() || skipFiles.has(rel)) continue
    if (!textExtensions.has(extname(entry.name).toLowerCase()) && !entry.name.startsWith('.env')) continue

    let text
    try { text = await readFile(full, 'utf8') } catch { continue }
    for (const match of text.matchAll(assignment)) {
      const line = text.slice(0, match.index).split('\n').length
      findings.push(`${rel}:${line} (${match[1]})`)
    }
  }
}

await walk(root)

if (findings.length) {
  console.error('Possível segredo fixo encontrado em arquivo rastreado:')
  for (const finding of findings) console.error(`- ${finding}`)
  process.exit(1)
}

console.log('Nenhum segredo fixo SHARE_KEY/IFC_SESSION_SECRET encontrado nos arquivos de texto rastreados.')
