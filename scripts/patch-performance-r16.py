from pathlib import Path
import re


def must_replace(text, old, new, label, count=1):
    found = text.count(old)
    if found < count:
        raise SystemExit(f'{label}: expected at least {count}, found {found}')
    return text.replace(old, new, count)

# ---------------- app.js ----------------
p = Path('dist/app.js')
app = p.read_text(encoding='utf-8')

app = must_replace(
    app,
    "let readOnlyMode=Boolean(embedded),trustedReadOnlyLoad=false,sharePermission=embedded?'view':'edit';\nlet T,Orbit,api,scene,camera,renderer,controls,model,box,grid,busy=false,axis='z',sign=1,selected=null;let W,apiReady=false,currentModelID=null,inspector=null,currentFile=null,propertyWindow=null,selectionRevision=0,isolatedID=null,transition=null;const hiddenIDs=new Set();let elementInfo=null;const propertyCache=new Map();const categories=new Map();let meshes=[];",
    "let readOnlyMode=Boolean(embedded),trustedReadOnlyLoad=false,sharePermission=embedded?'view':'edit';\nlet T,Orbit,api,scene,camera,renderer,controls,model,box,grid,busy=false,axis='z',sign=1,selected=null;let W,apiReady=false,currentModelID=null,inspector=null,currentFile=null,propertyWindow=null,selectionRevision=0,isolatedID=null,transition=null;const hiddenIDs=new Set();let elementInfo=null;const propertyCache=new Map();const categories=new Map();const ggDisciplineCache=new Map();let meshes=[];let ggRenderQueued=0,ggTransitionRAF=0;",
    'app globals'
)

app = must_replace(
    app,
    " for(const el of document.querySelectorAll(editControls)){\n  if(readOnlyMode){el.hidden=true;el.disabled=true;}\n  else if(el.id!=='pdfDownload'){el.hidden=false;}\n }",
    " for(const el of document.querySelectorAll(editControls)){\n  const fileInput=el.matches?.('input[type=\\\"file\\\"]');\n  if(readOnlyMode){el.hidden=true;el.disabled=true;}\n  else if(fileInput){el.hidden=true;el.disabled=false;}\n  else if(el.id!=='pdfDownload'){el.hidden=false;el.disabled=false;}\n }",
    'file input visibility'
)

app = must_replace(
    app,
    "const isSteel=t=>/IFCREINFORCING|IFCTENDON/.test(t);\nasync function init(){",
    "const isSteel=t=>/IFCREINFORCING|IFCTENDON/.test(t);\nfunction ggRenderNow(){if(renderer&&!document.hidden)renderer.render(scene,camera)}\nfunction ggScheduleRender(){if(!renderer||document.hidden||ggRenderQueued)return;ggRenderQueued=requestAnimationFrame(()=>{ggRenderQueued=0;ggRenderNow()})}\nfunction ggRunTransition(){if(!renderer||!transition||ggTransitionRAF)return;const step=()=>{ggTransitionRAF=0;if(!renderer||!transition){ggScheduleRender();return}camera.position.lerp(transition.position,.2);controls.target.lerp(transition.target,.2);if(camera.position.distanceTo(transition.position)<Math.max(transition.distance*.001,.0001)){camera.position.copy(transition.position);controls.target.copy(transition.target);transition=null}controls.update();ggRenderNow();if(transition)ggTransitionRAF=requestAnimationFrame(step)};ggTransitionRAF=requestAnimationFrame(step)}\nasync function init(){",
    'render helpers'
)

app = must_replace(
    app,
    "renderer=new T.WebGLRenderer({antialias:!mobileLayout(),alpha:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,mobileLayout()?1.1:1.5));",
    "renderer=new T.WebGLRenderer({antialias:false,alpha:true,preserveDrawingBuffer:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,mobileLayout()?1:1.25));",
    'renderer options'
)

