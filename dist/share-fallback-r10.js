const $=id=>document.getElementById(id);

async function backendConfigured(){
  try{
    const response=await fetch(new URL('share-config.json',document.baseURI),{cache:'no-store'});
    if(!response.ok)return false;
    const cfg=await response.json();
    return Boolean(String(cfg.backend||'').trim());
  }catch{return false;}
}

function waitForExportReady(timeout=20000){
  return new Promise((resolve,reject)=>{
    const started=Date.now();
    const timer=setInterval(()=>{
      const ready=$('exportReady');
      if(ready && !ready.hidden){clearInterval(timer);resolve(true);return;}
      if(Date.now()-started>timeout){clearInterval(timer);reject(new Error('A exportação demorou demais.'));}
    },250);
  });
}

async function installFallback(){
  if(await backendConfigured())return;
  const share=$('share'),create=$('createShare'),dialog=$('shareDialog'),status=$('shareStatus');
  if(!share||!create||!dialog)return;

  share.hidden=false;
  share.disabled=false;
  share.onclick=()=>{
    dialog.showModal();
    if($('shareLinkRow'))$('shareLinkRow').hidden=true;
    if($('shareProgress'))$('shareProgress').hidden=true;
    create.innerHTML='<strong>↗ Compartilhar visualização</strong><span>Gera o arquivo interativo para enviar sem depender do servidor de links.</span>';
    if(status)status.textContent='O servidor de link público não está conectado. O compartilhamento por visualização interativa está disponível.';
  };

  create.onclick=async()=>{
    create.disabled=true;
    try{
      const exportBtn=$('exportHTML');
      if(!exportBtn)throw new Error('Exportação interativa não encontrada.');
      if(status)status.textContent='Preparando a visualização para compartilhar…';
      exportBtn.click();
      await waitForExportReady();
      const nativeShare=$('shareHTML');
      const save=$('saveHTML');
      if(nativeShare && !nativeShare.hidden){
        nativeShare.click();
        if(status)status.textContent='Visualização pronta para compartilhar.';
      }else if(save){
        save.click();
        if(status)status.textContent='Visualização gerada. O arquivo foi preparado para envio.';
      }else{
        throw new Error('Não foi possível preparar o arquivo compartilhável.');
      }
    }catch(error){
      if(status)status.textContent=error?.message||String(error);
    }finally{create.disabled=false;}
  };
}

setTimeout(()=>void installFallback(),1200);
