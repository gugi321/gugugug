const $ = id => document.getElementById(id);

// Injeta a aba sem alterar a lógica existente do IFC/PDF.
if (!$('dwgTab')) {
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = 'dwg.css';
  document.head.appendChild(css);

  const nav = document.querySelector('.project-tabs');
  const workspaceHost = $('projectWorkspace');
  if (nav && workspaceHost) {
    const newTab = document.createElement('button');
    newTab.id = 'dwgTab';
    newTab.type = 'button';
    newTab.setAttribute('aria-pressed', 'false');
    newTab.setAttribute('data-owner-control', '');
    newTab.textContent = 'DWG';
    nav.appendChild(newTab);

    const section = document.createElement('section');
    section.id = 'dwgDialog';
    section.hidden = true;
    section.setAttribute('data-owner-control', '');
    section.setAttribute('aria-label', 'Leitor DWG e DXF');
    section.innerHTML = `
      <div class="dwg-head">
        <div class="dwg-head-copy"><h2>Leitor DWG</h2><p>DWG/DXF local · otimizado para consulta</p></div>
        <div class="dwg-head-actions">
          <button id="openDWG" class="primary" data-owner-control>Abrir DWG</button>
          <button id="openAnotherDWG" data-owner-control>Abrir outro</button>
          <button id="dwgOpenWindow">↗ Outra janela</button>
          <button id="closeDWG">Voltar ao 3D</button>
        </div>
        <input id="dwgFile" type="file" accept=".dwg,.dxf,application/acad,application/x-acad" hidden data-owner-control>
      </div>
      <div class="dwg-workspace">
        <div id="dwgCanvasWrap">
          <div id="dwgStage"></div>
          <div id="dwgEmpty"><div class="dwg-empty-card"><strong>Abra uma prancha DWG</strong><p>O arquivo é lido no próprio navegador e não é enviado automaticamente para o servidor.</p></div></div>
          <div class="dwg-toolbar">
            <button id="dwgZoomOut" title="Afastar">−</button><span id="dwgZoomValue">100%</span><button id="dwgZoomIn" title="Aproximar">＋</button>
            <button id="dwgFit">Enquadrar</button><button id="dwgTheme">Fundo escuro</button><button id="dwgFullscreen">⛶ Tela cheia</button>
          </div>
        </div>
        <aside class="dwg-side">
          <h3>Desenho</h3><div id="dwgFileName" class="dwg-file-name">Nenhum DWG aberto</div><div id="dwgFileMeta" class="dwg-file-meta">Selecione um arquivo para iniciar.</div>
          <p id="dwgStatus" role="status"></p>
          <p class="dwg-note">Leitura por GNU LibreDWG/WebAssembly. A prévia cobre as entidades CAD mais comuns; objetos proprietários do AutoCAD podem aparecer de forma simplificada.</p>
        </aside>
      </div>`;
    workspaceHost.appendChild(section);
  }
}

const tab = $('dwgTab');
const workspace = $('projectWorkspace');
const panel = $('dwgDialog');
const input = $('dwgFile');
const openBtn = $('openDWG');
const reopenBtn = $('openAnotherDWG');
const stage = $('dwgStage');
const wrap = $('dwgCanvasWrap');
const statusEl = $('dwgStatus');
const fileNameEl = $('dwgFileName');
const fileMetaEl = $('dwgFileMeta');
const zoomValue = $('dwgZoomValue');