app = must_replace(
    app,
    "controls=new Orbit(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.12;controls.zoomSpeed=.8;controls.rotateSpeed=.7;controls.screenSpacePanning=true;controls.touches.ONE=T.TOUCH.ROTATE;controls.touches.TWO=T.TOUCH.DOLLY_PAN;controls.addEventListener(\"start\",()=>{transition=null});renderer.domElement.tabIndex=0;",
    "controls=new Orbit(camera,renderer.domElement);controls.enableDamping=false;controls.zoomSpeed=.8;controls.rotateSpeed=.7;controls.screenSpacePanning=true;controls.touches.ONE=T.TOUCH.ROTATE;controls.touches.TWO=T.TOUCH.DOLLY_PAN;controls.addEventListener(\"start\",()=>{transition=null;if(ggTransitionRAF){cancelAnimationFrame(ggTransitionRAF);ggTransitionRAF=0}});controls.addEventListener(\"change\",ggScheduleRender);renderer.domElement.tabIndex=0;",
    'orbit controls'
)

app = must_replace(
    app,
    "new ResizeObserver(()=>{const w=$('canvas').clientWidth,h=$('canvas').clientHeight;if(!w||!h)return;renderer.setSize(w,h);resizeCamera(w/h);camera.updateProjectionMatrix()}).observe($('canvas'));let ggLastFrame=0;renderer.setAnimationLoop((now=0)=>{if(document.hidden)return;const interval=mobileLayout()?33:16;if(!transition&&now-ggLastFrame<interval)return;ggLastFrame=now;if(transition){camera.position.lerp(transition.position,.16);controls.target.lerp(transition.target,.16);if(camera.position.distanceTo(transition.position)<transition.distance*.001){camera.position.copy(transition.position);controls.target.copy(transition.target);transition=null}}controls.update();renderer.render(scene,camera)});let down;",
    "new ResizeObserver(()=>{const w=$('canvas').clientWidth,h=$('canvas').clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);resizeCamera(w/h);camera.updateProjectionMatrix();ggScheduleRender()}).observe($('canvas'));let down;",
    'continuous render loop removal'
)

app = must_replace(
    app,
    "  for(const m of meshes)if(m.userData.id===mesh.userData.id)m.material.emissive.setHex(mobileLayout()?0x8a4c2d:0x635035);",
    "  for(const m of meshes)if(m.userData.id===mesh.userData.id)m.material.emissive.setHex(mobileLayout()?0x8a4c2d:0x635035);ggScheduleRender();",
    'selection render'
)

app = must_replace(
    app,
    " if(animate)transition={position,target:c,distance};else{transition=null;camera.position.copy(position);controls.target.copy(c);controls.update()}\n}",
    " if(animate){transition={position,target:c,distance};ggRunTransition()}else{transition=null;camera.position.copy(position);controls.target.copy(c);controls.update();ggScheduleRender()}\n}",
    'fit transition'
)

# Replace update() with a cheaper material-state update and demand render.
old_update_start = "function update(){if(dimensionGroup){dimensionGroup.visible=!elementSection&&!$('cut').checked&&meshes.some(m=>m.userData.id===dimensionData.hostID&&m.visible);}document.body.classList.toggle('section-active',!!elementSection);if(!model)return;if(!elementSection)camera.up.set(0,0,1);if(elementSection)prepareSection();else if(sectionContours){dispose(sectionContours);sectionContours=null;}"
new_update_start = "function update(options={}){if(dimensionGroup){dimensionGroup.visible=!elementSection&&!$('cut').checked&&meshes.some(m=>m.userData.id===dimensionData.hostID&&m.visible);}document.body.classList.toggle('section-active',!!elementSection);if(!model)return;if(!elementSection)camera.up.set(0,0,1);if(elementSection)prepareSection(options.sectionContours!==false);else if(sectionContours){dispose(sectionContours);sectionContours=null;}"
app = must_replace(app, old_update_start, new_update_start, 'update signature')

