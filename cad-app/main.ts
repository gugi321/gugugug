import {
  AcApDocManager,
  acedApplyUiTheme
} from '@mlightcad/cad-simple-viewer'
import {
  AcDbDatabaseConverterManager,
  AcDbFileType
} from '@mlightcad/data-model'
import { AcDbLibreDwgConverter } from '@mlightcad/libredwg-converter'
import {
  acuiRegisterSimpleUiPlugin,
  acuiToolbarPreset,
  acuiCreateToolbarSeparator
} from '@mlightcad/cad-simple-ui-plugin'

const $ = (id: string) => document.getElementById(id) as HTMLElement | null
const host = $('viewerPane') as HTMLElement
const container = $('cad-container') as HTMLElement
const input = $('fileInput') as HTMLInputElement
const statusEl = $('status') as HTMLElement
const workerStatus = $('workerStatus') as HTMLElement
const snapStatus = $('snapStatus') as HTMLElement
const commandInput = $('commandInput') as HTMLInputElement
const empty = $('emptyState') as HTMLElement
const busy = $('busy') as HTMLElement
const busyText = $('busyText') as HTMLElement
const diagnostics = $('diagnostics') as HTMLElement
const errorDetails = $('errorDetails') as HTMLElement

const CAD_BUILD = '2026-10-18-eng-gustavo-g-r13.1'
const CAD_DATA_BASE = 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data@be0a4956038c05acdd664266e8c803ac04f0ac77/'
const workerUrls = {
  dwgParser: new URL('./assets/libredwg-parser-worker.js', document.baseURI).href
}
const wasmUrl = new URL('./assets/libredwg-web.wasm', document.baseURI).href

let initialized = false
let initializing: Promise<boolean> | null = null
let hasDocument = false
let workersReady = false
let toolbarReady = false
let osnapEnabled = true
let orthoEnabled = false

function postParent(type: string, detail: Record<string, unknown> = {}) {
  if (window.parent === window) return
  window.parent.postMessage({ type, build: CAD_BUILD, ...detail }, '*')
}

function setStatus(message: string, isError = false) {
  statusEl.textContent = message
  statusEl.dataset.kind = isError ? 'error' : 'ok'
}

function setBusy(on: boolean, message = 'Carregando desenho…') {
  busy.hidden = !on
  busyText.textContent = message
  busy.setAttribute('aria-hidden', String(!on))
}

function setTools(enabled: boolean) {
  for (const id of [
    'selectTool', 'panTool', 'fitView', 'layers', 'measureDistance', 'measureArea',
    'lineTool', 'circleTool', 'eraseTool', 'undoTool', 'redoTool',
    'osnapToggle', 'orthoToggle', 'clearMeasurements'
  ]) {
    const el = $(id) as HTMLButtonElement | null
    if (el) el.disabled = !enabled
  }
  if (commandInput) commandInput.disabled = !enabled
}

function showErrorDetail(message: string) {
  if (!errorDetails) return
  errorDetails.textContent = message
  errorDetails.hidden = !message
}

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

async function probeAsset(url: string, kind: 'js' | 'wasm') {
  try {
    let response = await fetch(url, { method: 'HEAD', cache: 'no-store' })
    if (!response.ok || response.status === 405) {
      response = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        headers: { Range: 'bytes=0-15' }
      })
    }
    if (!response.ok && response.status !== 206) throw new Error(`HTTP ${response.status}`)
    const type = response.headers.get('content-type') || ''
    if (kind === 'wasm' && type && !type.includes('application/wasm')) {
      throw new Error(`MIME ${type}`)
    }
    return { ok: true, detail: type || 'disponível' }
  } catch (error: any) {
    return { ok: false, detail: String(error?.message || error) }
  }
}

