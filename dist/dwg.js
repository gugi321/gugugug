const $ = id => document.getElementById(id);

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
  if (label) label.textContent = '14/10/2026 · mini CAD DWG · medir e visualizar';
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
      <div><span class="eyebrow">MINI CAD</span><strong>DWG / DXF</strong><small>Visualização técnica · camadas · distância · área</small></div>
      <button id="closeDWG" type="button">Voltar ao 3D</button>
    </div>
    <iframe id="cadFrame" src="cad/index.html" title="Mini CAD DWG" loading="eager" allow="fullscreen"></iframe>`;
  workspace.appendChild(section);
}

ensureCadTab();
ensureSidebarClose();
setBuildLabel();
void import('./quantities.js').catch(error => console.warn('Quantitativos:', error));

const workspace = $('projectWorkspace');
const tab = $('dwgTab');
const panel = $('dwgDialog');

function activateCad() {
  if (document.body.classList.contains('readonly')) return;
  workspace?.classList.remove('pdf-active');
  workspace?.classList.add('dwg-active');
  if (panel) panel.hidden = false;
  tab?.classList.add('active');
  tab?.setAttribute('aria-pressed', 'true');
  for (const id of ['modelTab', 'pdfTab']) {
    $(id)?.classList.remove('active');
    $(id)?.setAttribute('aria-pressed', 'false');
  }
  closeSidebar();
}

function deactivateCad() {
  workspace?.classList.remove('dwg-active');
  if (panel) panel.hidden = true;
  tab?.classList.remove('active');
  tab?.setAttribute('aria-pressed', 'false');
}

tab?.addEventListener('click', activateCad);
$('modelTab')?.addEventListener('click', deactivateCad);
$('pdfTab')?.addEventListener('click', deactivateCad);
$('projectPDFs')?.addEventListener('click', deactivateCad);
$('closeDWG')?.addEventListener('click', () => {
  deactivateCad();
  $('modelTab')?.click();
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
  if (!document.body.classList.contains('sidebar-hidden')) {
    closeSidebar();
    return;
  }
  if (workspace?.classList.contains('dwg-active')) {
    deactivateCad();
    $('modelTab')?.click();
  }
});
