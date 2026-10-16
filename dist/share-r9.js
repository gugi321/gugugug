const $ = id => document.getElementById(id);

let shareConfig = null;
let rememberedIfc = null;
const SESSION_KEY = 'eng-gustavo-g-share-key';
try { localStorage.removeItem('gg-share-upload-key'); } catch {}

async function getShareConfig(){
  if(shareConfig) return shareConfig;
  const response = await fetch(new URL('share-config.json', document.baseURI), {
    cache:'no-store', credentials:'omit', referrerPolicy:'no-referrer'
  });
  if(!response.ok) throw new Error('Configuração do compartilhamento não encontrada.');
  shareConfig = await response.json();
  return shareConfig;
}

function normalizeBackend(value=''){
  const raw = String(value || '').trim().replace(/\/+$/,'');
  if(!raw) return '';
  const url = new URL(raw);
  const local = ['localhost','127.0.0.1'].includes(url.hostname);
  if(url.protocol !== 'https:' && !local) throw new Error('O servidor de compartilhamento precisa usar HTTPS.');
  if(url.username || url.password) throw new Error('Servidor de compartilhamento inválido.');
  return url.origin + url.pathname.replace(/\/+$/,'');
}

function rememberFile(file){
  if(file && /\.ifc$/i.test(file.name)) rememberedIfc = file;
}

$('file')?.addEventListener('change', event => rememberFile(event.target.files?.[0]), true);
document.addEventListener('drop', event => {
  const file = [...(event.dataTransfer?.files || [])].find(f => /\.ifc$/i.test(f.name));
  rememberFile(file);
}, true);

function currentIfc(){
  return rememberedIfc || $('file')?.files?.[0] || null;
}

function getUploadKey(){
  let key = '';
  try { key = sessionStorage.getItem(SESSION_KEY) || ''; } catch {}
  if(!key){
    key = prompt('Digite a chave de publicação. Por segurança, ela ficará somente nesta sessão do navegador.') || '';
    key = key.trim();
    if(key.length > 256) throw new Error('Chave de publicação inválida.');
    if(key){ try { sessionStorage.setItem(SESSION_KEY, key); } catch {} }
  }
  return key;
}

function shareState(){
  const activeAxis = document.querySelector('.axes .active')?.dataset?.axis || 'z';
  return {
    opacity: Number($('opacity')?.value || 0),
    edges: Boolean($('edges')?.checked),
    showGrid: Boolean($('showGrid')?.checked),
    cut: Boolean($('cut')?.checked),
    cutAxis: ['x','y','z'].includes(activeAxis) ? activeAxis : 'z',
    cutPosition: Math.max(0,Math.min(100,Number($('position')?.value || 50)))
  };
}

function setShareProgress(percent, text=''){
  const wrap=$('shareProgress'), bar=$('shareProgressBar'), label=$('shareProgressText');
  if(!wrap || !bar || !label) return;
  wrap.hidden=false;
  const value=Math.max(0,Math.min(100,Number(percent)||0));
  bar.style.width=value+'%';
  label.textContent=text || Math.round(value)+'%';
}

async function safeFetch(url, options={}){
  const controller = new AbortController();
  const timeout = setTimeout(()=>controller.abort(), 45000);
  try {
    return await fetch(url, {
      credentials:'omit',
      referrerPolicy:'no-referrer',
      cache:'no-store',
      ...options,
      signal: controller.signal
    });
  } finally { clearTimeout(timeout); }
}

async function backendHealth(){
  const cfg = await getShareConfig();
  const backend = normalizeBackend(cfg.backend);
  if(!backend) throw new Error('O armazenamento seguro ainda não foi conectado.');
  const response = await safeFetch(`${backend}/health`);
  if(!response.ok) throw new Error('O servidor de compartilhamento não respondeu.');
  return {cfg, backend};
}

