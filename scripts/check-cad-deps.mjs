import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const expected = {
  '@mlightcad/cad-simple-ui-plugin': '1.7.4',
  '@mlightcad/cad-simple-viewer': '1.7.4',
  '@mlightcad/data-model': '1.15.1',
  '@mlightcad/libredwg-converter': '3.15.1',
  '@mlightcad/mtext-parser': '1.5.3',
  '@mlightcad/mtext-renderer': '0.13.2'
}

const problems = []
for (const [name, version] of Object.entries(expected)) {
  const declared = pkg.dependencies?.[name]
  if (declared !== version) {
    problems.push(`${name}: esperado ${version}, declarado ${declared ?? 'ausente'}`)
  }

  const installedPath = path.join(root, 'node_modules', ...name.split('/'), 'package.json')
  if (fs.existsSync(installedPath)) {
    try {
      const installed = JSON.parse(fs.readFileSync(installedPath, 'utf8')).version
      if (installed !== version) {
        problems.push(`${name}: esperado ${version}, instalado ${installed}`)
      }
    } catch (error) {
      problems.push(`${name}: nao foi possivel validar a versao instalada (${error.message})`)
    }
  }
}

if (problems.length) {
  console.error('Dependencias CAD incompatíveis:')
  for (const problem of problems) console.error(`- ${problem}`)
  process.exit(1)
}

console.log('Dependencias CAD travadas e compativeis.')
