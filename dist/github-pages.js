const isGithubPages=location.hostname.endsWith('github.io');
if(isGithubPages){
  document.body.classList.add('github-pages-mode');
  document.title='Eng Gustavo G';
  const version=document.querySelector('.build-version');
  if(version)version.textContent='16/10/2026 · Eng Gustavo G · R10.2';
  const hint=document.getElementById('pdfOwnerHint');
  if(hint)hint.textContent='PDFs continuam disponíveis no projeto. O site público não deve ser usado como referência para localizar o código-fonte.';
  void import('./eng-r10.js').catch(error=>console.warn('Ferramentas Eng Gustavo G:',error));
}