async function createPublicShare(){
  const file = currentIfc();
  if(!file) throw new Error('Abra um IFC antes de criar o link.');
  if(!/\.ifc$/i.test(file.name)) throw new Error('Somente arquivos IFC podem ser publicados.');
  const {cfg, backend} = await backendHealth();
  const max = Number(cfg.maxModelBytes || 1073741824);
  if(file.size < 1 || file.size > max) throw new Error('O IFC está vazio ou ultrapassa o limite de compartilhamento.');
  const header = await file.slice(0,4096).text();
  if(!header.includes('ISO-10303-21')) throw new Error('O arquivo não parece ser um IFC STEP válido.');
  const uploadKey = getUploadKey();
  if(!uploadKey) throw new Error('A chave de publicação não foi informada.');

  const id = [...crypto.getRandomValues(new Uint8Array(16))].map(v=>v.toString(16).padStart(2,'0')).join('');
  const chunk = Math.min(Math.max(Number(cfg.chunkSize || 8388608), 1024*1024), 16*1024*1024);
  const total = Math.ceil(file.size / chunk);
  if(total < 1 || total > 256) throw new Error('Quantidade de partes fora do limite seguro.');

  for(let part=0; part<total; part++){
    const start = part * chunk;
    const end = Math.min(file.size, start + chunk);
    setShareProgress((part/total)*92, `Enviando IFC · ${part+1}/${total}`);
    const response = await safeFetch(`${backend}/share/${id}/part/${part}`, {
      method:'PUT',
      headers:{
        'Content-Type':'application/octet-stream',
        'X-GG-Share-Key': uploadKey,
        'X-GG-Total': String(total)
      },
      body:file.slice(start,end)
    });
    if(!response.ok){
      const body=await response.json().catch(()=>({}));
      throw new Error(body.error || `Falha ao enviar a parte ${part+1}.`);
    }
  }

  setShareProgress(95,'Finalizando link público…');
  const meta = {
    id,
    name:file.name.slice(0,180),
    size:file.size,
    total,
    created:new Date().toISOString(),
    permission:'view',
    state:shareState()
  };
  const finalResponse = await safeFetch(`${backend}/share/${id}/meta`, {
    method:'PUT',
    headers:{'Content-Type':'application/json','X-GG-Share-Key':uploadKey},
    body:JSON.stringify(meta)
  });
  if(!finalResponse.ok){
    const body=await finalResponse.json().catch(()=>({}));
    throw new Error(body.error || 'Falha ao finalizar o compartilhamento.');
  }

  setShareProgress(100,'Link pronto');
  const viewer = new URL(cfg.viewerPath || 'view/', document.baseURI);
  viewer.searchParams.set('share', id);
  return viewer.href;
}

function installShareOverride(){
  const shareButton=$('share'), createButton=$('createShare');
  if(!shareButton || !createButton) return;

  shareButton.hidden=false;
  shareButton.disabled=false;
  shareButton.onclick=async()=>{
    $('shareDialog')?.showModal();
    if($('shareLinkRow')) $('shareLinkRow').hidden=true;
    if($('shareProgress')) $('shareProgress').hidden=true;
    if($('shareStatus')) $('shareStatus').textContent='Verificando armazenamento seguro…';
    try{
      await backendHealth();
      $('shareStatus').textContent='Pronto. O link abrirá um visualizador público separado e somente leitura.';
    }catch(error){
      $('shareStatus').textContent=error.message || String(error);
    }
  };

  createButton.onclick=async()=>{
    createButton.disabled=true;
    if($('shareStatus')) $('shareStatus').textContent='Criando link público…';
    try{
      const link = await createPublicShare();
      $('shareLink').value=link;
      $('shareLinkRow').hidden=false;
      $('shareStatus').textContent='Link público criado em modo somente leitura. A chave de publicação não faz parte do link.';
    }catch(error){
      $('shareStatus').textContent=error.name==='AbortError'?'O servidor demorou demais para responder. Tente novamente.':(error.message || String(error));
    }finally{
      createButton.disabled=false;
    }
  };

  $('copyShareLink')?.addEventListener('click', async()=>{
    const value=$('shareLink')?.value || '';
    if(!value) return;
    try{ await navigator.clipboard.writeText(value); $('shareStatus').textContent='Link copiado.'; }
    catch{ $('shareLink')?.select(); document.execCommand('copy'); }
  });
}