old_material = "}mat.needsUpdate=true;for(const child of m.children){child.visible=$(\"edges\").checked;child.material.clippingPlanes=mat.clippingPlanes}}if(grid)grid.visible=!elementSection&&$(\"showGrid\").checked;const visible=new Set(meshes.filter(m=>m.visible).map(m=>m.userData.id)).size,total=new Set(meshes.map(m=>m.userData.id)).size;$('count').textContent=visible.toLocaleString('pt-BR')+' / '+total.toLocaleString('pt-BR')+' elementos visíveis'}"
new_material = "}const clipCount=mat.clippingPlanes?.length||0,newClipCount=(elementSection?elementSection.planes||[]:$('cut').checked?[plane]:[]).length,newTransparent=mat.opacity<1,newDepthWrite=mat.opacity>=1;if(mat.transparent!==newTransparent||mat.depthWrite!==newDepthWrite||clipCount!==newClipCount)mat.needsUpdate=true;mat.transparent=newTransparent;mat.depthWrite=newDepthWrite;for(const child of m.children){child.visible=$(\"edges\").checked;child.material.clippingPlanes=mat.clippingPlanes}}if(grid)grid.visible=!elementSection&&$(\"showGrid\").checked;const visible=new Set(meshes.filter(m=>m.visible).map(m=>m.userData.id)).size,total=new Set(meshes.map(m=>m.userData.id)).size;$('count').textContent=visible.toLocaleString('pt-BR')+' / '+total.toLocaleString('pt-BR')+' elementos visíveis';ggScheduleRender()}"
app = must_replace(app, old_material, new_material, 'material update')

# Section calculation: skip triangle work during slider movement and ignore meshes not crossing the cut plane.
pattern = re.compile(r"function prepareSection\(\)\{.*?\n refreshSectionPresentation\(\);\n\}", re.S)
match = pattern.search(app)
if not match:
    raise SystemExit('prepareSection block not found')
new_prepare = r'''function prepareSection(buildContours=true){
 const s=elementSection,frame=sectionFrame(s.hostID,$('sectionAxis').value);
 if(!frame)return;
 s.frame=frame;const {n,axes,lo,hi}=frame,at=T.MathUtils.lerp(lo[0],hi[0],Number($('sectionPosition').value)/100),half=Number($('sectionThickness').value)/2;
 s.at=at;s.planes=[new T.Plane(n.clone(),-at+half),new T.Plane(n.clone().negate(),at+half)];
 for(let i=0;i<3;i++)s.planes.push(new T.Plane(axes[i].clone(),-lo[i]-.002),new T.Plane(axes[i].clone().negate(),hi[i]+.002));
 if(buildContours){
  if(sectionContours)dispose(sectionContours);sectionContours=null;
  const vertices=[],point=new T.Vector3(),triangle=[new T.Vector3(),new T.Vector3(),new T.Vector3()];
  for(const m of meshes)if(s.ids.has(m.userData.id)){
   const range=sectionRangeAlong(m,n);if(at<range[0]-1e-6||at>range[1]+1e-6)continue;
   const position=m.geometry.getAttribute('position'),index=m.geometry.index,count=index?index.count:position.count;
   for(let k=0;k<count;k+=3){for(let j=0;j<3;j++)triangle[j].fromBufferAttribute(position,index?index.getX(k+j):k+j).applyMatrix4(m.matrixWorld);
    const distances=triangle.map(p=>p.dot(n)-at);if(distances.every(d=>d>1e-7)||distances.every(d=>d< -1e-7))continue;
    const hits=[];for(let j=0;j<3;j++){const next=(j+1)%3,d=distances[j],e=distances[next];if(Math.abs(d)<1e-7)hits.push(triangle[j].clone());else if(d*e<0)hits.push(point.copy(triangle[j]).lerp(triangle[next],d/(d-e)).clone());}
    const unique=hits.filter((p,i)=>!hits.slice(0,i).some(q=>q.distanceToSquared(p)<1e-14));if(unique.length===2)vertices.push(...unique[0].toArray(),...unique[1].toArray());
   }
  }
  if(vertices.length){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));sectionContours=new T.LineSegments(g,new T.LineBasicMaterial({color:0xff7a32,depthTest:false,depthWrite:false,clippingPlanes:s.planes.slice(2)}));sectionContours.renderOrder=50;scene.add(sectionContours);}
 }
 refreshSectionPresentation();ggScheduleRender();
}'''
app = app[:match.start()] + new_prepare + app[match.end():]

