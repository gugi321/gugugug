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
const empty = $('emptyState') as HTMLElement
const busy = $('busy') as HTMLElement
const busyText = $('busyText') as HTMLElement
const diagnostics = $('diagnostics') as HTMLElement
const errorDetails = $('errorDetails') as HTMLElement

const CAD_BUILD = '2026-10-16-eng-gustavo-g-r10.2'
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

function postParent(type: string, detail: Record<string, unknown> = {}) {
  if (window.parent === window) return
  window.parent.postMessage({ type, build: CAD_BUILD, ...detail }, window.location.origin)
}

function setStatus(message: string, isError = false) {
  statusEl.textContent = message
  statusEl.dataset.kind = isError ? 'error' : 'ok'
}

function setBusy(on: boolean, message = 'Carregando desenho…') {
  busy.hidden = !on
  busyText.textContent = message
}

function setTools(enabled: boolean) {
  for (const id of ['fitView', 'layers', 'measureDistance', 'measureArea', 'clearMeasurements']) {
    const el = $(id) as HTMLButtonElement | null
    if (el) el.disabled = !enabled
  }
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
  checks.push({ label: 'Texto CAD', ok: true, detail: 'renderização principal · menor consumo de memória' })

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

async function ensureViewer(): Promise<boolean> {
  if (initialized) return true
  if (initializing) return initializing

  initializing = (async () => {
    try {
      showErrorDetail('')
      setBusy(true, 'Inicializando o Mini CAD online…')
      setStatus('Preparando o visualizador DWG / DXF…')
      acedApplyUiTheme('light', host)

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
    setStatus(`${file.name} aberto. Use Camadas, Distância ou Área para revisar o desenho.`)
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
    input.value = ''
  }
}

function execute(command: string) {
  if (!initialized || !hasDocument) return
  try {
    AcApDocManager.instance.sendStringToExecute(command)
  } catch (error) {
    const message = classifyError(error)
    setStatus(message, true)
    showErrorDetail(String((error as any)?.stack || error))
  }
}

function chooseFile() {
  input.click()
}

$('openFile')?.addEventListener('click', chooseFile)
$('openFileCenter')?.addEventListener('click', chooseFile)
input.addEventListener('change', () => openDrawing(input.files?.[0]))
$('fitView')?.addEventListener('click', () => execute('zoom\nall'))
$('layers')?.addEventListener('click', () => execute('layer'))
$('measureDistance')?.addEventListener('click', () => execute('measuredistance'))
$('measureArea')?.addEventListener('click', () => execute('measurearea'))
$('clearMeasurements')?.addEventListener('click', () => execute('clearmeasurements'))
$('rerunDiagnostics')?.addEventListener('click', () => void runDiagnostics())
$('toggleErrorDetails')?.addEventListener('click', () => {
  errorDetails.hidden = !errorDetails.hidden
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
setStatus('Verificando o Mini CAD online…')
void runDiagnostics().finally(() => {
  postParent('GG_CAD_BOOTED', { build: CAD_BUILD })
})
