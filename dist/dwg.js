const $ = id => document.getElementById(id);

const CAD_VERSION = '0.8.0';
const CAD_MODULE_URL = `https://cdn.jsdelivr.net/npm/@flyfish-dev/cad-viewer@${CAD_VERSION}/+esm`;
const CAD_STYLE_URL = `https://cdn.jsdelivr.net/npm/@flyfish-dev/cad-viewer@${CAD_VERSION}/dist/style.css`;
const CAD_WASM_BASE = `https://cdn.jsdelivr.net/npm/@flyfish-dev/cad-viewer@${CAD_VERSION}/dist/wasm`;
const CAD_WORKER_URL = `${CAD_WASM_BASE}/dwg-worker.js`;

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
  if (label) label.textContent = '11/10/2026 · tema escuro · DWG · quantitativos';
}

function closeSidebar() {
  document.body.classList.add('sidebar-hidden');
  $('sidebarToggle')?.setAttribute('aria-expanded', 'false');
  $('sidebarBackdrop')?.setAttribute('aria-hidden', 'true');
}

function ensureSidebarEnhancements() {
  const sidebar = $('sidebar');
  const main = document.querySelector('main');
  if (!sidebar || !main) return;

  if (!$('sidebarClose')) {
    const top = document.createElement('div');
    top.className = 'sidebar-mobile-head';
    top.innerHTML = `<strong>Ferramentas do projeto</strong><button id="sidebarClose" type="button" aria-label="Fechar menu lateral">× Fechar</button>`;
    sidebar.prepend(top);
    $('sidebarClose').addEventListener('click', closeSidebar);
  }

  if (!$('projectQuickTools')) {
    const tools = document.createElement('section');
    tools.id = 'projectQuickTools';
    tools.className = 'project-quick-tools';
    tools.innerHTML = `
      <div class="eyebrow">PROJETO <span>00</span></div>
      <button id="quantitiesOpen" type="button" class="sidebar-feature">▦ Quantitativos</button>
      <div class="sidebar-quick-row">
        <button id="sidebarFit" type="button">Enquadrar</button>
        <button id="sidebarShowAll" type="button">Mostrar tudo</button>
      </div>`;
    const anchor = sidebar.querySelector('.eyebrow');
    if (anchor) sidebar.insertBefore(tools, anchor);
    else sidebar.appendChild(tools);
    $('sidebarFit').addEventListener('click', () => {
      $('fit')?.click();
      if (matchMedia('(max-width:760px)').matches) closeSidebar();
    });
    $('sidebarShowAll').addEventListener('click', () => $('all')?.click());
    $('quantitiesOpen').addEventListener('click', openQuantities);
  }

  if (!$('sidebarBackdrop')) {
    const backdrop = document.createElement('button');
    backdrop.id = 'sidebarBackdrop';
    backdrop.type = 'button';
    backdrop.setAttribute('aria-label', 'Fechar menu lateral');
    backdrop.setAttribute('aria-hidden', document.body.classList.contains('sidebar-hidden') ? 'true' : 'false');
    main.appendChild(backdrop);
    backdrop.addEventListener('click', closeSidebar);
  }

  new MutationObserver(() => {
    const hidden = document.body.classList.contains('sidebar-hidden');
    $('sidebarToggle')?.setAttribute('aria-expanded', String(!hidden));
    $('sidebarBackdrop')?.setAttribute('aria-hidden', String(hidden));
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

function ensureQuantitiesDialog() {
  if ($('quantitiesDialog')) return $('quantitiesDialog');
  const dialog = document.createElement('dialog');
  dialog.id = 'quantitiesDialog';
  dialog.innerHTML = `
    <div class="dialog-head quantity-head">
      <div><span class="eyebrow">IFC · RESUMO DO PROJETO</span><h2>Quantitativos</h2></div>
      <button id="quantitiesClose" type="button" aria-label="Fechar quantitativos">×</button>
    </div>
    <p class="quantity-note">Contagem automática dos objetos presentes no IFC. Os valores são extraídos do modelo carregado; a lista de camadas do aplicativo trabalha por objeto IFC.</p>
    <div id="quantityCards" class="quantity-cards"></div>
    <div class="quantity-toolbar"><strong>Elementos por categoria</strong><button id="quantitiesRefresh" type="button">Atualizar</button><button id="quantitiesCsv" type="button">Baixar CSV</button></div>
    <div id="quantityTableWrap" class="quantity-table-wrap"></div>
    <p class="quantity-footnote">Para orçamento executivo, confirme volumes, áreas e pesos nas propriedades/quantidades exportadas pelo software de origem. Esta tela não inventa quantitativos ausentes no IFC.</p>`;
  document.body.appendChild(dialog);
  $('quantitiesClose').addEventListener('click', () => dialog.close());
  $('quantitiesRefresh').addEventListener('click', renderQuantities);
  $('quantitiesCsv').addEventListener('click', exportQuantitiesCsv);
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  return dialog;
}

function snapshotLayerCounts() {
  const search = $('layerSearch');
  const previous = search?.value ?? '';
  if (search && previous) {
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const rows = [...document.querySelectorAll('#layers .layer')].map(label => {
    const name = label.querySelector('span')?.textContent?.trim() || 'Outros';
    const count = Number((label.querySelector('b')?.textContent || '0').replace(/\D/g, '')) || 0;
    const visible = Boolean(label.querySelector('input')?.checked);
    return { name, count, visible };
  }).filter(row => row.count > 0);
  if (search && previous) {
    search.value = previous;
    search.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));
}

function currentProjectSnapshot() {
  const rows = snapshotLayerCounts();
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const visibleCategories = rows.filter(row => row.visible).reduce((sum, row) => sum + row.count, 0);
  const countText = $('count')?.textContent || '';
  const match = countText.match(/([\d.]+)\s*\/\s*([\d.]+)/);
  const visible = match ? Number(match[1].replace(/\./g, '')) : visibleCategories;
  const totalFromStatus = match ? Number(match[2].replace(/\./g, '')) : total;
  return { file: $('filename')?.textContent?.trim() || 'Nenhum IFC aberto', pdfs: Number($('pdfCount')?.textContent || 0) || 0, visible, total: totalFromStatus || total, rows };
}

function renderQuantities() {
  const data = currentProjectSnapshot();
  const cards = $('quantityCards');
  const wrap = $('quantityTableWrap');
  if (!cards || !wrap) return;
  const format = value => Number(value || 0).toLocaleString('pt-BR');
  cards.innerHTML = `<article><span>Objetos IFC</span><strong>${format(data.total)}</strong></article><article><span>Visíveis agora</span><strong>${format(data.visible)}</strong></article><article><span>Categorias</span><strong>${format(data.rows.length)}</strong></article><article><span>PDFs vinculados</span><strong>${format(data.pdfs)}</strong></article>`;
  if (!data.rows.length) {
    wrap.innerHTML = '<div class="quantity-empty">Abra um IFC para gerar os quantitativos do projeto.</div>';
    $('quantitiesCsv').disabled = true;
    return;
  }
  $('quantitiesCsv').disabled = false;
  const body = data.rows.map(row => `<tr><td>${escapeHtml(row.name)}</td><td>${format(row.count)}</td><td><span class="quantity-state ${row.visible ? 'on' : 'off'}">${row.visible ? 'Visível' : 'Oculta'}</span></td></tr>`).join('');
  wrap.innerHTML = `<table class="quantity-table"><thead><tr><th>Categoria</th><th>Quantidade</th><th>Camada</th></tr></thead><tbody>${body}</tbody></table><div class="quantity-project-name">${escapeHtml(data.file)}</div>`;
}

function exportQuantitiesCsv() {
  const data = currentProjectSnapshot();
  if (!data.rows.length) return;
  const lines = [['Arquivo', data.file], ['Objetos IFC', data.total], ['Visíveis', data.visible], ['PDFs vinculados', data.pdfs], [], ['Categoria', 'Quantidade', 'Visível']];
  data.rows.forEach(row => lines.push([row.name, row.count, row.visible ? 'Sim' : 'Não']));
  const csv = '\ufeff' + lines.map(row => row.map(csvCell).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'quantitativos-ifc.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function csvCell(value = '') { return `"${String(value).replace(/"/g, '""')}"`; }
function escapeHtml(text = '') { return String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
function openQuantities() {
  const dialog = ensureQuantitiesDialog();
  renderQuantities();
  closeSidebar();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
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
  section.setAttribute('aria-label', 'Leitor DWG');
  section.innerHTML = `
    <div class="dwg-head">
      <div class="dwg-head-copy"><span class="eyebrow">CAD LOCAL</span><h2>Leitor DWG / DXF</h2><p>Processamento no navegador · arquivo não é enviado automaticamente.</p></div>
      <div class="dwg-head-actions"><button id="openDWG" class="primary" type="button" data-owner-control>＋ Abrir DWG</button><button id="openAnotherDWG" type="button" data-owner-control>Abrir outro</button><button id="dwgCancel" type="button" hidden>Cancelar</button><button id="dwgSnapshot" type="button" disabled>Imagem</button><button id="closeDWG" type="button">Voltar ao 3D</button></div>
      <input id="dwgFile" type="file" accept=".dwg,.dxf,application/acad,application/x-acad" hidden data-owner-control>
    </div>
    <div class="dwg-workspace">
      <div id="dwgCanvasWrap" tabindex="0"><div id="dwgStage"></div><div id="dwgEmpty"><div class="dwg-empty-card"><div class="dwg-file-icon">DWG</div><strong>Abra um desenho CAD</strong><p>Toque em “Abrir DWG” ou arraste o arquivo para esta área.</p><small>DWG é processado com Web Worker + LibreDWG; DXF usa o leitor CAD do navegador.</small></div></div><div class="dwg-toolbar"><button id="dwgZoomOut" type="button" title="Afastar">−</button><button id="dwgZoomIn" type="button" title="Aproximar">＋</button><button id="dwgFit" type="button">Enquadrar</button><button id="dwgTheme" type="button">Fundo claro</button><button id="dwgFullscreen" type="button">⛶ Tela cheia</button></div><div id="dwgDropHint">Solte o DWG aqui</div></div>
      <aside class="dwg-side"><h3>Desenho</h3><div id="dwgFileName" class="dwg-file-name">Nenhum DWG aberto</div><div id="dwgFileMeta" class="dwg-file-meta">Selecione um arquivo para iniciar.</div><div class="dwg-progress" id="dwgProgress" hidden><div id="dwgProgressBar"></div></div><p id="dwgStatus" role="status"></p><div id="dwgStats" class="dwg-stats"></div><p class="dwg-note">Leitor CAD: @flyfish-dev/cad-viewer + LibreDWG. Objetos/proxies proprietários do AutoCAD podem ter representação parcial.</p></aside>
    </div>`;
  workspace.appendChild(section);
}

ensureDwgUi();
ensureSidebarEnhancements();
ensureQuantitiesDialog();
setBuildLabel();

const tab = $('dwgTab');
const workspace = $('projectWorkspace');
const panel = $('dwgDialog');
const input = $('dwgFile');
const stage = $('dwgStage');
const wrap = $('dwgCanvasWrap');
const statusEl = $('dwgStatus');
const fileNameEl = $('dwgFileName');
const fileMetaEl = $('dwgFileMeta');
const progress = $('dwgProgress');
const progressBar = $('dwgProgressBar');
const statsEl = $('dwgStats');
let cadModulePromise = null;
let cadViewer = null;
let activeAbort = null;
let workerBlobUrl = null;
let drawingIsDark = true;

function setDwgStatus(message, kind = '') { if (statusEl) { statusEl.textContent = message || ''; statusEl.dataset.kind = kind; } }
function setDwgProgress(value, visible = true) { if (!progress || !progressBar) return; progress.hidden = !visible; progressBar.style.width = `${Math.max(0, Math.min(100, Number(value) || 0))}%`; }
function humanSize(bytes) { const units = ['B','KB','MB','GB']; let value = Number(bytes) || 0, unit = 0; while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit++; } return `${value >= 100 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`; }

function activateDwg() {
  if (document.body.classList.contains('readonly')) return;
  workspace?.classList.remove('pdf-active');
  workspace?.classList.add('dwg-active');
  if (panel) panel.hidden = false;
  tab?.classList.add('active');
  tab?.setAttribute('aria-pressed', 'true');
  for (const id of ['modelTab','pdfTab']) { $(id)?.classList.remove('active'); $(id)?.setAttribute('aria-pressed', 'false'); }
  closeSidebar();
  requestAnimationFrame(() => cadViewer?.fit?.());
}
function deactivateDwg() { workspace?.classList.remove('dwg-active'); if (panel) panel.hidden = true; tab?.classList.remove('active'); tab?.setAttribute('aria-pressed', 'false'); }

tab?.addEventListener('click', activateDwg);
$('modelTab')?.addEventListener('click', deactivateDwg);
$('pdfTab')?.addEventListener('click', deactivateDwg);
$('projectPDFs')?.addEventListener('click', deactivateDwg);
$('closeDWG')?.addEventListener('click', () => { deactivateDwg(); $('modelTab')?.click(); });

async function getCadModule() {
  if (!cadModulePromise) {
    setDwgStatus('Carregando o motor CAD…', 'busy');
    cadModulePromise = import(CAD_MODULE_URL).catch(error => { cadModulePromise = null; throw new Error(`Não foi possível carregar o motor CAD: ${error?.message || error}`); });
  }
  return cadModulePromise;
}
function getWorkerFactory() {
  if (!workerBlobUrl) workerBlobUrl = URL.createObjectURL(new Blob([`import ${JSON.stringify(CAD_WORKER_URL)};`], { type: 'text/javascript' }));
  return () => new Worker(workerBlobUrl, { type: 'module', name: 'gg-dwg-worker' });
}
async function ensureCadViewer() {
  if (cadViewer) return cadViewer;
  const mod = await getCadModule();
  if (!mod?.CadViewer) throw new Error('O módulo CAD foi carregado sem o componente de visualização.');
  stage.replaceChildren();
  cadViewer = new mod.CadViewer({
    container: stage,
    renderer: 'auto',
    wasmPath: CAD_WASM_BASE,
    workerFactory: getWorkerFactory(),
    workerTimeoutMs: 180000,
    autoFit: true,
    canvasOptions: { background:'#090d12', foreground:'#f2f5f7', fitMode:'auto', contrastMode:'adaptive', minColorContrast:2.45, showPageBounds:true, showUnsupportedMarkers:false, enableSpatialIndex:true, spatialIndexCellCount:80, maxCurveSegments:matchMedia('(max-width:760px)').matches ? 48 : 72, textMinPixelHeight:4, maxVisibleTextLabels:matchMedia('(max-width:760px)').matches ? 1200 : 2400 },
    onLoadProgress: event => { const percent = Number(event?.percent); setDwgProgress(Number.isFinite(percent) ? percent : 12, true); setDwgStatus(event?.message || 'Processando o desenho…', 'busy'); },
    onError: error => setDwgStatus(error?.message || 'Erro no leitor CAD.', 'error')
  });
  return cadViewer;
}
function validateCadFile(file) {
  if (!file) throw new Error('Selecione um arquivo DWG ou DXF.');
  if (!/\.(dwg|dxf)$/i.test(file.name)) throw new Error('O arquivo precisa ser DWG ou DXF.');
  const mobile = matchMedia('(max-width:760px)').matches;
  const max = mobile ? 180 : 700;
  const sizeMb = file.size / (1024 * 1024);
  if (sizeMb > max) throw new Error(`Arquivo com ${sizeMb.toFixed(0)} MB. O limite desta tela é ${max} MB para evitar travamento do navegador.`);
}
async function readDrawing(file) {
  try { validateCadFile(file); } catch (error) { setDwgStatus(error.message, 'error'); return; }
  activateDwg();
  fileNameEl.textContent = file.name;
  fileMetaEl.textContent = `${humanSize(file.size)} · ${/\.dxf$/i.test(file.name) ? 'DXF' : 'DWG'} · processamento local`;
  $('dwgEmpty').hidden = true;
  $('openDWG').disabled = true;
  $('openAnotherDWG').disabled = true;
  $('dwgCancel').hidden = false;
  $('dwgSnapshot').disabled = true;
  statsEl.textContent = '';
  setDwgProgress(5, true);
  setDwgStatus('Preparando o leitor CAD…', 'busy');
  if (activeAbort) activeAbort.abort();
  activeAbort = new AbortController();
  try {
    const viewer = await ensureCadViewer();
    viewer.clear?.();
    await viewer.loadFile(file, { signal: activeAbort.signal, useWorker: true });
    viewer.fit?.();
    setDwgProgress(100, true);
    setDwgStatus('Desenho carregado. Arraste para mover, use dois dedos para zoom e Enquadrar para voltar à vista geral.', 'ok');
    $('dwgSnapshot').disabled = false;
    const doc = viewer.getDocument?.();
    const source = viewer.getSourceDocument?.();
    const layers = source?.layers || doc?.layers || source?.tables?.layers || doc?.tables?.layers;
    const entityCount = (Array.isArray(source?.entities) && source.entities.length) || (Array.isArray(doc?.entities) && doc.entities.length) || (Array.isArray(source?.modelSpace?.entities) && source.modelSpace.entities.length) || 0;
    const layerCount = Array.isArray(layers) ? layers.length : 0;
    statsEl.innerHTML = `${entityCount ? `<span><b>${entityCount.toLocaleString('pt-BR')}</b> entidades</span>` : ''}${layerCount ? `<span><b>${layerCount.toLocaleString('pt-BR')}</b> camadas</span>` : ''}`;
    setTimeout(() => setDwgProgress(0, false), 900);
  } catch (error) {
    if (error?.name === 'AbortError') setDwgStatus('Leitura cancelada.', '');
    else { console.error('DWG viewer:', error); setDwgStatus(`Não foi possível abrir o desenho. ${String(error?.message || error || 'Falha desconhecida')}`, 'error'); $('dwgEmpty').hidden = false; }
    setDwgProgress(0, false);
  } finally {
    $('openDWG').disabled = false;
    $('openAnotherDWG').disabled = false;
    $('dwgCancel').hidden = true;
    activeAbort = null;
    input.value = '';
  }
}

$('openDWG')?.addEventListener('click', () => input?.click());
$('openAnotherDWG')?.addEventListener('click', () => input?.click());
input?.addEventListener('change', () => readDrawing(input.files?.[0]));
$('dwgCancel')?.addEventListener('click', () => activeAbort?.abort());
$('dwgFit')?.addEventListener('click', () => cadViewer?.fit?.());
$('dwgZoomIn')?.addEventListener('click', () => cadViewer?.zoomIn?.());
$('dwgZoomOut')?.addEventListener('click', () => cadViewer?.zoomOut?.());
$('dwgTheme')?.addEventListener('click', () => {
  if (!cadViewer) return;
  drawingIsDark = !drawingIsDark;
  cadViewer.setCanvasOptions?.({ background:drawingIsDark ? '#090d12' : '#f4f6f8', foreground:drawingIsDark ? '#f2f5f7' : '#121a20', contrastMode:'adaptive', minColorContrast:2.45 });
  $('dwgTheme').textContent = drawingIsDark ? 'Fundo claro' : 'Fundo escuro';
});
$('dwgFullscreen')?.addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await panel?.requestFullscreen?.(); } catch { setDwgStatus('Tela cheia não está disponível neste navegador.', 'error'); } });
$('dwgSnapshot')?.addEventListener('click', () => {
  try { const canvas = stage.querySelector('canvas'); if (!canvas) throw new Error('A vista ainda não está pronta.'); const url = canvas.toDataURL('image/png'); const win = window.open(url, '_blank', 'noopener,noreferrer'); if (!win) throw new Error('O navegador bloqueou a nova janela.'); }
  catch (error) { setDwgStatus(error.message, 'error'); }
});

if (wrap) {
  for (const type of ['dragenter','dragover']) wrap.addEventListener(type, event => { if (document.body.classList.contains('readonly')) return; event.preventDefault(); wrap.classList.add('dwg-drag'); });
  for (const type of ['dragleave','drop']) wrap.addEventListener(type, event => { if (document.body.classList.contains('readonly')) return; event.preventDefault(); wrap.classList.remove('dwg-drag'); });
  wrap.addEventListener('drop', event => { const file = [...(event.dataTransfer?.files || [])].find(f => /\.(dwg|dxf)$/i.test(f.name)); if (file) readDrawing(file); else setDwgStatus('Solte um arquivo DWG ou DXF.', 'error'); });
}

if (document.body.classList.contains('readonly') && tab) tab.hidden = true;
new MutationObserver(() => {
  const readOnly = document.body.classList.contains('readonly');
  if (tab) tab.hidden = readOnly;
  if (readOnly && workspace?.classList.contains('dwg-active')) { deactivateDwg(); $('modelTab')?.click(); }
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if ($('quantitiesDialog')?.open) { $('quantitiesDialog').close(); return; }
  if (!document.body.classList.contains('sidebar-hidden')) { closeSidebar(); return; }
  if (workspace?.classList.contains('dwg-active')) { deactivateDwg(); $('modelTab')?.click(); }
});