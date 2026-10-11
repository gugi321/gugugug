import { installQuantities } from './quantities.js';

const $ = id => document.getElementById(id);
const CAD_VERSION = '0.8.0';
const CAD_MODULE_URL = `https://cdn.jsdelivr.net/npm/@flyfish-dev/cad-viewer@${CAD_VERSION}/+esm`;
const CAD_STYLE_URL = `https://cdn.jsdelivr.net/npm/@flyfish-dev/cad-viewer@${CAD_VERSION}/dist/style.css`;
const CAD_WASM_BASE = `https://cdn.jsdelivr.net/npm/@flyfish-dev/cad-viewer@${CAD_VERSION}/dist/wasm/`;
const CAD_WORKER_URL = new URL('dwg-worker-loader.js', document.baseURI).href;

function ensureStylesheet(id,href){if(document.getElementById(id))return;const l=document.createElement('link');l.id=id;l.rel='stylesheet';l.href=href;document.head.appendChild(l)}
ensureStylesheet('gg-dwg-style','dwg.css');
ensureStylesheet('gg-cad-viewer-style',CAD_STYLE_URL);

function setBuildLabel(){const e=document.querySelector('.build-version');if(e)e.textContent='11/10/2026 · tema técnico claro · DWG reparado · quantitativos avançados'}
function closeSidebar(){document.body.classList.add('sidebar-hidden');$('sidebarToggle')?.setAttribute('aria-expanded','false');$('sidebarBackdrop')?.setAttribute('aria-hidden','true')}
function openSidebar(){document.body.classList.remove('sidebar-hidden');$('sidebarToggle')?.setAttribute('aria-expanded','true');$('sidebarBackdrop')?.setAttribute('aria-hidden','false')}

function applySavedTheme(){
  let mode='soft';try{mode=localStorage.getItem('gg-theme')||'soft'}catch{}
  document.body.classList.toggle('theme-dark',mode==='dark');
  document.body.classList.toggle('theme-soft',mode!=='dark');
  const b=$('themeToggle');if(b)b.textContent=mode==='dark'?'☀ Tema claro':'◐ Tema escuro';
}
function toggleTheme(){
  const dark=!document.body.classList.contains('theme-dark');document.body.classList.toggle('theme-dark',dark);document.body.classList.toggle('theme-soft',!dark);
  try{localStorage.setItem('gg-theme',dark?'dark':'soft')}catch{};applySavedTheme();
}

function ensureSidebarEnhancements(){
  const sidebar=$('sidebar'),main=document.querySelector('main');if(!sidebar||!main)return;
  if(!$('sidebarClose')){const head=document.createElement('div');head.className='sidebar-mobile-head';head.innerHTML='<strong>Ferramentas do projeto</strong><button id="sidebarClose" type="button" aria-label="Fechar menu lateral">× Fechar</button>';sidebar.prepend(head);$('sidebarClose').onclick=closeSidebar}
  let tools=$('projectQuickTools');if(!tools){tools=document.createElement('section');tools.id='projectQuickTools';tools.className='project-quick-tools';tools.innerHTML='<div class="eyebrow">PROJETO <span>00</span></div>';const anchor=sidebar.querySelector('.eyebrow');anchor?sidebar.insertBefore(tools,anchor):sidebar.appendChild(tools)}
  if(!$('sidebarFit')){const row=document.createElement('div');row.className='sidebar-quick-row';row.innerHTML='<button id="sidebarFit" type="button">⊞ Enquadrar</button><button id="sidebarShowAll" type="button">Mostrar tudo</button>';tools.appendChild(row);$('sidebarFit').onclick=()=>{$('fit')?.click();if(matchMedia('(max-width:760px)').matches)closeSidebar()};$('sidebarShowAll').onclick=()=>$('all')?.click()}
  if(!$('themeToggle')){const b=document.createElement('button');b.id='themeToggle';b.type='button';b.className='sidebar-feature';b.onclick=toggleTheme;tools.appendChild(b)}
  if(!$('sidebarBackdrop')){const b=document.createElement('button');b.id='sidebarBackdrop';b.type='button';b.setAttribute('aria-label','Fechar menu lateral');b.setAttribute('aria-hidden',document.body.classList.contains('sidebar-hidden')?'true':'false');main.appendChild(b);b.onclick=closeSidebar}
  new MutationObserver(()=>{const hidden=document.body.classList.contains('sidebar-hidden');$('sidebarToggle')?.setAttribute('aria-expanded',String(!hidden));$('sidebarBackdrop')?.setAttribute('aria-hidden',String(hidden))}).observe(document.body,{attributes:true,attributeFilter:['class']});
  applySavedTheme();
}

