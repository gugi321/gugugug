import './eng-r10.js';

const valuesHost=document.getElementById('dimensionValues');
const viewport=document.getElementById('viewport');
let cached=[];
function ensureOverlay(){let o=document.getElementById('bigDimensionOverlay');if(o||!viewport)return o;o=document.createElement('div');o.id='bigDimensionOverlay';o.setAttribute('aria-label','Cotas ampliadas do elemento');o.innerHTML='<small>COTAS DO ELEMENTO</small><div class="big-dimension-values"></div>';viewport.appendChild(o);return o;}
function readValues(){if(!valuesHost)return cached;const now=[...valuesHost.querySelectorAll('span')].map(el=>el.textContent?.trim()).filter(Boolean);if(now.length)cached=now;return cached;}
function sectionValues(){const s=window.GG_SECTION_INFO;if(!s)return [];return [`B: ${s.width}`,`H: ${s.height}`,`Peça: ${s.pieceLength}`,...(s.bars||[]).slice(0,6)];}
function render(){const o=ensureOverlay();if(!o)return;const section=document.body.classList.contains('section-active'),normal=document.body.classList.contains('dimensions-active');const vals=section?sectionValues():readValues();o.hidden=!(section||normal)||!vals.length;if(o.hidden)return;o.querySelector('small').textContent=section?'CORTE · PEÇA INTEIRA':'COTAS DO ELEMENTO';const h=o.querySelector('.big-dimension-values');h.replaceChildren(...vals.map(text=>{const s=document.createElement('span');s.textContent=text;return s;}));}
if(valuesHost)new MutationObserver(render).observe(valuesHost,{childList:true,subtree:true,characterData:true});new MutationObserver(render).observe(document.body,{attributes:true,attributeFilter:['class']});window.addEventListener('gg-section-update',render);window.addEventListener('resize',render);render();