app = must_replace(
    app,
    " const c=document.createElement('canvas');c.width=960;c.height=180;const x=c.getContext('2d');x.fillStyle='rgba(8,28,36,.94)';x.beginPath();x.roundRect(4,4,952,172,24);x.fill();x.strokeStyle='rgba(255,255,255,.35)';x.lineWidth=4;x.stroke();x.fillStyle='#fff';x.font='700 72px Arial';x.textAlign='center';x.textBaseline='middle';x.fillText(text,480,92);",
    " const c=document.createElement('canvas');c.width=384;c.height=72;const x=c.getContext('2d');x.fillStyle='rgba(8,28,36,.92)';x.beginPath();x.roundRect(2,2,380,68,10);x.fill();x.strokeStyle='rgba(255,255,255,.3)';x.lineWidth=2;x.stroke();x.fillStyle='#fff';x.font='700 28px Arial';x.textAlign='center';x.textBaseline='middle';x.fillText(text,192,37);",
    'section sprite texture'
)

# Whole-member context: duplicate only the concrete host, not every rebar mesh.
app = must_replace(
    app,
    " for(const m of meshes)if(s.ids.has(m.userData.id)){\n  m.updateWorldMatrix(true,false);const steel=isSteel(m.userData.type),host=m.userData.id===s.hostID;\n  const material=new T.MeshBasicMaterial({color:steel?0xf08a52:0x8fa7b2,side:T.DoubleSide,transparent:true,opacity:host?.13:.22,depthWrite:false,depthTest:true,wireframe:false});\n  const ghost=new T.Mesh(m.geometry,material);ghost.matrix.copy(m.matrixWorld);ghost.matrixAutoUpdate=false;ghost.renderOrder=host?2:3;sectionContextGroup.add(ghost);\n }",
    " for(const m of meshes)if(m.userData.id===s.hostID){\n  m.updateWorldMatrix(true,false);const material=new T.MeshBasicMaterial({color:0x8fa7b2,side:T.DoubleSide,transparent:true,opacity:.12,depthWrite:false,depthTest:true,wireframe:false});\n  const ghost=new T.Mesh(m.geometry,material);ghost.matrix.copy(m.matrixWorld);ghost.matrixAutoUpdate=false;ghost.renderOrder=2;sectionContextGroup.add(ghost);\n }",
    'section ghost context'
)

# Deduplicate callouts by diameter+role and limit labels.
app = must_replace(
    app,
    " callouts.slice(0,12).forEach((c,i)=>{",
    " const uniqueCallouts=[];const seenCallouts=new Set();for(const c of callouts.sort((a,b)=>a.p.distanceToSquared(planeCenter)-b.p.distanceToSquared(planeCenter))){const key=c.text+'|'+c.role;if(seenCallouts.has(key))continue;seenCallouts.add(key);uniqueCallouts.push(c)}\n uniqueCallouts.slice(0,6).forEach((c,i)=>{",
    'callout dedupe'
)
app = must_replace(
    app,
    " window.GG_SECTION_INFO={width:cm(width),height:cm(height),position:Number($('sectionPosition').value),bars:[...new Set(callouts.map(c=>c.text))],pieceLength:cm(length)};",
    " window.GG_SECTION_INFO={width:cm(width),height:cm(height),position:Number($('sectionPosition').value),bars:[...new Set(uniqueCallouts.map(c=>c.text))],pieceLength:cm(length)};",
    'section info unique callouts'
)

app = must_replace(
    app,
    " camera.up.copy(f.v);camera.position.copy(center).addScaledVector(view,span*2.05+1);controls.target.copy(center);camera.userData.span=span*1.28/Math.min(aspect,1);camera.zoom=1;camera.near=.0001;camera.far=Math.max(box.getSize(new T.Vector3()).length()*12,100);resizeCamera(aspect);camera.updateProjectionMatrix();controls.update();",
    " camera.up.copy(f.v);camera.position.copy(center).addScaledVector(view,span*2.05+1);controls.target.copy(center);camera.userData.span=span*1.28/Math.min(aspect,1);camera.zoom=1;camera.near=.0001;camera.far=Math.max(box.getSize(new T.Vector3()).length()*12,100);resizeCamera(aspect);camera.updateProjectionMatrix();controls.update();ggScheduleRender();",
    'section frame render'
)