function ensureDwgUi(){
  if($('dwgTab'))return;const nav=document.querySelector('.project-tabs'),workspace=$('projectWorkspace');if(!nav||!workspace)return;
  const tab=document.createElement('button');tab.id='dwgTab';tab.type='button';tab.setAttribute('aria-pressed','false');tab.setAttribute('data-owner-control','');tab.textContent='DWG';nav.appendChild(tab);
  const section=document.createElement('section');section.id='dwgDialog';section.hidden=true;section.setAttribute('data-owner-control','');section.setAttribute('aria-label','Leitor DWG e DXF');
  section.innerHTML=`<div class="dwg-head"><div class="dwg-head-copy"><span class="eyebrow">CAD LOCAL</span><h2>Leitor DWG / DXF</h2><p>Leitura no navegador com worker dedicado. O arquivo não é enviado automaticamente.</p></div><div class="dwg-head-actions"><button id="openDWG" class="primary" type="button" data-owner-control>＋ Abrir DWG</button><button id="openAnotherDWG" type="button" data-owner-control>Abrir outro</button><button id="dwgCancel" type="button" hidden>Cancelar</button><button id="dwgSnapshot" type="button" disabled>Imagem</button><button id="closeDWG" type="button">Voltar ao 3D</button></div><input id="dwgFile" type="file" accept=".dwg,.dxf,application/acad,application/x-acad" hidden data-owner-control></div>
  <div class="dwg-workspace"><div id="dwgCanvasWrap" tabindex="0"><div id="dwgStage"></div><div id="dwgEmpty"><div class="dwg-empty-card"><div class="dwg-file-icon">DWG</div><strong>Abra um desenho CAD</strong><p>DWG e DXF. Toque em Abrir DWG ou solte o arquivo nesta área.</p><small>O motor DWG é inicializado antes da leitura para detectar falhas de worker/WASM.</small></div></div><div class="dwg-toolbar"><button id="dwgZoomOut" type="button">−</button><button id="dwgZoomIn" type="button">＋</button><button id="dwgFit" type="button">Enquadrar</button><button id="dwgTheme" type="button">Fundo escuro</button><button id="dwgFullscreen" type="button">⛶ Tela cheia</button></div><div id="dwgDropHint">Solte o DWG aqui</div></div><aside class="dwg-side"><h3>Desenho</h3><div id="dwgFileName" class="dwg-file-name">Nenhum DWG aberto</div><div id="dwgFileMeta" class="dwg-file-meta">Aguardando arquivo.</div><div class="dwg-progress" id="dwgProgress" hidden><div id="dwgProgressBar"></div></div><p id="dwgStatus" role="status">Motor ainda não testado.</p><div id="dwgStats" class="dwg-stats"></div><div id="dwgDiagnostics" class="dwg-diagnostics"></div><p class="dwg-note">Alguns objetos proprietários do AutoCAD podem ter representação parcial. Se um desenho tiver XREF/SHX externos, esses recursos precisam estar incorporados ou disponíveis.</p></aside></div>`;
  workspace.appendChild(section);
}

