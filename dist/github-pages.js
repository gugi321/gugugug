const isGithubPages=location.hostname.endsWith('github.io');
if(isGithubPages){
  document.body.classList.add('github-pages-mode');
  const version=document.querySelector('.build-version');
  if(version)version.textContent='16/10/2026 · Eng Gustavo G · R10';
  const hint=document.getElementById('pdfOwnerHint');
  if(hint)hint.textContent='PDFs continuam disponíveis no projeto. Links públicos usam visualizador separado e somente leitura.';
}