app = must_replace(
    app,
    "let sectionFrameRequest=0;\n$('sectionPosition').oninput=()=>{cancelAnimationFrame(sectionFrameRequest);sectionFrameRequest=requestAnimationFrame(()=>{if(elementSection){update();frameSection()}})};",
    "let sectionFrameRequest=0,sectionContourTimer=0;\n$('sectionPosition').oninput=()=>{cancelAnimationFrame(sectionFrameRequest);sectionFrameRequest=requestAnimationFrame(()=>{if(elementSection){update({sectionContours:false});frameSection();clearTimeout(sectionContourTimer);sectionContourTimer=setTimeout(()=>{if(elementSection){prepareSection(true);ggScheduleRender()}},140)}})};",
    'section slider debounce'
)

# Cache discipline classification instead of calling web-ifc for every mesh on every update.
mode_pattern = re.compile(r"function ggModeFor\(m\)\{.*?\n\}\nfunction ggMaterialOpacity", re.S)
mode_match = mode_pattern.search(app)
if not mode_match:
    raise SystemExit('ggModeFor block not found')
new_mode = r'''function ggModeFor(m){
 const cacheKey=Number(m?.userData?.id);if(Number.isFinite(cacheKey)&&ggDisciplineCache.has(cacheKey))return ggDisciplineCache.get(cacheKey);
 const type=String(m?.userData?.type||''),s=ggElementText(m),pipeType=/IFCPIPE|IFCFLOWSEGMENT|IFCFLOWFITTING|IFCDISTRIBUTION/.test(type);let mode='other';
 if(isSteel(type))mode='steel';
 else if(/IFCCABLE|IFCELECTRIC|IFCLIGHT/.test(type)||/eletric|elétric|electri|cabo|cable|eletroduto|conduit|quadro|painel|luminar|lighting/.test(s))mode='electrical';
 else if(pipeType){if(/esgoto|sanitar|sanitár|sewer|waste|soil|ventila/.test(s))mode='sewer';else if(/pluvial|storm|rain|chuva|dren/.test(s))mode='storm';else if(/agua|água|water|hidraul|potavel|potável|recalque|aliment|barrilete|reservat|fria|quente/.test(s))mode='hydraulic';else mode='pipes';}
 else if(/IFCDOOR|IFCWINDOW|IFCROOF|IFCCOVERING|IFCSPACE|IFCFURNISH/.test(type)||/arquitet|architect/.test(s))mode='architecture';
 else if(/IFCBEAM|IFCCOLUMN|IFCSLAB|IFCWALL|IFCFOOTING|IFCPILE|IFCSTAIR|IFCMEMBER|IFCPLATE/.test(type))mode='structural';
 if(Number.isFinite(cacheKey))ggDisciplineCache.set(cacheKey,mode);return mode;
}
function ggMaterialOpacity'''
app = app[:mode_match.start()] + new_mode + app[mode_match.end():]

app = app.replace("categories.clear();propertyCache.clear();", "categories.clear();propertyCache.clear();ggDisciplineCache.clear();")

p.write_text(app, encoding='utf-8')

# ---------------- dwg.js ----------------
p = Path('dist/dwg.js')
dwg = p.read_text(encoding='utf-8')
dwg = dwg.replace("15/10/2026 · compartilhamento R9 · cotas ampliadas", "18/10/2026 · R16 leve · corte otimizado")

# Do not load CAD styles until CAD is opened.
dwg = dwg.replace("ensureStylesheet('gg-dwg-style', 'dwg.css');\nensureStylesheet('gg-cad-embed-style', 'cad-embed.css');\nensureStylesheet('gg-ui-r9-style', 'ui-r9.css');\n", "")

