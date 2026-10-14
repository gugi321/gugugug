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

const workerUrls = {
  mtextRender: new URL('./assets/mtext-renderer-worker.js', document.baseURI).href,
  dwgParser: new URL('./assets/libredwg-parser-worker.js', document.baseURI).href
}

let initialized = false
let initializing: Promise<boolean> | null = null
let hasDocument = false

function setStatus(message: string) {
  statusEl.textContent = message
}

function setBusy(on: boolean, message = 'Carregando desenho…') {
  busy.hidden = !on
  busyText.textContent = message
}

function setTools(enabled: boolean) {
  for (const id of ['fitView', 'layers', 'measureDistance', 'measureArea']) {
    const el = $(id) as HTMLButtonElement | null
    if (el) el.disabled = !enabled
  }
}

async function ensureViewer(): Promise<boolean> {
  if (initialized) return true
  if (initializing) return initializing

  initializing = (async () => {
    try {
      setBusy(true, 'Inicializando o motor CAD…')
      setStatus('Preparando o visualizador DWG / DXF…')
      acedApplyUiTheme('light', host)

      const converter = new AcDbLibreDwgConverter({
        convertByEntityType: false,
        useWorker: true,
        parserWorkerUrl: workerUrls.dwgParser
      })
      AcDbDatabaseConverterManager.instance.register(AcDbFileType.DWG, converter)

      const ready = await AcApDocManager.checkWebworkerReadiness(workerUrls)
      workerStatus.textContent = ready ? 'Motor CAD: OK' : 'Motor CAD: falha nos workers'
      if (!ready) {
        throw new Error('Os arquivos do motor DWG não foram encontrados. Execute novamente o publicador do aplicativo.')
      }

      AcApDocManager.createInstance({
        container,
        busyIndicatorHost: host,
        autoResize: true,
        baseUrl: 'https://cdn.jsdelivr.net/gh/mlightcad/cad-data@main/',
        webworkerFileUrls: workerUrls,
        checkWorkersOnInit: true,
        disableExport: true
      })

      await acuiRegisterSimpleUiPlugin(AcApDocManager.instance.pluginManager, {
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
            acuiToolbarPreset('zoom'),
            acuiCreateToolbarSeparator('sep-view'),
            acuiToolbarPreset('layer'),
            acuiToolbarPreset('measure'),
            acuiCreateToolbarSeparator('sep-bg'),
            acuiToolbarPreset('switch-bg')
          ]
        }
      })

      initialized = true
      setStatus('Mini CAD pronto. Abra um DWG ou DXF.')
      return true
    } catch (error: any) {
      console.error(error)
      workerStatus.textContent = 'Motor CAD: erro'
      setStatus(`Erro ao iniciar CAD: ${error?.message || error}`)
      return false
    } finally {
      setBusy(false)
      initializing = null
    }
  })()

  return initializing
}

async function openDrawing(file?: File) {
  if (!file) return
  if (!/\.(dwg|dxf)$/i.test(file.name)) {
    setStatus('Selecione um arquivo DWG ou DXF.')
    return
  }

  const sizeMb = file.size / 1048576
  if (sizeMb > 500) {
    setStatus(`Arquivo com ${sizeMb.toFixed(0)} MB. Para manter o navegador estável, use DWG/DXF de até 500 MB.`)
    return
  }

  const ok = await ensureViewer()
  if (!ok) return

  try {
    setBusy(true, `Abrindo ${file.name}…`)
    setStatus(`Lendo ${file.name} (${sizeMb.toFixed(1)} MB)…`)
    const buffer = await file.arrayBuffer()
    await AcApDocManager.instance.openDocument(file.name, buffer, {
      progressiveRendering: true,
      circleSides: 64
    } as any)

    hasDocument = true
    empty.hidden = true
    setTools(true)
    setStatus(`${file.name} aberto. Use Camadas, Distância ou Área para revisar o desenho.`)
    input.value = ''
  } catch (error: any) {
    console.error(error)
    const message = String(error?.message || error || 'Falha desconhecida')
    setStatus(`Não foi possível abrir o DWG: ${message}`)
    if (!hasDocument) empty.hidden = false
  } finally {
    setBusy(false)
  }
}

function execute(command: string) {
  if (!initialized || !hasDocument) return
  AcApDocManager.instance.sendStringToExecute(command)
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
  if (file) openDrawing(file)
})

setTools(false)
void ensureViewer()