async function runDiagnostics() {
  const checks: Array<{ label: string; ok: boolean; detail: string }> = []
  checks.push({ label: 'Web Worker', ok: typeof Worker !== 'undefined', detail: typeof Worker !== 'undefined' ? 'suportado' : 'indisponível' })
  checks.push({ label: 'WebGL', ok: webglAvailable(), detail: webglAvailable() ? 'suportado' : 'indisponível' })

  const [dwgWorker, wasm] = await Promise.all([
    probeAsset(workerUrls.dwgParser, 'js'),
    probeAsset(wasmUrl, 'wasm')
  ])
  checks.push({ label: 'Worker DWG', ...dwgWorker })
  checks.push({ label: 'LibreDWG WASM', ...wasm })
  checks.push({ label: 'OSNAP', ok: true, detail: 'Final + Meio + Centro' })

  diagnostics.innerHTML = checks
    .map(c => `<span class="diag ${c.ok ? 'ok' : 'bad'}"><b>${c.label}</b><em>${c.ok ? 'OK' : 'Falha'}</em><small>${c.detail}</small></span>`)
    .join('')

  const runtimeOk = checks.filter(c => c.label !== 'WebGL').every(c => c.ok)
  workerStatus.textContent = runtimeOk ? 'Motor CAD: DWG/WASM OK' : 'Motor CAD: verifique o diagnóstico'
  postParent('GG_CAD_DIAGNOSTICS', { ok: runtimeOk, checks })
  return runtimeOk
}

function classifyError(error: unknown) {
  const raw = String((error as any)?.message || error || 'Falha desconhecida')
  const lower = raw.toLowerCase()
  if (/worker|wasm|mime|magic|fetch|network|404/.test(lower)) {
    return `Falha no motor DWG online. Recarregue a página sem cache. Detalhe técnico: ${raw}`
  }
  if (/memory|out of memory|allocation|heap/.test(lower)) {
    return `O navegador ficou sem memória para este desenho. Feche outras abas ou tente um DWG menor. Detalhe: ${raw}`
  }
  if (/unsupported|not supported|version|invalid/.test(lower)) {
    return `O DWG contém uma versão ou entidade que o leitor não conseguiu converter. Se possível, salve uma cópia em DWG 2018 ou DXF e tente novamente. Detalhe: ${raw}`
  }
  return `Falha ao abrir o desenho. Detalhe técnico: ${raw}`
}

function registerDwgConverter() {
  const converter = new AcDbLibreDwgConverter({
    convertByEntityType: false,
    useWorker: true,
    parserWorkerUrl: workerUrls.dwgParser
  })
  AcDbDatabaseConverterManager.instance.register(AcDbFileType.DWG, converter)
}

function updateAidUi() {
  const osnap = $('osnapToggle') as HTMLButtonElement | null
  const ortho = $('orthoToggle') as HTMLButtonElement | null
  if (osnap) {
    osnap.textContent = osnapEnabled ? 'OSNAP ON' : 'OSNAP OFF'
    osnap.classList.toggle('active', osnapEnabled)
    osnap.setAttribute('aria-pressed', String(osnapEnabled))
  }
  if (ortho) {
    ortho.textContent = orthoEnabled ? 'ORTHO ON' : 'ORTHO OFF'
    ortho.classList.toggle('active', orthoEnabled)
    ortho.setAttribute('aria-pressed', String(orthoEnabled))
  }
  if (snapStatus) snapStatus.textContent = osnapEnabled
    ? `OSNAP: Final + Meio + Centro${orthoEnabled ? ' · ORTHO' : ''}`
    : `OSNAP: OFF${orthoEnabled ? ' · ORTHO' : ''}`
}

function rawCommand(command: string) {
  if (!initialized || !hasDocument) return
  try {
    AcApDocManager.instance.sendStringToExecute(command)
  } catch (error) {
    const message = classifyError(error)
    setStatus(message, true)
    showErrorDetail(String((error as any)?.stack || error))
  }
}

