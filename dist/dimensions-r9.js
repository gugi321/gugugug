const valuesHost=document.getElementById('dimensionValues');
const viewport=document.getElementById('viewport');
let cached=[];

function ensureOverlay(){
  let overlay=document.getElementById('bigDimensionOverlay');
  if(overlay||!viewport)return overlay;
  overlay=document.createElement('div');
  overlay.id='bigDimensionOverlay';
  overlay.setAttribute('aria-label','Cotas ampliadas do elemento');
  overlay.innerHTML='<small>COTAS DO ELEMENTO</small><div class="big-dimension-values"></div>';
  viewport.appendChild(overlay);
  return overlay;
}

function readValues(){
  if(!valuesHost)return cached;
  const now=[...valuesHost.querySelectorAll('span')].map(el=>el.textContent?.trim()).filter(Boolean);
  if(now.length)cached=now;
  return cached;
}

function render(){
  const overlay=ensureOverlay();if(!overlay)return;
  const vals=readValues();
  const active=document.body.classList.contains('dimensions-active')||document.body.classList.contains('section-active');
  overlay.hidden=!active||!vals.length;
  if(overlay.hidden)return;
  const host=overlay.querySelector('.big-dimension-values');
  host.replaceChildren(...vals.map(text=>{const span=document.createElement('span');span.textContent=text;return span;}));
}

if(valuesHost)new MutationObserver(render).observe(valuesHost,{childList:true,subtree:true,characterData:true});
new MutationObserver(render).observe(document.body,{attributes:true,attributeFilter:['class']});
window.addEventListener('resize',render);
render();