# Build panel with an unloaded iframe.
dwg = dwg.replace('''      <iframe id="cadFrame" src="${cadUrl()}" title="Mini CAD DWG online" loading="eager"></iframe>''', '''      <iframe id="cadFrame" title="Mini CAD DWG online" loading="lazy"></iframe>''')

# Remove eager heavyweight feature imports.
dwg = dwg.replace("void import('./quantities.js').catch(error => console.warn('Quantitativos:', error));\nvoid import('./share-r9.js').catch(error => console.warn('Compartilhamento R9:', error));\nvoid import('./dimensions-r9.js').catch(error => console.warn('Cotas ampliadas R9:', error));\n", "")

# Add lazy quantitative launcher.
insert_after = "ensureCadTab();\nensureSidebarClose();\nsetBuildLabel();\n"
lazy_launcher = r'''ensureCadTab();
ensureSidebarClose();
setBuildLabel();
function ensureQuantitiesLauncher(){
 const sidebar=$('sidebar');if(!sidebar||$('quantitiesOpen')||$('quantitiesLazyOpen'))return;
 let box=$('projectQuickTools');if(!box){box=document.createElement('section');box.id='projectQuickTools';box.className='project-quick-tools';box.innerHTML='<div class="eyebrow">PROJETO <span>00</span></div>';sidebar.prepend(box)}
 const b=document.createElement('button');b.id='quantitiesLazyOpen';b.type='button';b.className='sidebar-feature';b.textContent='▦ Quantitativos';b.onclick=async()=>{b.disabled=true;b.textContent='Carregando…';try{const mod=await import('./quantities.js');mod.installQuantities?.();b.remove();$('quantitiesOpen')?.click()}catch(e){b.disabled=false;b.textContent='▦ Quantitativos';console.warn('Quantitativos:',e)}};box.appendChild(b);
}
ensureQuantitiesLauncher();
'''
if insert_after not in dwg:
    raise SystemExit('dwg launcher insertion point missing')
dwg = dwg.replace(insert_after, lazy_launcher, 1)

# Load styles and CAD URL only when activated.
old_activate = "function activateCad() {\n  if (document.body.classList.contains('readonly')) return;"
new_activate = "function activateCad() {\n  if (document.body.classList.contains('readonly')) return;\n  ensureStylesheet('gg-dwg-style', 'dwg.css');\n  ensureStylesheet('gg-cad-embed-style', 'cad-embed.css');\n  ensureStylesheet('gg-ui-r9-style', 'ui-r9.css');\n  if(frame && !frame.getAttribute('src')) frame.src=cadUrl();"
if old_activate not in dwg:
    raise SystemExit('activateCad block missing')
dwg = dwg.replace(old_activate, new_activate, 1)

p.write_text(dwg, encoding='utf-8')

# ---------------- dimensions-r9.js ----------------
p = Path('dist/dimensions-r9.js')
dim = p.read_text(encoding='utf-8')
dim = dim.replace("import './eng-r10.js';\n\n", "")
# Lazy-load the larger engineering tools only when requested.
bootstrap = r'''const valuesHost=document.getElementById('dimensionValues');
const viewport=document.getElementById('viewport');
function installLazyTools(){
 const header=document.querySelector('header');if(!header||document.getElementById('engToolsButton')||document.getElementById('toolsLazyButton'))return;
 const b=document.createElement('button');b.id='toolsLazyButton';b.type='button';b.textContent='Ferramentas';b.onclick=async()=>{b.disabled=true;b.textContent='Carregando…';try{b.remove();await import('./eng-r10.js');document.getElementById('engToolsButton')?.click()}catch(e){console.warn('Ferramentas:',e)}};const open=header.querySelector('.primary.open');header.insertBefore(b,open||null);
}
installLazyTools();'''
dim = dim.replace("const valuesHost=document.getElementById('dimensionValues');\nconst viewport=document.getElementById('viewport');", bootstrap, 1)
p.write_text(dim, encoding='utf-8')

# ---------------- github-pages.js ----------------
p = Path('dist/github-pages.js')
gp = p.read_text(encoding='utf-8')
gp = gp.replace("  void import('./eng-r10.js').catch(error=>console.warn('Ferramentas Eng Gustavo G:',error));\n", "")
p.write_text(gp, encoding='utf-8')

