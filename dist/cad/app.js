const $ = id => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const ENGINE_VERSION = '0.7.11';
const ENGINE_CANDIDATES = [
  {
    module: `https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web@${ENGINE_VERSION}/dist/libredwg-web.js`,
    wasm: `https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web@${ENGINE_VERSION}/wasm/`,
    name: 'jsDelivr'
  },
  {
    module: `https://unpkg.com/@mlightcad/libredwg-web@${ENGINE_VERSION}/dist/libredwg-web.js`,
    wasm: `https://unpkg.com/@mlightcad/libredwg-web@${ENGINE_VERSION}/wasm/`,
    name: 'unpkg'
  }
];

const state = {
  engine: null,
  engineSource: '',
  svg: null,
  db: null,
  box: null,
  homeBox: null,
  mode: 'pan',
  panStart: null,
  measurePoints: [],
  measurements: [],
  dark: false
};

const fileInput = $('fileInput');
const svgHost = $('svgHost');
const viewport = $('viewport');
const statusEl = $('status');
const modeLabel = $('modeLabel');
const busy = $('busy');
const busyText = $('busyText');
const empty = $('empty');
const layersEl = $('layers');
const layerSearch = $('layerSearch');
const engineState = $('engineState');
const diag = $('diag');

function post(type, detail = {}) {
  if (window.parent === window) return;
  window.parent.postMessage({ type, build: '2026-10-14-static-cad-r8', ...detail }, window.location.origin);
}

function setStatus(text, kind = '') {
  statusEl.textContent = text;
  statusEl.dataset.kind = kind;
}

function setBusy(on, text = 'Carregando…') {
  busy.hidden = !on;
  busyText.textContent = text;
}

function logDiag(text) {
  diag.textContent = `${new Date().toLocaleTimeString()}  ${text}\n${diag.textContent}`.slice(0, 9000);
}

function setTools(enabled) {
  for (const id of ['fitBtn','panBtn','distBtn','areaBtn','clearBtn','zoomOutBtn','zoomInBtn','bgBtn']) {
    const el = $(id);
    if (el) el.disabled = !enabled;
  }
}

function humanSize(bytes) {
  let value = Number(bytes) || 0;
  const units = ['B','KB','MB','GB'];
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i++; }
  return `${value >= 100 || i === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`;
}

async function loadEngine(force = false) {
  if (state.engine && !force) return state.engine;
  state.engine = null;
  engineState.textContent = 'Motor DWG: carregando…';
  engineState.dataset.kind = 'busy';
  setStatus('Carregando motor DWG…');
  const errors = [];

  for (const candidate of ENGINE_CANDIDATES) {
    try {
      logDiag(`Tentando motor ${candidate.name}`);
      const mod = await import(candidate.module);
      if (!mod?.LibreDwg || !mod?.Dwg_File_Type) throw new Error('exports LibreDwg/Dwg_File_Type ausentes');
      const instance = await mod.LibreDwg.create(candidate.wasm);
      state.engine = { instance, Dwg_File_Type: mod.Dwg_File_Type };
      state.engineSource = candidate.name;
      engineState.textContent = `Motor DWG: OK · ${candidate.name}`;
      engineState.dataset.kind = 'ok';
      setStatus('Motor DWG pronto.');
      logDiag(`Motor pronto via ${candidate.name}`);
      post('GG_CAD_READY', { workersReady: true, source: candidate.name });
      return state.engine;
    } catch (error) {
      const message = String(error?.message || error);
      errors.push(`${candidate.name}: ${message}`);
      logDiag(`${candidate.name} falhou: ${message}`);
    }
  }

  engineState.textContent = 'Motor DWG: falhou';
  engineState.dataset.kind = 'error';
  setStatus('Não foi possível carregar o motor DWG. Verifique a internet e use “Testar motor”.', 'error');
  post('GG_CAD_ERROR', { stage: 'engine', message: errors.join(' | ') });
  throw new Error(errors.join(' | '));
}

function normalizeSvg(svg) {
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.classList.add('drawing-svg');
  svg.querySelectorAll('script').forEach(el => el.remove());
  svg.querySelectorAll('[onclick],[onload],[onerror]').forEach(el => {
    el.removeAttribute('onclick'); el.removeAttribute('onload'); el.removeAttribute('onerror');
  });
}

function computeBox(svg) {
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) return { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
  try {
    const b = svg.getBBox();
    if (b.width > 0 && b.height > 0) return { x: b.x, y: b.y, width: b.width, height: b.height };
  } catch {}
  return { x: 0, y: 0, width: 1000, height: 1000 };
}