function forceReadOnly(){
  document.body.classList.add('readonly','gg-public-share');
  const hideSelectors=['#share','.open','#file','#uploadPDFs','#pdfFiles','#exportIFC','#exportHTML','#exportPNG','#shareZIP','#shareHTML','#saveHTML','#saveZIP','#printElement','#dwgTab'];
  for(const selector of hideSelectors){
    document.querySelectorAll(selector).forEach(el=>{el.hidden=true; el.disabled=true;});
  }
}

async function loadPublicShare({id,backend}){
  if(!/^[a-f0-9]{32}$/i.test(id||'')) throw new Error('Identificador de compartilhamento inválido.');
  backend=normalizeBackend(backend);
  if(!backend) throw new Error('Servidor público não configurado.');
  forceReadOnly();
  const metaResponse=await safeFetch(`${backend}/share/${id}/meta`);
  if(!metaResponse.ok) throw new Error('Projeto compartilhado não encontrado.');
  const meta=await metaResponse.json();
  if(!Number.isInteger(meta.total) || meta.total<1 || meta.total>256) throw new Error('Compartilhamento incompleto.');
  if(!Number.isSafeInteger(meta.size) || meta.size<1 || meta.size>1073741824) throw new Error('Tamanho do compartilhamento inválido.');

  const parts=[];
  let received=0;
  for(let part=0;part<meta.total;part++){
    const response=await safeFetch(`${backend}/share/${id}/part/${part}`);
    if(!response.ok) throw new Error(`Falha ao baixar o IFC · ${part+1}/${meta.total}.`);
    const data=await response.arrayBuffer();
    received+=data.byteLength;
    if(received>1073741824) throw new Error('Compartilhamento excedeu o limite seguro.');
    parts.push(data);
  }
  if(received!==meta.size) throw new Error('O arquivo compartilhado está incompleto.');
  const safeName=String(meta.name||`projeto-${id}.ifc`).replace(/[\\/\u0000-\u001f]/g,'_').slice(0,180);
  const file=new File(parts,safeName,{type:'application/x-step'});
  const input=$('file');
  if(!input) throw new Error('Visualizador IFC não encontrado.');
  const dt=new DataTransfer();dt.items.add(file);input.files=dt.files;
  input.dispatchEvent(new Event('change',{bubbles:true}));

  const state=meta.state||{};
  setTimeout(()=>{
    if($('opacity') && Number.isFinite(state.opacity)){$('opacity').value=String(Math.max(0,Math.min(95,state.opacity)));$('opacity').dispatchEvent(new Event('input',{bubbles:true}));}
    if($('edges')){$('edges').checked=Boolean(state.edges);$('edges').dispatchEvent(new Event('change',{bubbles:true}));}
    if($('showGrid')){$('showGrid').checked=state.showGrid!==false;$('showGrid').dispatchEvent(new Event('change',{bubbles:true}));}
    if($('position') && Number.isFinite(state.cutPosition)){$('position').value=String(Math.max(0,Math.min(100,state.cutPosition)));$('position').dispatchEvent(new Event('input',{bubbles:true}));}
    forceReadOnly();
  },1200);
}

window.addEventListener('message',event=>{
  if(event.origin!==window.location.origin) return;
  const data=event.data||{};
  if(data.type!=='GG_PUBLIC_SHARE_LOAD') return;
  loadPublicShare(data).then(()=>{
    event.source?.postMessage({type:'GG_PUBLIC_SHARE_READY'},event.origin);
  }).catch(error=>{
    event.source?.postMessage({type:'GG_PUBLIC_SHARE_ERROR',message:error.message||String(error)},event.origin);
  });
});

installShareOverride();