function applyCadAids() {
  if (!hasDocument) return
  rawCommand('PICKBOX\n20')
  rawCommand(`OSMODE\n${osnapEnabled ? 7 : 0}`)
  rawCommand(`ORTHOMODE\n${orthoEnabled ? 1 : 0}`)
  updateAidUi()
}

function toggleOsnap() {
  osnapEnabled = !osnapEnabled
  if (hasDocument) rawCommand(`OSMODE\n${osnapEnabled ? 7 : 0}`)
  updateAidUi()
  setStatus(osnapEnabled ? 'OSNAP ligado: ponto final, meio e centro.' : 'OSNAP desligado.')
}

function toggleOrtho() {
  orthoEnabled = !orthoEnabled
  if (hasDocument) rawCommand(`ORTHOMODE\n${orthoEnabled ? 1 : 0}`)
  updateAidUi()
  setStatus(orthoEnabled ? 'ORTHO ligado: movimento horizontal/vertical.' : 'ORTHO desligado.')
}

async function ensureViewer(): Promise<boolean> {
  if (initialized) return true
  if (initializing) return initializing

  initializing = (async () => {
    try {
      showErrorDetail('')
      setBusy(true, 'Inicializando o Mini CAD…')
      setStatus('Preparando o visualizador DWG / DXF…')
      acedApplyUiTheme('dark', host)

      registerDwgConverter()

      AcApDocManager.createInstance({
        container,
        busyIndicatorHost: host,
        autoResize: true,
        baseUrl: CAD_DATA_BASE,
        webworkerFileUrls: workerUrls,
        checkWorkersOnInit: false,
        useMainThreadDraw: true,
        disableExport: true
      })

      const manager = AcApDocManager.instance
      workersReady = await runDiagnostics()
      workerStatus.textContent = workersReady
        ? 'Motor CAD: pronto para DWG'
        : 'Motor CAD: recursos incompletos; a abertura ainda será tentada'

      try {
        await acuiRegisterSimpleUiPlugin(manager.pluginManager, {
          host,
          dockPanel: {
            defaultOpen: false,
            defaultSide: 'left',
            defaultWidth: 280,
            defaultHeight: 240
          },
          toolbar: {
            placement: 'right',
            collapsible: true,
            items: [
              acuiToolbarPreset('select'),
              acuiToolbarPreset('pan'),
              acuiToolbarPreset('zoom-extent'),
              acuiToolbarPreset('zoom-window'),
              acuiCreateToolbarSeparator('sep-view'),
              acuiToolbarPreset('layer'),
              acuiToolbarPreset('measure'),
              acuiCreateToolbarSeparator('sep-settings'),
              acuiToolbarPreset('settings')
            ]
          }
        })
        toolbarReady = true
      } catch (toolbarError) {
        toolbarReady = false
        console.warn('Barra CAD avançada indisponível; controles básicos continuam ativos.', toolbarError)
      }

      initialized = true
      setStatus(toolbarReady
        ? 'Mini CAD pronto. Abra um DWG ou DXF.'
        : 'Mini CAD pronto. A barra avançada não carregou, mas os controles principais continuam funcionando.')
      postParent('GG_CAD_READY', { workersReady, toolbarReady })
      return true
    } catch (error: any) {
      console.error(error)
      const message = classifyError(error)
      workerStatus.textContent = 'Motor CAD: erro de inicialização'
      setStatus(message, true)
      showErrorDetail(String(error?.stack || error?.message || error))
      postParent('GG_CAD_ERROR', { stage: 'initialize', message })
      return false
    } finally {
      setBusy(false)
      initializing = null
    }
  })()

  return initializing
}

function readFile(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    reader.readAsArrayBuffer(file)
  })
}

