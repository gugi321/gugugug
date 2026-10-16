const $ = id => document.getElementById(id);
const APP_NAME = 'Eng Gustavo G';
const PREF_KEY = 'eng-gustavo-g-ui-r10';

function setBranding(){
  document.title = APP_NAME;
  const meta = document.querySelector('meta[name="description"]');
  if(meta) meta.setAttribute('content', 'Eng Gustavo G · Visualizador técnico de projetos IFC, CAD e PDF');
  const brandTitle = document.querySelector('header .brand strong');
  const brandSub = document.querySelector('header .brand small');
  if(brandTitle) brandTitle.textContent = APP_NAME;
  if(brandSub) brandSub.textContent = 'PROJETOS IFC · CAD · PDF';
  const credit = document.querySelector('.developer-credit');
  if(credit) credit.textContent = 'Eng Gustavo G · Engenharia';
}

function dispatch(el, type){
  if(!el) return;
  el.dispatchEvent(new Event(type, {bubbles:true}));
}

function loadPrefs(){
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); }
  catch { return {}; }
}

function savePrefs(){
  const data = {
    opacity: Number($('opacity')?.value || 0),
    edges: Boolean($('edges')?.checked),
    showGrid: Boolean($('showGrid')?.checked)
  };
  try { localStorage.setItem(PREF_KEY, JSON.stringify(data)); } catch {}
}

function restorePrefs(){
  const data = loadPrefs();
  if($('opacity') && Number.isFinite(data.opacity)) $('opacity').value = String(data.opacity);
  if($('edges') && typeof data.edges === 'boolean') $('edges').checked = data.edges;
  if($('showGrid') && typeof data.showGrid === 'boolean') $('showGrid').checked = data.showGrid;
  dispatch($('opacity'), 'input');
  dispatch($('edges'), 'change');
  dispatch($('showGrid'), 'change');
}

function currentProjectKey(){
  const name = ($('filename')?.textContent || 'projeto-local').trim();
  return 'eng-gustavo-g-notes:' + name.slice(0,160);
}

function selectedText(){
  const name = $('elementName')?.textContent?.trim();
  if(!name || $('selection')?.hidden) return '';
  const type = $('elementType')?.textContent?.trim() || '';
  const dims = $('dimensionValues')?.innerText?.trim() || '';
  const properties = $('propertyBody')?.innerText?.trim() || '';
  return [APP_NAME, name, type, dims, properties].filter(Boolean).join('\n\n').slice(0,12000);
}

async function copySelected(){
  const text = selectedText();
  if(!text) throw new Error('Selecione um elemento do modelo primeiro.');
  await navigator.clipboard.writeText(text);
}

function applyInspectionPreset(){
  if($('opacity')) $('opacity').value = '35';
  if($('edges')) $('edges').checked = true;
  if($('showGrid')) $('showGrid').checked = false;
  dispatch($('opacity'), 'input');
  dispatch($('edges'), 'change');
  dispatch($('showGrid'), 'change');
  savePrefs();
}

function applyStructurePreset(){
  if($('opacity')) $('opacity').value = '60';
  if($('edges')) $('edges').checked = true;
  if($('showGrid')) $('showGrid').checked = true;
  dispatch($('opacity'), 'input');
  dispatch($('edges'), 'change');
  dispatch($('showGrid'), 'change');
  savePrefs();
}

function installStyle(){
  const style = document.createElement('style');
  style.textContent = `
    #engTools{max-width:min(620px,calc(100vw - 24px));border:0;border-radius:18px;padding:0;box-shadow:0 24px 80px #10252d35;color:#18303a;background:#fff}
    #engTools::backdrop{background:#10252d66;backdrop-filter:blur(2px)}
    .eng-tools-head{display:flex;justify-content:space-between;align-items:center;padding:16px 18px;border-bottom:1px solid #dde6e9}.eng-tools-head h2{font-size:18px;margin:0}.eng-tools-head button{border:0;background:transparent;font-size:22px;cursor:pointer}
    .eng-tools-body{padding:16px;display:grid;gap:14px}.eng-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.eng-grid button{min-height:48px;border:1px solid #cad9de;border-radius:12px;background:#f7fafb;color:#18303a;font-weight:650;cursor:pointer;padding:10px}.eng-grid button:hover{background:#edf4f6}
    .eng-note{display:grid;gap:8px}.eng-note textarea{width:100%;min-height:120px;box-sizing:border-box;border:1px solid #cad9de;border-radius:12px;padding:12px;font:inherit;resize:vertical}.eng-note small{color:#657b84}.eng-status{font-size:12px;color:#56717b;min-height:18px}
    #engToolsButton{white-space:nowrap}.eng-online{display:inline-flex;align-items:center;gap:5px;font-size:11px}.eng-online::before{content:'';width:7px;height:7px;border-radius:50%;background:#33a56a}.eng-online.offline::before{background:#c66b3d}
    body.eng-clean #sidebar,body.eng-clean #informationDock,body.eng-clean footer{display:none!important}body.eng-clean main{grid-template-columns:1fr!important}body.eng-clean #projectWorkspace{height:100vh!important}
    @media(max-width:760px){.eng-grid{grid-template-columns:1fr}#engTools{width:calc(100vw - 18px)}}
  `;
  document.head.appendChild(style);
}