ensureDwgUi();ensureSidebarEnhancements();installQuantities();setBuildLabel();

const tab=$('dwgTab'),workspace=$('projectWorkspace'),panel=$('dwgDialog'),input=$('dwgFile'),stage=$('dwgStage'),wrap=$('dwgCanvasWrap'),statusEl=$('dwgStatus'),fileNameEl=$('dwgFileName'),fileMetaEl=$('dwgFileMeta'),progress=$('dwgProgress'),progressBar=$('dwgProgressBar'),statsEl=$('dwgStats'),diagEl=$('dwgDiagnostics');
let cadModulePromise=null,cadViewer=null,activeAbort=null,prewarmPromise=null,drawingDark=false;
const humanSize=bytes=>{const u=['B','KB','MB','GB'];let v=Number(bytes)||0,i=0;while(v>=1024&&i<u.length-1){v/=1024;i++}return`${v>=100||i===0?v.toFixed(0):v.toFixed(1)} ${u[i]}`};
function setDwgStatus(message,kind=''){if(statusEl){statusEl.textContent=message||'';statusEl.dataset.kind=kind}}
function setDwgProgress(value,visible=true){if(!progress||!progressBar)return;progress.hidden=!visible;progressBar.style.width=`${Math.max(0,Math.min(100,Number(value)||0))}%`}
function diagnostics(extra=''){if(!diagEl)return;const webgl=(()=>{try{return!!document.createElement('canvas').getContext('webgl2')||!!document.createElement('canvas').getContext('webgl')}catch{return false}})();diagEl.innerHTML=`<span>Worker: <b>${typeof Worker!=='undefined'?'OK':'indisponível'}</b></span><span>WebGL: <b>${webgl?'OK':'fallback 2D'}</b></span><span>Motor: <b>CAD ${CAD_VERSION}</b></span>${extra?`<small>${extra}</small>`:''}`}

function activateDwg(){if(document.body.classList.contains('readonly'))return;workspace?.classList.remove('pdf-active');workspace?.classList.add('dwg-active');if(panel)panel.hidden=false;tab?.classList.add('active');tab?.setAttribute('aria-pressed','true');for(const id of ['modelTab','pdfTab']){$(id)?.classList.remove('active');$(id)?.setAttribute('aria-pressed','false')}closeSidebar();diagnostics();requestAnimationFrame(()=>cadViewer?.fit?.());prewarmDwg()}
function deactivateDwg(){workspace?.classList.remove('dwg-active');if(panel)panel.hidden=true;tab?.classList.remove('active');tab?.setAttribute('aria-pressed','false')}
tab?.addEventListener('click',activateDwg);$('modelTab')?.addEventListener('click',deactivateDwg);$('pdfTab')?.addEventListener('click',deactivateDwg);$('projectPDFs')?.addEventListener('click',deactivateDwg);$('closeDWG')?.addEventListener('click',()=>{deactivateDwg();$('modelTab')?.click()});