# ---------------- service worker ----------------
p = Path('dist/sw.js')
sw = p.read_text(encoding='utf-8')
sw = sw.replace("const CACHE='eng-gustavo-g-r11-1';", "const CACHE='eng-gustavo-g-r16';")
sw = sw.replace("const CORE=['./','./index.html','./style.css','./app.js','./dwg.js','./github-pages.js','./eng-r10.js','./manifest.webmanifest','./app-icon.svg'];", "const CORE=['./','./index.html','./style.css','./ui-polish-r15.css','./app.js','./manifest.webmanifest','./app-icon.svg'];")
p.write_text(sw, encoding='utf-8')

# ---------------- UI polish ----------------
p = Path('dist/ui-polish-r15.css')
css = p.read_text(encoding='utf-8')
css += r'''
/* R16 · compact UI + GPU-friendly overrides */
#file,#pdfFiles{display:none!important}
#engOnline{display:none!important}
.background-brand{mix-blend-mode:normal!important}
dialog::backdrop{backdrop-filter:none!important}
#bigDimensionOverlay{left:14px!important;right:auto!important;top:auto!important;bottom:54px!important;transform:none!important;width:auto!important;max-width:min(330px,calc(100% - 28px))!important;padding:8px 9px!important;border-radius:10px!important;background:rgba(14,39,48,.9)!important;box-shadow:0 5px 16px rgba(10,34,43,.14)!important;backdrop-filter:none!important;display:block!important}
#bigDimensionOverlay[hidden]{display:none!important}
#bigDimensionOverlay small{display:block!important;margin:0 0 5px!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important;color:#a8d9e4!important;font:750 9px/1.2 system-ui!important;letter-spacing:.09em!important}
#bigDimensionOverlay .big-dimension-values{display:flex!important;gap:5px!important;flex-wrap:wrap!important;justify-content:flex-start!important;width:auto!important}
#bigDimensionOverlay .big-dimension-values span{flex:0 0 auto!important;min-width:0!important;min-height:0!important;padding:4px 7px!important;border:1px solid rgba(255,255,255,.16)!important;border-radius:7px!important;background:rgba(255,255,255,.08)!important;box-shadow:none!important;text-shadow:none!important;color:#fff!important;font:700 12px/1.15 system-ui!important;white-space:nowrap!important}
#status{left:50%!important;right:auto!important;top:auto!important;bottom:10px!important;transform:translateX(-50%)!important;width:auto!important;max-width:min(560px,calc(100% - 28px))!important;padding:8px 12px!important;border-radius:9px!important;background:rgba(18,42,50,.94)!important;box-shadow:0 5px 16px rgba(8,28,36,.14)!important;font-size:12px!important;line-height:1.35!important}
body.section-active .navigation{display:none!important}
body.section-active .toolbar{bottom:14px!important;opacity:.88}
header{gap:12px!important;padding-left:18px!important;padding-right:18px!important}
header .brand{min-width:220px!important}
#filename{min-width:0!important}
#toolsLazyButton,#engToolsButton{white-space:nowrap}
@media(max-width:760px){#bigDimensionOverlay{left:7px!important;bottom:48px!important;max-width:calc(100% - 14px)!important;padding:7px!important}#bigDimensionOverlay .big-dimension-values span{font-size:11px!important;padding:4px 6px!important}#status{bottom:5px!important;max-width:calc(100% - 14px)!important;font-size:11px!important}header{padding-left:10px!important;padding-right:10px!important}header .brand{min-width:0!important}#toolsLazyButton,#engToolsButton{padding:8px!important;font-size:11px!important}}
'''
p.write_text(css, encoding='utf-8')

# ---------------- index build label ----------------
p = Path('dist/index.html')
html = p.read_text(encoding='utf-8')
html = re.sub(r'<span class="build-version"[^>]*>.*?</span>', '<span class="build-version" title="Versão publicada">18/10/2026 · R16 leve · corte otimizado</span>', html, count=1)
p.write_text(html, encoding='utf-8')

print('R16 performance patch applied')