function applyBox(box) {
  if (!state.svg) return;
  state.box = { ...box };
  state.svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
}

function fitDrawing() {
  if (!state.svg) return;
  let b;
  try {
    const overlay = state.svg.querySelector('#gg-measures');
    if (overlay) overlay.style.display = 'none';
    const raw = state.svg.getBBox();
    if (overlay) overlay.style.display = '';
    b = raw;
  } catch {
    b = state.homeBox || state.box;
  }
  if (!b || !(b.width > 0) || !(b.height > 0)) return;
  const pad = Math.max(b.width, b.height) * 0.035;
  const box = { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 };
  state.homeBox = { ...box };
  applyBox(box);
}

function zoom(factor, clientX = null, clientY = null) {
  if (!state.svg || !state.box) return;
  const rect = state.svg.getBoundingClientRect();
  const cx = clientX == null ? state.box.x + state.box.width / 2 : state.box.x + ((clientX - rect.left) / rect.width) * state.box.width;
  const cy = clientY == null ? state.box.y + ((clientY - rect.top) / rect.height) * state.box.height : state.box.y + ((clientY - rect.top) / rect.height) * state.box.height;
  const width = state.box.width * factor;
  const height = state.box.height * factor;
  const rx = (cx - state.box.x) / state.box.width;
  const ry = (cy - state.box.y) / state.box.height;
  applyBox({ x: cx - rx * width, y: cy - ry * height, width, height });
}

function clientToSvg(clientX, clientY) {
  const rect = state.svg.getBoundingClientRect();
  return {
    x: state.box.x + ((clientX - rect.left) / rect.width) * state.box.width,
    y: state.box.y + ((clientY - rect.top) / rect.height) * state.box.height
  };
}

function ensureMeasureGroup() {
  let g = state.svg?.querySelector('#gg-measures');
  if (!g && state.svg) {
    g = document.createElementNS(NS, 'g');
    g.id = 'gg-measures';
    g.setAttribute('pointer-events', 'none');
    state.svg.appendChild(g);
  }
  return g;
}

function measureStyleScale() {
  return Math.max(state.box?.width || 1000, state.box?.height || 1000) / 180;
}