async function openDrawing(file?: File) {
  if (!file) return
  showErrorDetail('')
  if (!/\.(dwg|dxf)$/i.test(file.name)) {
    setStatus('Selecione um arquivo DWG ou DXF.', true)
    return
  }

  const mobile = matchMedia('(max-width: 760px)').matches
  const maxMb = mobile ? 120 : 350
  const sizeMb = file.size / 1048576
  if (sizeMb > maxMb) {
    setStatus(`Arquivo com ${sizeMb.toFixed(0)} MB. Para evitar travamento, o limite nesta tela é ${maxMb} MB.`, true)
    return
  }

  const ok = await ensureViewer()
  if (!ok) return

  const isDwg = /\.dwg$/i.test(file.name)
  const manager = AcApDocManager.instance

  if (isDwg) {
    workersReady = await runDiagnostics()
    if (!workersReady) {
      setStatus('O diagnóstico encontrou um recurso incompleto, mas o aplicativo tentará abrir o DWG mesmo assim.', false)
    }
  }

  try {
    setBusy(true, `Abrindo ${file.name}…`)
    setStatus(`Lendo ${file.name} (${sizeMb.toFixed(1)} MB)…`)
    const fileContent = await readFile(file)
    const success = await manager.openDocument(file.name, fileContent, {
      progressiveRendering: true,
      circleSides: mobile ? 40 : 64,
      minimumChunkSize: 1000
    } as any)

    if (!success) throw new Error('O mecanismo CAD retornou falha ao converter o arquivo.')

    hasDocument = true
    empty.hidden = true
    setTools(true)
    applyCadAids()
    rawCommand('zoom\nall')
    setStatus(`${file.name} aberto. OSNAP ativo: Final + Meio + Centro.`)
    postParent('GG_CAD_DOCUMENT_OPENED', { name: file.name, size: file.size })
  } catch (error: any) {
    console.error(error)
    const message = classifyError(error)
    setStatus(message, true)
    showErrorDetail(String(error?.stack || error?.message || error))
    if (!hasDocument) empty.hidden = false
    postParent('GG_CAD_ERROR', { stage: 'open', message, file: file.name })
  } finally {
    setBusy(false)
    requestAnimationFrame(() => setBusy(false))
    setTimeout(() => setBusy(false), 120)
    input.value = ''
  }
}

function execute(command: string, label?: string) {
  if (!initialized || !hasDocument) return
  rawCommand(command)
  if (label) setStatus(label)
}

function chooseFile() {
  input.click()
}

const COMMANDS: Record<string, { command?: string; action?: () => void; label: string }> = {
  L: { command: 'line', label: 'LINHA: indique o primeiro ponto.' },
  LINE: { command: 'line', label: 'LINHA: indique o primeiro ponto.' },
  C: { command: 'circle', label: 'CÍRCULO: indique o centro.' },
  CIRCLE: { command: 'circle', label: 'CÍRCULO: indique o centro.' },
  Z: { command: 'zoom', label: 'ZOOM ativo.' },
  ZE: { command: 'zoom\nall', label: 'Zoom Extents aplicado.' },
  LA: { command: 'layer', label: 'Gerenciador de camadas.' },
  LAYER: { command: 'layer', label: 'Gerenciador de camadas.' },
  DI: { command: 'measuredistance', label: 'DISTÂNCIA: escolha dois pontos.' },
  DIST: { command: 'measuredistance', label: 'DISTÂNCIA: escolha dois pontos.' },
  AREA: { command: 'measurearea', label: 'ÁREA: marque o contorno.' },
  E: { command: 'erase', label: 'APAGAR: selecione os objetos.' },
  ERASE: { command: 'erase', label: 'APAGAR: selecione os objetos.' },
  U: { command: 'undo', label: 'Desfazer.' },
  UNDO: { command: 'undo', label: 'Desfazer.' },
  REDO: { command: 'redo', label: 'Refazer.' },
  OSNAP: { action: toggleOsnap, label: 'Alternar OSNAP.' },
  ORTHO: { action: toggleOrtho, label: 'Alternar ORTHO.' }
}

