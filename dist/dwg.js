const $ = id => document.getElementById(id);

const CAD_VERSION = '0.8.0';
const CAD_MODULE_URL = new URL('vendor/cad/cad-viewer.es.js', document.baseURI).href;
const CAD_STYLE_URL = new URL('vendor/cad/style.css', document.baseURI).href;
const CAD_WASM_BASE = new URL('wasm/', document.baseURI).href;
const CAD_WORKER_URL = new URL('wasm/dwg-worker.js', document.baseURI).href;

function ensureStylesheet(id, href) {
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}
ensureStylesheet('gg-dwg-style', 'dwg.css');
ensureStylesheet('gg-cad-viewer-style', CAD_STYLE_URL);

function setBuildLabel() {
  const label = document.querySelector('.build-version');
  if (label) label.textContent = '11/10/2026 · tema claro · DWG local · quantitativos';
}

function closeSidebar() {
  document.body.classList.add('sidebar-hidden');
  $('sidebarToggle')?.setAttribute('aria-expanded', 'false');
  $('sidebarBackdrop')?.setAttribute('aria-hidden', 'true');
}

function ensureSidebarControls() {
  const sidebar = $('sidebar');
  const main = document.querySelector('main');
  if (!sidebar || !main) return;
  if (!$('sidebarClose')) {
    const top = document.createElement('div');
    top.className = 'sidebar-mobile-head';
    top.innerHTML = '<strong>Ferramentas</strong><button id="sidebarClose" type="button" aria-label="Fechar menu">× Fechar</button>';
    sidebar.prepend(top);
    $('sidebarClose').onclick = closeSidebar;
  }
  if (!$('sidebarBackdrop')) {
    const backdrop = document.createElement('button');
    backdrop.id = 'sidebarBackdrop';
    backdrop.type = 'button';
    backdrop.setAttribute('aria-label', 'Fechar menu lateral');
    backdrop.setAttribute('aria-hidden', document.body.classList.contains('sidebar-hidden') ? 'true' : 'false');
    main.appendChild(backdrop);
    backdrop.onclick = closeSidebar;
  }
  new MutationObserver(() => {
    const hidden = document.body.classList.contains('sidebar-hidden');
    $('sidebarToggle')?.setAttribute('aria-expanded', String(!hidden));
    $('sidebarBackdrop')?.setAttribute('aria-hidden', String(hidden));
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

function ensureDwgUi() {
  if ($('dwgTab')) return;
  const nav = document.querySelector('.project-tabs');
  const workspace = $('projectWorkspace');
  if (!nav || !workspace) return;

  const tab = document.createElement('button');
  tab.id = 'dwgTab';
  tab.type = 'button';
  tab.setAttribute('aria-pressed', 'false');
  tab.setAttribute('data-owner-control', '');
  tab.textContent = 'DWG';
  nav.appendChild(tab);

  const section = document.createElement('section');
  section.id = 'dwgDialog';
  section.hidden = true;
  section.setAttribute('data-owner-control', '');
  section.setAttribute('aria-label', 'Leitor DWG e DXF');
  section.innerHTML = `
    <div class="dwg-head">
      <div class="dwg-head-copy"><span class="eyebrow">CAD LOCAL</span><h2>DWG / DXF</h2><p>Motor, worker e WebAssembly hospedados neste aplicativo.</p></div>
      <div class="dwg-head-actions">
        <button id="openDWG" class="primary" type="button" data-owner-control>＋ Abrir DWG</button>
        <button id="openAnotherDWG" type="button" data-owner-control>Abrir outro</button>
        <button id="dwgCancel" type="button" hidden>Cancelar</button>
        <button id="dwgFit" type="button" disabled>Enquadrar</button>
        <button id="dwgFullscreen" type="button">⛶</button>
        <button id="closeDWG" type="button">Voltar ao 3D</button>
      </div>
      <input id="dwgFile" type="file" accept=".dwg,.dxf,application/acad,application/x-acad" hidden data-owner-control>
    </div>
    <div class="dwg-workspace">
      <div id="dwgCanvasWrap" tabindex="0">
        <div id="dwgStage"></div>
        <div id="dwgEmpty"><div class="dwg-empty-card"><div class="dwg-file-icon">DWG</div><strong>Abra um desenho CAD</strong><p>O arquivo permanece no seu navegador. DWG usa worker + WASM local; DXF usa o parser CAD local.</p></div></div>
        <div class="dwg-toolbar"><button id="dwgZoomOut" type="button" disabled>−</button><button id="dwgZoomIn" type="button" disabled>＋</button><button id="dwgFitBottom" type="button" disabled>Enquadrar</button></div>
        <div id="dwgDropHint">Solte o DWG aqui</div>
      </div>
      <aside class="dwg-side">
        <h3>Desenho</h3>
        <div id="dwgFileName" class="dwg-file-name">Nenhum arquivo aberto</div>
        <div id="dwgFileMeta" class="dwg-file-meta">DWG e DXF</div>
        <div class="dwg-progress" id="dwgProgress" hidden><div id="dwgProgressBar"></div></div>
        <p id="dwgStatus" role="status">Verificando o motor CAD…</p>
        <div id="dwgDiagnostics" class="dwg-diagnostics"></div>
        <div id="dwgStats" class="dwg-stats"></div>
      </aside>
    </div>`;
  workspace.appendChild(section);
}

ensureDwgUi();
ensureSidebarControls();
setBuildLabel();

const tab = $('dwgTab');
const workspace = $('projectWorkspace');
const panel = $('dwgDialog');
const input = $('dwgFile');
const stage = $('dwgStage');
const wrap = $('dwgCanvasWrap');
const statusEl = $('dwgStatus');
const progress = $('dwgProgress');
const progressBar = $('dwgProgressBar');
const diagnosticsEl = $('dwgDiagnostics');
const statsEl = $('dwgStats');
let cadModulePromise = null;
let cadViewer = null;
let activeAbort = null;
let runtimeReady = false;

function setStatus(message, kind = '') {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.dataset.kind = kind;
}
function setProgress(value, visible = true) {
  if (!progress || !progressBar) return;
  progress.hidden = !visible;
  progressBar.style.width = `${Math.max(0, Math.min(100, Number(value) || 0))}%`;
}
function humanSize(bytes) {
  const units = ['B','KB','MB','GB']; let value = Number(bytes) || 0, unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; }
  return `${value >= 100 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}
function diagRow(label, ok, detail = '') {
  return `<span><b>${label}</b><em class="${ok ? 'ok' : 'bad'}">${ok ? 'OK' : 'Falha'}</em>${detail ? `<small>${detail}</small>` : ''}</span>`;
}

async function assetCheck(url, label, expectedType = '') {
  try {
    const response = await fetch(url, { method:'GET', cache:'no-store', headers:{ Range:'bytes=0-15' } });
    if (!response.ok && response.status !== 206) throw new Error(`HTTP ${response.status}`);
    const type = response.headers.get('content-type') || '';
    if (expectedType && !type.includes(expectedType)) throw new Error(`MIME ${type || 'ausente'}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (label === 'WASM' && bytes.length >= 4 && !(bytes[0]===0 && bytes[1]===97 && bytes[2]===115 && bytes[3]===109)) throw new Error('assinatura inválida');
    return { label, ok:true, detail:type || 'disponível' };
  } catch (error) {
    return { label, ok:false, detail:String(error?.message || error) };
  }
}

async function diagnoseRuntime() {
  setStatus('Verificando motor DWG local…', 'busy');
  const checks = await Promise.all([
    assetCheck(CAD_MODULE_URL, 'Motor CAD', 'javascript'),
    assetCheck(CAD_WORKER_URL, 'Worker', 'javascript'),
    assetCheck(new URL('libredwg-web.js', CAD_WASM_BASE).href, 'LibreDWG JS', 'javascript'),
    assetCheck(new URL('libredwg-web.wasm', CAD_WASM_BASE).href, 'WASM', 'application/wasm')
  ]);
  if (diagnosticsEl) diagnosticsEl.innerHTML = checks.map(c => diagRow(c.label,c.ok,c.detail)).join('');
  runtimeReady = checks.every(c => c.ok);
  if (!runtimeReady) {
    setStatus('O runtime DWG local ainda não está completo neste deploy. Atualize a página depois que a publicação terminar.', 'error');
    return false;
  }
  setStatus('Motor DWG local pronto.', 'ok');
  return true;
}

function activateDwg() {
  if (document.body.classList.contains('readonly')) return;
  workspace?.classList.remove('pdf-active');
  workspace?.classList.add('dwg-active');
  if (panel) panel.hidden = false;
  tab?.classList.add('active');
  tab?.setAttribute('aria-pressed', 'true');
  for (const id of ['modelTab','pdfTab']) { $(id)?.classList.remove('active'); $(id)?.setAttribute('aria-pressed','false'); }
  closeSidebar();
  requestAnimationFrame(() => cadViewer?.fit?.());
}
function deactivateDwg() {
  workspace?.classList.remove('dwg-active');
  if (panel) panel.hidden = true;
  tab?.classList.remove('active');
  tab?.setAttribute('aria-pressed','false');
}

async function getCadModule() {
  if (!cadModulePromise) cadModulePromise = import(CAD_MODULE_URL).catch(error => {
    cadModulePromise = null;
    throw new Error(`Motor CAD não carregou: ${error?.message || error}`);
  });
  return cadModulePromise;
}

async function ensureViewer() {
  if (cadViewer) return cadViewer;
  if (!runtimeReady && !(await diagnoseRuntime())) throw new Error('Runtime DWG local indisponível.');
  const mod = await getCadModule();
  if (!mod?.CadViewer) throw new Error('CadViewer não foi exportado pelo motor local.');
  stage.replaceChildren();
  cadViewer = new mod.CadViewer({
    container: stage,
    renderer: 'auto',
    wasmPath: CAD_WASM_BASE,
    workerUrl: CAD_WORKER_URL,
    workerTimeoutMs: 180000,
    autoFit: true,
    canvasOptions: {
      background:'#f7f8f8', foreground:'#17272e', fitMode:'auto', contrastMode:'adaptive', minColorContrast:2.6,
      enableSpatialIndex:true, spatialIndexCellCount:96, maxCurveSegments:matchMedia('(max-width:760px)').matches ? 48 : 72,
      textMinPixelHeight:4, maxVisibleTextLabels:matchMedia('(max-width:760px)').matches ? 1000 : 2200
    },
    onLoadProgress: event => {
      const p = Number(event?.percent);
      setProgress(Number.isFinite(p) ? p : 12, true);
      setStatus(event?.message || 'Processando DWG…', 'busy');
    },
    onError: error => setStatus(error?.message || 'Falha no motor CAD.', 'error')
  });
  try { await cadViewer.preloadDwg?.({ workerUrl: CAD_WORKER_URL, wasmPath: CAD_WASM_BASE, workerTimeoutMs: 60000 }); } catch (error) { console.warn('DWG preload', error); }
  return cadViewer;
}

function validate(file) {
  if (!file || !/\.(dwg|dxf)$/i.test(file.name)) throw new Error('Selecione um arquivo .dwg ou .dxf.');
  const mobile = matchMedia('(max-width:760px)').matches;
  const maxMb = mobile ? 180 : 700;
  const sizeMb = file.size / 1048576;
  if (sizeMb > maxMb) throw new Error(`Arquivo com ${sizeMb.toFixed(0)} MB. Limite desta tela: ${maxMb} MB.`);
}

function setControls(enabled) {
  for (const id of ['dwgFit','dwgFitBottom','dwgZoomIn','dwgZoomOut']) if ($(id)) $(id).disabled = !enabled;
}

async function openDrawing(file) {
  try { validate(file); } catch (error) { setStatus(error.message,'error'); return; }
  activateDwg();
  $('dwgFileName').textContent = file.name;
  $('dwgFileMeta').textContent = `${humanSize(file.size)} · ${/\.dxf$/i.test(file.name) ? 'DXF' : 'DWG'} · processamento local`;
  $('dwgEmpty').hidden = true;
  $('openDWG').disabled = true;
  $('openAnotherDWG').disabled = true;
  $('dwgCancel').hidden = false;
  setControls(false);
  statsEl.textContent = '';
  setProgress(5,true);
  setStatus('Preparando o desenho…','busy');
  activeAbort?.abort();
  activeAbort = new AbortController();
  try {
    const viewer = await ensureViewer();
    viewer.clear?.();
    await viewer.loadFile(file, {
      signal:activeAbort.signal,
      useWorker:/\.dwg$/i.test(file.name),
      workerUrl:CAD_WORKER_URL,
      wasmPath:CAD_WASM_BASE,
      workerTimeoutMs:180000
    });
    viewer.fit?.();
    setControls(true);
    setProgress(100,true);
    setStatus('Desenho carregado. Arraste para mover e use a roda/dois dedos para ampliar.','ok');
    const doc = viewer.getSourceDocument?.() || viewer.getDocument?.();
    const entityCount = Array.isArray(doc?.entities) ? doc.entities.length : Array.isArray(doc?.modelSpace?.entities) ? doc.modelSpace.entities.length : 0;
    const layers = doc?.layers || doc?.tables?.layers;
    const layerCount = Array.isArray(layers) ? layers.length : 0;
    statsEl.innerHTML = `${entityCount ? `<span><b>${entityCount.toLocaleString('pt-BR')}</b> entidades</span>` : ''}${layerCount ? `<span><b>${layerCount.toLocaleString('pt-BR')}</b> camadas</span>` : ''}`;
    setTimeout(()=>setProgress(0,false),700);
  } catch (error) {
    console.error('DWG',error);
    $('dwgEmpty').hidden = false;
    setControls(false);
    setProgress(0,false);
    if (error?.name === 'AbortError') setStatus('Leitura cancelada.','');
    else setStatus(`Não foi possível abrir o desenho: ${error?.message || error}`,'error');
  } finally {
    $('openDWG').disabled = false;
    $('openAnotherDWG').disabled = false;
    $('dwgCancel').hidden = true;
    activeAbort = null;
    input.value = '';
  }
}

function chooseFile(){ input?.click(); }
tab?.addEventListener('click',()=>{activateDwg(); diagnoseRuntime();});
$('modelTab')?.addEventListener('click',deactivateDwg);
$('pdfTab')?.addEventListener('click',deactivateDwg);
$('projectPDFs')?.addEventListener('click',deactivateDwg);
$('closeDWG')?.addEventListener('click',()=>{deactivateDwg();$('modelTab')?.click();});
$('openDWG')?.addEventListener('click',chooseFile);
$('openAnotherDWG')?.addEventListener('click',chooseFile);
input?.addEventListener('change',()=>openDrawing(input.files?.[0]));
$('dwgCancel')?.addEventListener('click',()=>activeAbort?.abort());
for (const id of ['dwgFit','dwgFitBottom']) $(id)?.addEventListener('click',()=>cadViewer?.fit?.());
$('dwgZoomIn')?.addEventListener('click',()=>cadViewer?.zoomIn?.());
$('dwgZoomOut')?.addEventListener('click',()=>cadViewer?.zoomOut?.());
$('dwgFullscreen')?.addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await panel?.requestFullscreen?.();}catch{setStatus('Tela cheia indisponível neste navegador.','error');}});

if (wrap) {
  for (const type of ['dragenter','dragover']) wrap.addEventListener(type,event=>{if(document.body.classList.contains('readonly'))return;event.preventDefault();wrap.classList.add('dwg-drag');});
  for (const type of ['dragleave','drop']) wrap.addEventListener(type,event=>{if(document.body.classList.contains('readonly'))return;event.preventDefault();wrap.classList.remove('dwg-drag');});
  wrap.addEventListener('drop',event=>{const file=[...(event.dataTransfer?.files||[])].find(f=>/\.(dwg|dxf)$/i.test(f.name));if(file)openDrawing(file);else setStatus('Solte um arquivo DWG ou DXF.','error');});
}

if (document.body.classList.contains('readonly') && tab) tab.hidden = true;
new MutationObserver(()=>{
  const ro=document.body.classList.contains('readonly');
  if(tab)tab.hidden=ro;
  if(ro&&workspace?.classList.contains('dwg-active')){deactivateDwg();$('modelTab')?.click();}
}).observe(document.body,{attributes:true,attributeFilter:['class']});

document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  if(!document.body.classList.contains('sidebar-hidden')){closeSidebar();return;}
  if(workspace?.classList.contains('dwg-active')){deactivateDwg();$('modelTab')?.click();}
});