function fmt(value) {
  const unit = $('unitSelect').value;
  const suffix = unit === 'unit' ? ' u' : ` ${unit}`;
  return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}${suffix}`;
}

function drawDistance(a, b) {
  const g = ensureMeasureGroup();
  const line = document.createElementNS(NS, 'line');
  line.setAttribute('x1', a.x); line.setAttribute('y1', a.y); line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
  line.setAttribute('class', 'measure-line');
  line.setAttribute('vector-effect', 'non-scaling-stroke');
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const text = document.createElementNS(NS, 'text');
  text.setAttribute('x', (a.x + b.x) / 2); text.setAttribute('y', (a.y + b.y) / 2);
  text.setAttribute('class', 'measure-text');
  text.setAttribute('font-size', measureStyleScale());
  text.textContent = fmt(d);
  g.append(line, text);
  state.measurements.push({ type: 'distance', value: d });
  setStatus(`Distância: ${fmt(d)}`);
}

function polygonArea(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

function drawArea(points) {
  if (points.length < 3) return;
  const g = ensureMeasureGroup();
  const poly = document.createElementNS(NS, 'polygon');
  poly.setAttribute('points', points.map(p => `${p.x},${p.y}`).join(' '));
  poly.setAttribute('class', 'measure-area');
  poly.setAttribute('vector-effect', 'non-scaling-stroke');
  const area = polygonArea(points);
  const center = points.reduce((acc, p) => ({ x: acc.x + p.x / points.length, y: acc.y + p.y / points.length }), { x: 0, y: 0 });
  const text = document.createElementNS(NS, 'text');
  text.setAttribute('x', center.x); text.setAttribute('y', center.y);
  text.setAttribute('class', 'measure-text');
  text.setAttribute('font-size', measureStyleScale());
  text.textContent = `${fmt(area)}²`;
  g.append(poly, text);
  state.measurements.push({ type: 'area', value: area });
  setStatus(`Área: ${fmt(area)}²`);
}

function setMode(mode) {
  state.mode = mode;
  state.measurePoints = [];
  for (const id of ['panBtn','distBtn','areaBtn']) $(id)?.classList.remove('active');
  $(`${mode === 'pan' ? 'panBtn' : mode === 'distance' ? 'distBtn' : 'areaBtn'}`)?.classList.add('active');
  modeLabel.textContent = `Modo: ${mode === 'pan' ? 'mover' : mode === 'distance' ? 'distância' : 'área'}`;
  $('finishAreaBtn').hidden = mode !== 'area';
  $('finishAreaBtn').disabled = true;
  viewport.dataset.mode = mode;
}

function clearMeasures() {
  state.svg?.querySelector('#gg-measures')?.remove();
  state.measurements = [];
  state.measurePoints = [];
  $('finishAreaBtn').disabled = true;
  setStatus('Medições limpas.');
}

function renderLayerList(db) {
  const layers = Array.isArray(db?.tables?.LAYER?.entries) ? db.tables.LAYER.entries : [];
  const counts = new Map();
  for (const e of db?.entities || []) counts.set(e.layer || '0', (counts.get(e.layer || '0') || 0) + 1);
  layersEl.innerHTML = '';
  const names = layers.map(l => String(l.name || '')).filter(Boolean).sort((a,b) => a.localeCompare(b, 'pt-BR'));
  if (!names.length) {
    layersEl.innerHTML = '<small>O arquivo abriu, mas a tabela de camadas não foi exposta pelo parser.</small>';
    layerSearch.disabled = true;
    return;
  }
  layerSearch.disabled = false;
  for (const name of names) {
    const row = document.createElement('div');
    row.className = 'layer-row';
    row.dataset.name = name.toLowerCase();
    row.innerHTML = `<span>${name}</span><b>${(counts.get(name) || 0).toLocaleString('pt-BR')}</b>`;
    layersEl.appendChild(row);
  }
}

function updateStats(db) {
  const entities = Array.isArray(db?.entities) ? db.entities : [];
  const layers = Array.isArray(db?.tables?.LAYER?.entries) ? db.tables.LAYER.entries : [];
  const types = new Map();
  for (const e of entities) types.set(e.type || 'OUTRO', (types.get(e.type || 'OUTRO') || 0) + 1);
  const top = [...types.entries()].sort((a,b) => b[1] - a[1]).slice(0, 6);
  $('stats').innerHTML = `<b>${entities.length.toLocaleString('pt-BR')}</b> entidades<br><b>${layers.length.toLocaleString('pt-BR')}</b> camadas${top.length ? `<hr>${top.map(([k,v]) => `<span>${k}: ${v.toLocaleString('pt-BR')}</span>`).join('')}` : ''}`;
}

async function openDrawing(file) {
  if (!file) return;
  if (!/\.dwg$/i.test(file.name)) {
    setStatus('Selecione um arquivo DWG.', 'error');
    return;
  }
  const maxMb = matchMedia('(max-width:760px)').matches ? 80 : 250;
  const sizeMb = file.size / 1048576;
  if (sizeMb > maxMb) {
    setStatus(`DWG com ${sizeMb.toFixed(0)} MB. Limite desta versão: ${maxMb} MB para evitar travamento do navegador.`, 'error');
    return;
  }

  try {
    setBusy(true, `Abrindo ${file.name}…`);
    setStatus(`Lendo ${file.name}…`);
    const engine = await loadEngine();
    const buffer = await file.arrayBuffer();
    let ptr = 0;
    try {
      ptr = engine.instance.dwg_read_data(buffer, engine.Dwg_File_Type.DWG);
      if (!ptr) throw new Error('LibreDWG não retornou dados do desenho.');
      const db = engine.instance.convert(ptr);
      if (!db) throw new Error('Falha ao converter o DWG para o banco de dados vetorial.');
      const svgString = engine.instance.dwg_to_svg(db);
      if (!svgString || !/<svg[\s>]/i.test(svgString)) throw new Error('O DWG foi lido, mas não gerou desenho SVG.');
      const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
      if (doc.querySelector('parsererror')) throw new Error('SVG gerado pelo DWG é inválido.');
      const svg = document.importNode(doc.documentElement, true);
      normalizeSvg(svg);
      svgHost.replaceChildren(svg);
      state.svg = svg;
      state.db = db;
      state.box = computeBox(svg);
      applyBox(state.box);
      requestAnimationFrame(() => fitDrawing());
      renderLayerList(db);
      updateStats(db);
      $('fileName').textContent = file.name;
      $('fileMeta').textContent = `${humanSize(file.size)} · DWG · ${state.engineSource}`;
      empty.hidden = true;
      setTools(true);
      setMode('pan');
      setStatus(`${file.name} aberto. Use mover, zoom e medição.`);
      logDiag(`DWG aberto: ${file.name}, ${db?.entities?.length || 0} entidades`);
      post('GG_CAD_DOCUMENT_OPENED', { name: file.name, size: file.size, entities: db?.entities?.length || 0 });
    } finally {
      if (ptr) {
        try { engine.instance.dwg_free(ptr); } catch {}
      }
    }
  } catch (error) {
    const message = String(error?.message || error);
    setStatus(`Não foi possível abrir o DWG: ${message}`, 'error');
    logDiag(`ERRO DWG: ${message}`);
    post('GG_CAD_ERROR', { stage: 'open', message });
  } finally {
    setBusy(false);
    fileInput.value = '';
  }
}

function chooseFile() { fileInput.click(); }
$('openBtn').onclick = chooseFile;
$('openCenter').onclick = chooseFile;
fileInput.onchange = () => openDrawing(fileInput.files?.[0]);
$('retryEngine').onclick = () => loadEngine(true).catch(() => {});
$('fitBtn').onclick = fitDrawing;
$('panBtn').onclick = () => setMode('pan');
$('distBtn').onclick = () => setMode('distance');
$('areaBtn').onclick = () => setMode('area');
$('finishAreaBtn').onclick = () => {
  if (state.measurePoints.length >= 3) drawArea([...state.measurePoints]);
  state.measurePoints = [];
  $('finishAreaBtn').disabled = true;
};
$('clearBtn').onclick = clearMeasures;
$('zoomInBtn').onclick = () => zoom(0.8);
$('zoomOutBtn').onclick = () => zoom(1.25);
$('bgBtn').onclick = () => {
  state.dark = !state.dark;
  viewport.classList.toggle('dark-canvas', state.dark);
};
$('fullBtn').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();

layerSearch.oninput = () => {
  const q = layerSearch.value.trim().toLowerCase();
  layersEl.querySelectorAll('.layer-row').forEach(row => row.hidden = q && !row.dataset.name.includes(q));
};

viewport.addEventListener('wheel', event => {
  if (!state.svg) return;
  event.preventDefault();
  zoom(event.deltaY < 0 ? 0.86 : 1.16, event.clientX, event.clientY);
}, { passive: false });

viewport.addEventListener('pointerdown', event => {
  if (!state.svg || event.button !== 0) return;
  if (state.mode === 'pan') {
    state.panStart = { clientX: event.clientX, clientY: event.clientY, box: { ...state.box } };
    viewport.setPointerCapture?.(event.pointerId);
    return;
  }
  const p = clientToSvg(event.clientX, event.clientY);
  if (state.mode === 'distance') {
    state.measurePoints.push(p);
    if (state.measurePoints.length === 2) {
      drawDistance(state.measurePoints[0], state.measurePoints[1]);
      state.measurePoints = [];
    } else setStatus('Distância: selecione o segundo ponto.');
  } else if (state.mode === 'area') {
    state.measurePoints.push(p);
    $('finishAreaBtn').disabled = state.measurePoints.length < 3;
    setStatus(`Área: ${state.measurePoints.length} ponto(s). Selecione ao menos 3 e clique em Finalizar área.`);
  }
});

viewport.addEventListener('pointermove', event => {
  if (!state.panStart || !state.svg || state.mode !== 'pan') return;
  const rect = state.svg.getBoundingClientRect();
  const dx = (event.clientX - state.panStart.clientX) / rect.width * state.panStart.box.width;
  const dy = (event.clientY - state.panStart.clientY) / rect.height * state.panStart.box.height;
  applyBox({ x: state.panStart.box.x - dx, y: state.panStart.box.y - dy, width: state.panStart.box.width, height: state.panStart.box.height });
});

for (const name of ['pointerup','pointercancel','pointerleave']) viewport.addEventListener(name, () => { state.panStart = null; });

for (const name of ['dragenter','dragover']) viewport.addEventListener(name, e => { e.preventDefault(); viewport.classList.add('dragging'); });
for (const name of ['dragleave','drop']) viewport.addEventListener(name, e => { e.preventDefault(); viewport.classList.remove('dragging'); });
viewport.addEventListener('drop', e => {
  const file = [...(e.dataTransfer?.files || [])].find(f => /\.dwg$/i.test(f.name));
  if (file) openDrawing(file);
});

setTools(false);
setMode('pan');
post('GG_CAD_BOOTED');
loadEngine().catch(() => {});
