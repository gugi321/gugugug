const $ = id => document.getElementById(id);
const CAD_EMBED_VERSION = '20261014-r8';

function ensureStylesheet(id, href) {
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}
ensureStylesheet('gg-dwg-style', 'dwg.css');
ensureStylesheet('gg-cad-embed-style', 'cad-embed.css');

function setBuildLabel() {
  const label = document.querySelector('.build-version');
  if (label) label.textContent = '14/10/2026 · Mini CAD online estático R8';
}

function closeSidebar() {
  document.body.classList.add('sidebar-hidden');
  $('sidebarToggle')?.setAttribute('aria-expanded', 'false');
  $('sidebarBackdrop')?.setAttribute('aria-hidden', 'true');
}

function ensureSidebarClose() {
  const sidebar = $('sidebar');
  const main = document.querySelector('main');
  if (!sidebar || !main) return;
  if (!$('sidebarClose')) {
    const top = document.createElement('div');
    top.className = 'sidebar-mobile-head';
    top.innerHTML = '<strong>Ferramentas</strong><button id="sidebarClose" type="button">× Fechar</button>';
    sidebar.prepend(top);
    $('sidebarClose').onclick = closeSidebar;
  }
  if (!$('sidebarBackdrop')) {
    const backdrop = document.createElement('button');
    backdrop.id = 'sidebarBackdrop';
    backdrop.type = 'button';
    backdrop.setAttribute('aria-label', 'Fechar menu lateral');
    backdrop.setAttribute('aria-hidden', 'true');
    main.appendChild(backdrop);
    backdrop.onclick = closeSidebar;
  }
  new MutationObserver(() => {
    const hidden = document.body.classList.contains('sidebar-hidden');
    $('sidebarToggle')?.setAttribute('aria-expanded', String(!hidden));
    $('sidebarBackdrop')?.setAttribute('aria-hidden', String(hidden));
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

function cadUrl(extra = '') {
  const suffix = extra ? `&${extra}` : '';
  return `cad/index.html?v=${encodeURIComponent(CAD_EMBED_VERSION)}${suffix}`;
}

function ensureCadTab() {
  if ($('dwgTab')) return;
  const nav = document.querySelector('.project-tabs');
  const workspace = $('projectWorkspace');
  if (!nav || !workspace) return;

  const tab = document.createElement('button');
  tab.id = 'dwgTab';
  tab.type = 'button';
  tab.textContent = 'DWG';
  tab.setAttribute('aria-pressed', 'false');
  tab.setAttribute('data-owner-control', '');
  nav.appendChild(tab);

  const section = document.createElement('section');
  section.id = 'dwgDialog';
  section.hidden = true;
  section.setAttribute('data-owner-control', '');
  section.innerHTML = `
    <div class="cad-embed-head">
      <div><span class="eyebrow">MINI CAD ONLINE</span><strong>DWG</strong><small>Visualização vetorial · zoom · pan · distância · área</small></div>
      <div class="cad-embed-actions"><span id="cadEmbedState">Aguardando…</span><button id="retryCAD" type="button">Recarregar CAD</button><button id="closeDWG" type="button">Voltar ao 3D</button></div>
    </div>
    <div id="cadEmbedWrap">
      <iframe id="cadFrame" src="${cadUrl()}" title="Mini CAD DWG online" loading="eager"></iframe>
      <div id="cadEmbedOverlay" role="status"><strong>Carregando Mini CAD online…</strong><span>Leitor DWG estático sem build local.</span></div>
    </div>`;
  workspace.appendChild(section);
}

ensureCadTab();
ensureSidebarClose();
setBuildLabel();
void import('./quantities.js').catch(error => console.warn('Quantitativos:', error));

const workspace = $('projectWorkspace');
const tab = $('dwgTab');
const panel = $('dwgDialog');
const frame = $('cadFrame');
const overlay = $('cadEmbedOverlay');
const embedState = $('cadEmbedState');
let cadReady = false;
let bootTimer = 0;

function setEmbedState(message, kind = '') {
  if (!embedState) return;
  embedState.textContent = message;
  embedState.dataset.kind = kind;
}

function showOverlay(title, detail, kind = '') {
  if (!overlay) return;
  overlay.hidden = false;
  overlay.dataset.kind = kind;
  overlay.innerHTML = `<strong>${title}</strong><span>${detail}</span>`;
}

function hideOverlay() { if (overlay) overlay.hidden = true; }

function armBootWatchdog() {
  clearTimeout(bootTimer);
  cadReady = false;
  setEmbedState('Carregando…', 'busy');
  showOverlay('Carregando Mini CAD online…', 'Inicializando o leitor DWG vetorial.');
  bootTimer = window.setTimeout(() => {
    if (cadReady) return;
    setEmbedState('Falha ao iniciar', 'error');
    showOverlay('O Mini CAD não respondeu.', 'Clique em “Recarregar CAD”. O diagnóstico interno mostrará se houve falha de internet/CDN.', 'error');
  }, 20000);
}

function reloadCad() {
  if (!frame) return;
  armBootWatchdog();
  frame.src = cadUrl(`reload=${Date.now()}`);
}

function activateCad() {
  if (document.body.classList.contains('readonly')) return;
  workspace?.classList.remove('pdf-active');
  workspace?.classList.add('dwg-active');
  document.body.classList.add('cad-online-active');
  if (panel) panel.hidden = false;
  tab?.classList.add('active');
  tab?.setAttribute('aria-pressed', 'true');
  for (const id of ['modelTab', 'pdfTab']) {
    $(id)?.classList.remove('active');
    $(id)?.setAttribute('aria-pressed', 'false');
  }
  closeSidebar();
  if (!cadReady) armBootWatchdog();
}

function deactivateCad() {
  workspace?.classList.remove('dwg-active');
  document.body.classList.remove('cad-online-active');
  if (panel) panel.hidden = true;
  tab?.classList.remove('active');
  tab?.setAttribute('aria-pressed', 'false');
}

tab?.addEventListener('click', activateCad);
$('modelTab')?.addEventListener('click', deactivateCad);
$('pdfTab')?.addEventListener('click', deactivateCad);
$('projectPDFs')?.addEventListener('click', deactivateCad);
$('closeDWG')?.addEventListener('click', () => { deactivateCad(); $('modelTab')?.click(); });
$('retryCAD')?.addEventListener('click', reloadCad);
frame?.addEventListener('load', () => { if (!cadReady) setEmbedState('Interface carregada; iniciando motor…', 'busy'); });

window.addEventListener('message', event => {
  if (event.origin !== window.location.origin || event.source !== frame?.contentWindow) return;
  const data = event.data || {};
  if (!String(data.type || '').startsWith('GG_CAD_')) return;

  if (data.type === 'GG_CAD_BOOTED') {
    setEmbedState('Interface pronta; carregando motor…', 'busy');
    return;
  }
  if (data.type === 'GG_CAD_READY') {
    cadReady = true;
    clearTimeout(bootTimer);
    setEmbedState(`CAD pronto${data.source ? ` · ${data.source}` : ''}`, 'ok');
    hideOverlay();
    return;
  }
  if (data.type === 'GG_CAD_DOCUMENT_OPENED') {
    cadReady = true;
    clearTimeout(bootTimer);
    setEmbedState('DWG aberto', 'ok');
    hideOverlay();
    return;
  }
  if (data.type === 'GG_CAD_ERROR') {
    clearTimeout(bootTimer);
    setEmbedState(`Erro CAD · ${data.stage || 'runtime'}`, 'error');
    showOverlay('O leitor CAD encontrou um erro.', data.message || 'Use o diagnóstico dentro da aba.', 'error');
  }
});

if (document.body.classList.contains('readonly') && tab) tab.hidden = true;
new MutationObserver(() => {
  const readOnly = document.body.classList.contains('readonly');
  if (tab) tab.hidden = readOnly;
  if (readOnly && workspace?.classList.contains('dwg-active')) {
    deactivateCad();
    $('modelTab')?.click();
  }
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (!document.body.classList.contains('sidebar-hidden')) { closeSidebar(); return; }
  if (workspace?.classList.contains('dwg-active')) { deactivateCad(); $('modelTab')?.click(); }
});