if (tab && workspace && panel && input && stage && wrap) {
  const MODULE_URL = 'https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web@0.7.16/dist/libredwg-web.js';
  const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mlightcad/libredwg-web@0.7.16/wasm/';

  let enginePromise = null;
  let currentSvg = null;
  let scale = 1;
  let tx = 0;
  let ty = 0;
  let dark = false;
  const pointers = new Map();
  let lastPinchDistance = 0;
  let lastPinchMid = null;

  const humanSize = bytes => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = Number(bytes) || 0;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit += 1;
    }
    return `${value >= 100 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
  };

  const setStatus = (message, kind = '') => {
    if (!statusEl) return;
    statusEl.textContent = message || '';
    statusEl.dataset.kind = kind;
  };

  const syncTransform = () => {
    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    if (zoomValue) zoomValue.textContent = `${Math.round(scale * 100)}%`;
  };

  const fit = () => {
    scale = 1;
    tx = 0;
    ty = 0;
    syncTransform();
  };

  const zoomAt = (factor, clientX, clientY) => {
    const old = scale;
    const next = Math.min(8, Math.max(0.25, old * factor));
    if (next === old) return;
    const rect = wrap.getBoundingClientRect();
    const px = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const py = (clientY ?? rect.top + rect.height / 2) - rect.top;
    const localX = (px - tx) / old;
    const localY = (py - ty) / old;
    scale = next;
    tx = px - localX * scale;
    ty = py - localY * scale;
    syncTransform();
  };

  const activate = () => {
    if (document.body.classList.contains('readonly')) return;
    workspace.classList.remove('pdf-active');
    workspace.classList.add('dwg-active');
    panel.hidden = false;
    tab.classList.add('active');
    tab.setAttribute('aria-pressed', 'true');
    for (const id of ['modelTab', 'pdfTab']) {
      const el = $(id);
      if (el) {
        el.classList.remove('active');
        el.setAttribute('aria-pressed', 'false');
      }
    }
    document.body.classList.add('sidebar-hidden');
  };

  const deactivate = () => {
    workspace.classList.remove('dwg-active');
    panel.hidden = true;
    tab.classList.remove('active');
    tab.setAttribute('aria-pressed', 'false');
  };

  tab.addEventListener('click', activate);
  $('modelTab')?.addEventListener('click', deactivate);
  $('pdfTab')?.addEventListener('click', deactivate);
  $('projectPDFs')?.addEventListener('click', deactivate);
  $('closeDWG')?.addEventListener('click', () => {
    deactivate();
    $('modelTab')?.click();
  });

  const getEngine = async () => {
    if (!enginePromise) {
      setStatus('Carregando o leitor DWG…', 'busy');
      enginePromise = import(MODULE_URL).then(async mod => {
        const libredwg = await mod.LibreDwg.create(WASM_URL);
        return { mod, libredwg };
      }).catch(error => {
        enginePromise = null;
        throw error;
      });
    }
    return enginePromise;
  };

  const sanitizeSvg = svg => {
    svg.querySelectorAll('script,foreignObject,iframe,object,embed').forEach(node => node.remove());
    for (const el of svg.querySelectorAll('*')) {
      for (const attr of [...el.attributes]) {
        const n = attr.name.toLowerCase();
        const v = String(attr.value || '').trim().toLowerCase();
        if (n.startsWith('on') || ((n === 'href' || n.endsWith(':href')) && v.startsWith('javascript:'))) {
          el.removeAttribute(attr.name);
        }
      }
    }
  };

  const renderSvg = svgString => {
    const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
    if (doc.querySelector('parsererror')) throw new Error('O desenho foi lido, mas a prévia SVG não pôde ser montada.');
    const svg = doc.documentElement;
    sanitizeSvg(svg);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    stage.replaceChildren(svg);
    currentSvg = svg;
    fit();
  };

  const readDrawing = async file => {
    if (!file) return;
    if (!/\.(dwg|dxf)$/i.test(file.name)) {
      setStatus('Selecione um arquivo DWG ou DXF.', 'error');
      return;
    }

    const mobile = matchMedia('(max-width:760px)').matches;
    const mb = file.size / (1024 * 1024);
    if (mobile && mb > 120) {
      setStatus('Este DWG é grande demais para leitura segura no celular. Abra este arquivo no computador para evitar travamento do navegador.', 'error');
      return;
    }
    if (!mobile && mb > 500) {
      setStatus('Este DWG excede 500 MB. Para estabilidade, reduza o arquivo ou exporte apenas as pranchas necessárias.', 'error');
      return;
    }

    activate();
    openBtn.disabled = true;
    if (reopenBtn) reopenBtn.disabled = true;
    fileNameEl.textContent = file.name;
    fileMetaEl.textContent = `${humanSize(file.size)} · ${/\.dxf$/i.test(file.name) ? 'DXF' : 'DWG'} · processamento local`;
    setStatus(mb > 50 ? 'Arquivo grande: carregando e convertendo o desenho no navegador…' : 'Lendo o desenho no navegador…', 'busy');

    let dwg = null;
    try {
      const { mod, libredwg } = await getEngine();
      const buffer = await file.arrayBuffer();
      const type = /\.dxf$/i.test(file.name) ? mod.Dwg_File_Type.DXF : mod.Dwg_File_Type.DWG;
      dwg = libredwg.dwg_read_data(buffer, type);
      if (!dwg) throw new Error('O leitor não retornou dados para este arquivo.');
      if (typeof dwg.error === 'number' && dwg.error !== 0) throw new Error(`Falha de leitura do DWG (código ${dwg.error}).`);
      const db = libredwg.convert(dwg);
      const svgString = libredwg.dwg_to_svg(db);
      if (!svgString || !svgString.includes('<svg')) throw new Error('O arquivo abriu, mas não gerou uma visualização compatível.');
      renderSvg(svgString);
      setStatus('Desenho carregado. Arraste para mover; use dois dedos ou os botões para ampliar.', 'ok');
    } catch (error) {
      console.error('DWG viewer:', error);
      stage.replaceChildren();
      currentSvg = null;
      setStatus(`Não foi possível abrir este desenho. ${error?.message || 'Tente salvar o DWG em uma versão mais recente/compatível ou exportar para DXF.'}`, 'error');
    } finally {
      try {
        if (dwg) {
          const { libredwg } = await getEngine();
          libredwg.dwg_free(dwg);
        }
      } catch {}
      openBtn.disabled = false;
      if (reopenBtn) reopenBtn.disabled = false;
      input.value = '';
    }
  };

  openBtn.addEventListener('click', () => input.click());
  reopenBtn?.addEventListener('click', () => input.click());
  input.addEventListener('change', () => readDrawing(input.files?.[0]));

  $('dwgFit')?.addEventListener('click', fit);
  $('dwgZoomIn')?.addEventListener('click', () => zoomAt(1.25));
  $('dwgZoomOut')?.addEventListener('click', () => zoomAt(0.8));
  $('dwgTheme')?.addEventListener('click', () => {
    dark = !dark;
    panel.classList.toggle('dwg-dark', dark);
    $('dwgTheme').textContent = dark ? 'Fundo claro' : 'Fundo escuro';
  });
  $('dwgFullscreen')?.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await panel.requestFullscreen();
      else await document.exitFullscreen();
    } catch {}
  });
  $('dwgOpenWindow')?.addEventListener('click', () => {
    if (!currentSvg) return;
    const content = new XMLSerializer().serializeToString(currentSvg);
    const url = URL.createObjectURL(new Blob([content], { type: 'image/svg+xml' }));
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (!w) setStatus('O navegador bloqueou a nova janela. Libere pop-ups para abrir o desenho separado.', 'error');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });

  wrap.addEventListener('wheel', event => {
    if (!currentSvg) return;
    event.preventDefault();
    zoomAt(event.deltaY < 0 ? 1.12 : 0.89, event.clientX, event.clientY);
  }, { passive: false });

  wrap.addEventListener('pointerdown', event => {
    if (!currentSvg) return;
    wrap.setPointerCapture?.(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      const p = [...pointers.values()];
      lastPinchDistance = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
      lastPinchMid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
    }
  });

  wrap.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId) || !currentSvg) return;
    const previous = pointers.get(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1) {
      tx += event.clientX - previous.x;
      ty += event.clientY - previous.y;
      syncTransform();
      return;
    }
    if (pointers.size === 2) {
      const p = [...pointers.values()];
      const distance = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
      const mid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
      if (lastPinchDistance > 0) zoomAt(distance / lastPinchDistance, mid.x, mid.y);
      if (lastPinchMid) {
        tx += mid.x - lastPinchMid.x;
        ty += mid.y - lastPinchMid.y;
        syncTransform();
      }
      lastPinchDistance = distance;
      lastPinchMid = mid;
    }
  });

  const endPointer = event => {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) {
      lastPinchDistance = 0;
      lastPinchMid = null;
    }
  };
  wrap.addEventListener('pointerup', endPointer);
  wrap.addEventListener('pointercancel', endPointer);

  if (document.body.classList.contains('readonly')) tab.hidden = true;
  new MutationObserver(() => {
    const ro = document.body.classList.contains('readonly');
    tab.hidden = ro;
    if (ro && workspace.classList.contains('dwg-active')) {
      deactivate();
      $('modelTab')?.click();
    }
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}