async function getCadModule(){if(!cadModulePromise){setDwgStatus('Carregando biblioteca CAD…','busy');cadModulePromise=import(CAD_MODULE_URL).catch(e=>{cadModulePromise=null;throw new Error(`Falha ao carregar a biblioteca CAD: ${e?.message||e}`)})}return cadModulePromise}
async function ensureCadViewer(){
  if(cadViewer)return cadViewer;const mod=await getCadModule();if(!mod?.CadViewer)throw new Error('Componente CadViewer não encontrado.');stage.replaceChildren();
  cadViewer=new mod.CadViewer({container:stage,renderer:'auto',wasmPath:CAD_WASM_BASE,workerUrl:CAD_WORKER_URL,workerTimeoutMs:180000,autoFit:true,canvasOptions:{background:'#e7edef',foreground:'#152a33',fitMode:'auto',contrastMode:'adaptive',minColorContrast:2.6,showPageBounds:true,showUnsupportedMarkers:false,enableSpatialIndex:true,spatialIndexCellCount:72,maxCurveSegments:matchMedia('(max-width:760px)').matches?40:72,textMinPixelHeight:4,maxVisibleTextLabels:matchMedia('(max-width:760px)').matches?1000:2400},onLoadProgress:e=>{const p=Number(e?.percent);setDwgProgress(Number.isFinite(p)?p:15,true);setDwgStatus(e?.message||'Processando desenho…','busy')},onError:e=>setDwgStatus(e?.message||'Erro no motor CAD.','error')});
  return cadViewer;
}
async function prewarmDwg(){
  if(prewarmPromise)return prewarmPromise;prewarmPromise=(async()=>{try{const v=await ensureCadViewer();setDwgStatus('Testando motor DWG…','busy');await v.preloadDwg?.();setDwgStatus('Motor DWG pronto. Selecione o arquivo.','ok');diagnostics('Worker local inicializado com sucesso.')}catch(e){prewarmPromise=null;console.error('DWG warmup',e);setDwgStatus(`Motor DWG não iniciou: ${e?.message||e}`,'error');diagnostics('Falha na inicialização do worker/WASM.')}})();return prewarmPromise}
function validateCadFile(file){if(!file)throw new Error('Selecione um DWG ou DXF.');if(!/\.(dwg|dxf)$/i.test(file.name))throw new Error('O arquivo precisa ser DWG ou DXF.');const mobile=matchMedia('(max-width:760px)').matches,max=mobile?120:700,mb=file.size/1048576;if(mb>max)throw new Error(`Arquivo com ${mb.toFixed(0)} MB. Nesta tela o limite é ${max} MB para preservar a memória do navegador.`)}
function friendlyCadError(e){const m=String(e?.message||e||'Falha desconhecida');if(/memory|out of memory|allocation/i.test(m))return'Faltou memória para interpretar este DWG. Tente fechar outras abas, usar um arquivo menor ou abrir no computador.';if(/worker|wasm|fetch|404|network|mime|magic word/i.test(m))return`O motor DWG não conseguiu iniciar corretamente. ${m}`;return`Não foi possível abrir o desenho. ${m}`}
async function readDrawing(file){
  try{validateCadFile(file)}catch(e){setDwgStatus(e.message,'error');return}activateDwg();fileNameEl.textContent=file.name;fileMetaEl.textContent=`${humanSize(file.size)} · ${/\.dxf$/i.test(file.name)?'DXF':'DWG'} · leitura local`;if($('dwgEmpty'))$('dwgEmpty').hidden=true;$('openDWG').disabled=true;$('openAnotherDWG').disabled=true;$('dwgCancel').hidden=false;$('dwgSnapshot').disabled=true;statsEl.textContent='';setDwgProgress(5,true);if(activeAbort)activeAbort.abort();activeAbort=new AbortController();
  try{const viewer=await ensureCadViewer();if(/\.dwg$/i.test(file.name))await prewarmDwg();viewer.clear?.();setDwgStatus('Lendo o arquivo CAD…','busy');await viewer.loadFile(file,{signal:activeAbort.signal,useWorker:/\.dwg$/i.test(file.name),workerUrl:CAD_WORKER_URL,workerTimeoutMs:180000});viewer.fit?.();setDwgProgress(100,true);setDwgStatus('Desenho carregado. Arraste para mover e use dois dedos para ampliar.','ok');$('dwgSnapshot').disabled=false;const doc=viewer.getDocument?.(),src=viewer.getSourceDocument?.(),layers=src?.layers||doc?.layers||src?.tables?.layers||doc?.tables?.layers,entities=src?.entities||doc?.entities||src?.modelSpace?.entities||[],bom=viewer.getBom?.();const ec=Array.isArray(entities)?entities.length:0,lc=Array.isArray(layers)?layers.length:0,tc=Array.isArray(bom?.tables)?bom.tables.length:0;statsEl.innerHTML=`${ec?`<span><b>${ec.toLocaleString('pt-BR')}</b> entidades</span>`:''}${lc?`<span><b>${lc.toLocaleString('pt-BR')}</b> camadas</span>`:''}${tc?`<span><b>${tc}</b> tabelas/BOM</span>`:''}`;setTimeout(()=>setDwgProgress(0,false),900)}catch(e){if(e?.name==='AbortError')setDwgStatus('Leitura cancelada.','');else{console.error('DWG viewer',e);setDwgStatus(friendlyCadError(e),'error');if($('dwgEmpty'))$('dwgEmpty').hidden=false}setDwgProgress(0,false)}finally{$('openDWG').disabled=false;$('openAnotherDWG').disabled=false;$('dwgCancel').hidden=true;activeAbort=null;input.value=''}
}