function runTypedCommand() {
  const value = commandInput.value.trim().toUpperCase()
  commandInput.value = ''
  if (!value) return
  const item = COMMANDS[value]
  if (!item) {
    setStatus(`Comando “${value}” não cadastrado. Use L, C, ZE, LA, DI, AREA, E, U, REDO, OSNAP ou ORTHO.`, true)
    return
  }
  if (item.action) item.action()
  else if (item.command) execute(item.command, item.label)
}

$('openFile')?.addEventListener('click', chooseFile)
$('openFileCenter')?.addEventListener('click', chooseFile)
input.addEventListener('change', () => openDrawing(input.files?.[0]))
$('selectTool')?.addEventListener('click', () => execute('select', 'Selecionar: clique em uma entidade.'))
$('panTool')?.addEventListener('click', () => execute('pan', 'Pan ativo.'))
$('fitView')?.addEventListener('click', () => execute('zoom\nall', 'Zoom Extents aplicado.'))
$('layers')?.addEventListener('click', () => execute('layer', 'Gerenciador de camadas.'))
$('measureDistance')?.addEventListener('click', () => execute('measuredistance', 'Distância: escolha dois pontos com OSNAP.'))
$('measureArea')?.addEventListener('click', () => execute('measurearea', 'Área: marque o contorno.'))
$('lineTool')?.addEventListener('click', () => execute('line', 'Linha: indique o primeiro ponto.'))
$('circleTool')?.addEventListener('click', () => execute('circle', 'Círculo: indique o centro.'))
$('eraseTool')?.addEventListener('click', () => execute('erase', 'Apagar: selecione os objetos.'))
$('undoTool')?.addEventListener('click', () => execute('undo', 'Desfazer.'))
$('redoTool')?.addEventListener('click', () => execute('redo', 'Refazer.'))
$('osnapToggle')?.addEventListener('click', toggleOsnap)
$('orthoToggle')?.addEventListener('click', toggleOrtho)
$('clearMeasurements')?.addEventListener('click', () => execute('clearmeasurements', 'Medições removidas.'))
$('rerunDiagnostics')?.addEventListener('click', () => void runDiagnostics())
$('toggleErrorDetails')?.addEventListener('click', () => {
  errorDetails.hidden = !errorDetails.hidden
})
commandInput?.addEventListener('keydown', event => {
  if (event.key === 'Enter') {
    event.preventDefault()
    runTypedCommand()
  } else if (event.key === 'Escape') {
    commandInput.value = ''
    commandInput.blur()
  }
})

document.addEventListener('keydown', event => {
  if (event.key === 'F3') {
    event.preventDefault()
    toggleOsnap()
  } else if (event.key === 'F8') {
    event.preventDefault()
    toggleOrtho()
  }
})

for (const eventName of ['dragenter', 'dragover']) {
  container.addEventListener(eventName, event => {
    event.preventDefault()
    container.classList.add('dragging')
  })
}
for (const eventName of ['dragleave', 'drop']) {
  container.addEventListener(eventName, event => {
    event.preventDefault()
    container.classList.remove('dragging')
  })
}
container.addEventListener('drop', event => {
  const file = [...(event.dataTransfer?.files || [])].find(f => /\.(dwg|dxf)$/i.test(f.name))
  if (file) void openDrawing(file)
})

window.addEventListener('error', event => {
  const message = `Erro JavaScript: ${event.message || 'desconhecido'}`
  showErrorDetail(`${message}\n${event.filename || ''}:${event.lineno || 0}`)
  postParent('GG_CAD_ERROR', { stage: 'javascript', message })
})
window.addEventListener('unhandledrejection', event => {
  const message = classifyError(event.reason)
  showErrorDetail(String(event.reason?.stack || event.reason || message))
  postParent('GG_CAD_ERROR', { stage: 'promise', message })
})

setTools(false)
updateAidUi()
setBusy(false)
setStatus('Verificando o Mini CAD online…')
void runDiagnostics().finally(() => {
  setBusy(false)
  postParent('GG_CAD_BOOTED', { build: CAD_BUILD })
})
