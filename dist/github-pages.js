const isGithubPages=location.hostname.endsWith('github.io');
if(isGithubPages){
  document.body.classList.add('github-pages-mode');
  document.title='Eng Gustavo G';
  const version=document.querySelector('.build-version');
  if(version)version.textContent='16/10/2026 · Eng Gustavo G · R11.1';
  const hint=document.getElementById('pdfOwnerHint');
  if(hint)hint.textContent='Arquivos IFC, DWG e PDF são escolhidos no próprio aparelho e processados localmente no navegador.';
  const shareStatus=document.getElementById('shareStatus');
  if(shareStatus)shareStatus.textContent='No celular, use o compartilhamento de arquivos do iPhone/Android; não é necessário Netlify.';
  void import('./share-fallback-r10.js').catch(error=>console.warn('Compartilhamento alternativo:',error));
  if('serviceWorker' in navigator){
    window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(error=>console.warn('PWA:',error)),{once:true});
  }
}