function installDialog(){
  if($('engTools')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'engTools';
  dialog.innerHTML = `
    <div class="eng-tools-head"><h2>Ferramentas rápidas · Eng Gustavo G</h2><button id="engClose" aria-label="Fechar">×</button></div>
    <div class="eng-tools-body">
      <div class="eng-grid">
        <button id="engInspection">Modo vistoria</button>
        <button id="engStructure">Leitura estrutural</button>
        <button id="engCopy">Copiar dados do elemento</button>
        <button id="engClean">Tela limpa</button>
        <button id="engFit">Enquadrar modelo</button>
        <button id="engFullscreen">Tela cheia</button>
      </div>
      <label class="eng-note"><strong>Notas locais da obra</strong><textarea id="engNotes" placeholder="Anote pendências, medições de campo, dúvidas e itens para conferir..."></textarea><small>Salvas apenas neste navegador, por nome de arquivo. Não são enviadas ao servidor.</small></label>
      <div class="eng-grid"><button id="engExportNotes">Exportar notas .txt</button><button id="engClearPrefs">Restaurar preferências</button></div>
      <div id="engToolStatus" class="eng-status"></div>
    </div>`;
  document.body.appendChild(dialog);

  const notes = $('engNotes');
  const refreshNotes = () => { try { notes.value = localStorage.getItem(currentProjectKey()) || ''; } catch {} };
  refreshNotes();
  notes.addEventListener('input', () => { try { localStorage.setItem(currentProjectKey(), notes.value); } catch {} });
  new MutationObserver(refreshNotes).observe($('filename') || document.body, {subtree:true,characterData:true,childList:true});

  $('engClose').onclick = () => dialog.close();
  $('engInspection').onclick = () => { applyInspectionPreset(); $('engToolStatus').textContent='Modo vistoria aplicado.'; };
  $('engStructure').onclick = () => { applyStructurePreset(); $('engToolStatus').textContent='Leitura estrutural aplicada.'; };
  $('engCopy').onclick = async () => { try { await copySelected(); $('engToolStatus').textContent='Dados do elemento copiados.'; } catch(e){ $('engToolStatus').textContent=e.message; } };
  $('engClean').onclick = () => { document.body.classList.toggle('eng-clean'); dialog.close(); };
  $('engFit').onclick = () => { $('fit')?.click(); dialog.close(); };
  $('engFullscreen').onclick = () => { $('fullscreen')?.click(); dialog.close(); };
  $('engClearPrefs').onclick = () => { try { localStorage.removeItem(PREF_KEY); } catch {} $('engToolStatus').textContent='Preferências visuais restauradas.'; };
  $('engExportNotes').onclick = () => {
    const blob = new Blob([notes.value || ''], {type:'text/plain;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = ((($('filename')?.textContent || 'obra').replace(/[^a-z0-9._-]+/gi,'-')) + '-notas.txt').slice(0,180);
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  };
}

function installHeaderTools(){
  const header = document.querySelector('header');
  if(!header || $('engToolsButton')) return;
  const button = document.createElement('button');
  button.id='engToolsButton';
  button.type='button';
  button.textContent='Ferramentas';
  button.title='Ferramentas rápidas de trabalho (Alt+N)';
  button.onclick=()=>{ $('engTools')?.showModal(); };
  const firstPrimary = header.querySelector('.primary.open');
  header.insertBefore(button, firstPrimary || null);

  const online=document.createElement('span');
  online.id='engOnline';
  online.className='eng-online';
  const update=()=>{ online.classList.toggle('offline',!navigator.onLine); online.textContent=navigator.onLine?'online':'offline'; };
  update();window.addEventListener('online',update);window.addEventListener('offline',update);
  header.appendChild(online);
}

function hardenClient(){
  try { localStorage.removeItem('gg-share-upload-key'); } catch {}
  for(const a of document.querySelectorAll('a[target="_blank"]')) a.rel='noopener noreferrer';
  const frame=$('cadFrame');
  if(frame) frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-downloads');
  document.addEventListener('dragover', event => {
    if(!event.dataTransfer) return;
    event.dataTransfer.dropEffect='copy';
  });
}

function keyboardShortcuts(event){
  if(event.target?.matches?.('input,textarea,select,[contenteditable="true"]')) return;
  if(event.altKey && event.key.toLowerCase()==='n') { event.preventDefault(); $('engTools')?.showModal(); }
  if(event.altKey && event.key.toLowerCase()==='c') { event.preventDefault(); copySelected().catch(()=>{}); }
  if(event.key==='Escape' && document.body.classList.contains('eng-clean')) document.body.classList.remove('eng-clean');
}

setBranding();
installStyle();
installDialog();
installHeaderTools();
hardenClient();
document.addEventListener('keydown', keyboardShortcuts);
for(const id of ['opacity','edges','showGrid']) $(id)?.addEventListener('change',savePrefs);
$('opacity')?.addEventListener('input',savePrefs);
setTimeout(restorePrefs,300);
setTimeout(hardenClient,800);