$('openDWG')?.addEventListener('click',()=>input?.click());$('openAnotherDWG')?.addEventListener('click',()=>input?.click());input?.addEventListener('change',()=>readDrawing(input.files?.[0]));$('dwgCancel')?.addEventListener('click',()=>activeAbort?.abort());$('dwgFit')?.addEventListener('click',()=>cadViewer?.fit?.());$('dwgZoomIn')?.addEventListener('click',()=>cadViewer?.zoomIn?.());$('dwgZoomOut')?.addEventListener('click',()=>cadViewer?.zoomOut?.());
$('dwgTheme')?.addEventListener('click',()=>{if(!cadViewer)return;drawingDark=!drawingDark;cadViewer.setCanvasOptions?.({background:drawingDark?'#101820':'#e7edef',foreground:drawingDark?'#f3f7f8':'#152a33',contrastMode:'adaptive',minColorContrast:2.6});$('dwgTheme').textContent=drawingDark?'Fundo claro':'Fundo escuro'});
$('dwgFullscreen')?.addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await panel?.requestFullscreen?.()}catch{setDwgStatus('Tela cheia não está disponível neste navegador.','error')}});
$('dwgSnapshot')?.addEventListener('click',()=>{try{const canvas=stage.querySelector('canvas');if(!canvas)throw new Error('A vista ainda não está pronta.');const url=canvas.toDataURL('image/png'),a=document.createElement('a');a.href=url;a.download=(fileNameEl.textContent||'dwg').replace(/\.(dwg|dxf)$/i,'')+'-vista.png';document.body.appendChild(a);a.click();a.remove()}catch(e){setDwgStatus(e.message,'error')}});
if(wrap){for(const type of ['dragenter','dragover'])wrap.addEventListener(type,e=>{if(document.body.classList.contains('readonly'))return;e.preventDefault();wrap.classList.add('dwg-drag')});for(const type of ['dragleave','drop'])wrap.addEventListener(type,e=>{if(document.body.classList.contains('readonly'))return;e.preventDefault();wrap.classList.remove('dwg-drag')});wrap.addEventListener('drop',e=>{const file=[...(e.dataTransfer?.files||[])].find(f=>/\.(dwg|dxf)$/i.test(f.name));file?readDrawing(file):setDwgStatus('Solte um arquivo DWG ou DXF.','error')})}
if(document.body.classList.contains('readonly')&&tab)tab.hidden=true;new MutationObserver(()=>{const ro=document.body.classList.contains('readonly');if(tab)tab.hidden=ro;if(ro&&workspace?.classList.contains('dwg-active')){deactivateDwg();$('modelTab')?.click()}}).observe(document.body,{attributes:true,attributeFilter:['class']});
document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if($('quantitiesDialog')?.open){$('quantitiesDialog').close();return}if(!document.body.classList.contains('sidebar-hidden')){closeSidebar();return}if(workspace?.classList.contains('dwg-active')){deactivateDwg();$('modelTab')?.click()}});

applySavedTheme();diagnostics();
