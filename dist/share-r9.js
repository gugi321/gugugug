const $ = id => document.getElementById(id);

let shareConfig = null;
let rememberedIfc = null;

async function getShareConfig(){
  if(shareConfig) return shareConfig;
  const response = await fetch(new URL('share-config.json', document.baseURI), {cache:'no-store'});
  if(!response.ok) throw new Error('Configuração do compartilhamento não encontrada.');
  shareConfig = await response.json();
  return shareConfig;
}

function normalizeBackend(value=''){
  return String(value || '').trim().replace(/\/+$/,'');
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
  let key = localStorage.getItem('gg-share-upload-key') || '';
  if(!key){
    key = prompt('Digite a chave de publicação do compartilhamento. Ela é necessária apenas no seu aparelho para criar links públicos.') || '';
    key = key.trim();
    if(key) localStorage.setItem('gg-share-upload-key', key);
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
    cutAxis: activeAxis,
    cutPosition: Number($('position')?.value || 50)
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

async function backendHealth(){
  const cfg = await getShareConfig();
  const backend = normalizeBackend(cfg.backend);
  if(!backend) throw new Error('O armazenamento gratuito ainda não foi conectado.');
  const response = await fetch(`${backend}/health`, {cache:'no-store'});
  if(!response.ok) throw new Error('O servidor de compartilhamento não respondeu.');
  return {cfg, backend};
}

async function createPublicShare(){
  const file = currentIfc();
  if(!file) throw new Error('Abra um IFC antes de criar o link.');
  const {cfg, backend} = await backendHealth();
  const max = Number(cfg.maxModelBytes || 1073741824);
  if(file.size > max) throw new Error('O IFC ultrapassa o limite de compartilhamento de 1 GB.');
  const uploadKey = getUploadKey();
  if(!uploadKey) throw new Error('A chave de publicação não foi informada.');

  const id = [...crypto.getRandomValues(new Uint8Array(16))].map(v=>v.toString(16).padStart(2,'0')).join('');
  const chunk = Math.min(Number(cfg.chunkSize || 8388608), 16*1024*1024);
  const total = Math.ceil(file.size / chunk);

  for(let part=0; part<total; part++){
    const start = part * chunk;
    const end = Math.min(file.size, start + chunk);
    setShareProgress((part/total)*92, `Enviando IFC · ${part+1}/${total}`);
    const response = await fetch(`${backend}/share/${id}/part/${part}`, {
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
    name:file.name,
    size:file.size,
    total,
    created:new Date().toISOString(),
    permission:'view',
    state:shareState()
  };
  const finalResponse = await fetch(`${backend}/share/${id}/meta`, {
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
    if($('shareStatus')) $('shareStatus').textContent='Verificando armazenamento gratuito…';
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
      $('shareStatus').textContent='Link público criado. Ele é diferente do endereço do aplicativo e abre somente em modo visualização.';
    }catch(error){
      $('shareStatus').textContent=error.message || String(error);
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
  const metaResponse=await fetch(`${backend}/share/${id}/meta`,{cache:'no-store'});
  if(!metaResponse.ok) throw new Error('Projeto compartilhado não encontrado.');
  const meta=await metaResponse.json();
  if(!Number.isInteger(meta.total) || meta.total<1 || meta.total>256) throw new Error('Compartilhamento incompleto.');

  const parts=[];
  for(let part=0;part<meta.total;part++){
    const response=await fetch(`${backend}/share/${id}/part/${part}`,{cache:'no-store'});
    if(!response.ok) throw new Error(`Falha ao baixar o IFC · ${part+1}/${meta.total}.`);
    parts.push(await response.arrayBuffer());
  }
  const file=new File(parts,meta.name||`projeto-${id}.ifc`,{type:'application/x-step'});
  const input=$('file');
  if(!input) throw new Error('Visualizador IFC não encontrado.');
  const dt=new DataTransfer();dt.items.add(file);input.files=dt.files;
  input.dispatchEvent(new Event('change',{bubbles:true}));

  const state=meta.state||{};
  setTimeout(()=>{
    if($('opacity') && Number.isFinite(state.opacity)){$('opacity').value=String(state.opacity);$('opacity').dispatchEvent(new Event('input',{bubbles:true}));}
    if($('edges')){$('edges').checked=Boolean(state.edges);$('edges').dispatchEvent(new Event('change',{bubbles:true}));}
    if($('showGrid')){$('showGrid').checked=state.showGrid!==false;$('showGrid').dispatchEvent(new Event('change',{bubbles:true}));}
    if($('position') && Number.isFinite(state.cutPosition)){$('position').value=String(state.cutPosition);$('position').dispatchEvent(new Event('input',{bubbles:true}));}
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
