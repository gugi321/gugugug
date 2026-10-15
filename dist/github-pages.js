const isGithubPages=location.hostname.endsWith('github.io');
if(isGithubPages){
  document.body.classList.add('github-pages-mode');
  const version=document.querySelector('.build-version');
  if(version)version.textContent='15/10/2026 · GitHub Pages · compartilhamento R9';
  const hint=document.getElementById('pdfOwnerHint');
  if(hint)hint.textContent='PDFs continuam disponíveis no projeto. O compartilhamento público R9 usa armazenamento separado e não depende do Netlify.';
}
