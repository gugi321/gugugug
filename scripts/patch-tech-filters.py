from pathlib import Path

app_path = Path('dist/app.js')
text = app_path.read_text(encoding='utf-8')

text = text.replace(
    "const PUBLIC_VIEWER_ORIGIN='https://visualizar-gustavo-gil-20260915-222909-8602.netlify.app';",
    "const PUBLIC_VIEWER_ORIGIN='https://eng-gustavo-g.hatchable.site';"
)

# Per-discipline opacity must participate in the normal render/update loop.
text = text.replace(
    "mat.opacity=isSteel(m.userData.type)?1:opacity;",
    "mat.opacity=ggMaterialOpacity(m,isSteel(m.userData.type)?1:opacity);"
)

marker = "$('layerSearch').oninput=layerUI;$('sidebarToggle').onclick=()=>{document.body.classList.toggle('sidebar-hidden');$('sidebarToggle').setAttribute('aria-expanded',String(!document.body.classList.contains('sidebar-hidden')))};"

patch = r'''function ggElementText(m){
 const line=currentModelID!==null?(()=>{try{return api.GetLine(currentModelID,m.userData.id)}catch{return null}})():null;
 return [m.userData.type,m.userData.name,line?.Name?.value,line?.ObjectType?.value,line?.Description?.value,line?.Tag?.value,line?.PredefinedType?.value].filter(Boolean).join(' ').toLowerCase();
}
const ggDisciplineState={architecture:true,structural:true,steel:true,hydraulic:true,sewer:true,storm:true,electrical:true,pipes:true,other:true};
const ggDisciplineOpacity={architecture:55,structural:0,steel:0,hydraulic:0,sewer:0,storm:0,electrical:0,pipes:0,other:0};
function ggModeFor(m){
 const type=String(m?.userData?.type||''),s=ggElementText(m);
 const pipeType=/IFCPIPE|IFCFLOWSEGMENT|IFCFLOWFITTING|IFCDISTRIBUTION/.test(type);
 if(isSteel(type))return 'steel';
 if(/IFCCABLE|IFCELECTRIC|IFCLIGHT/.test(type)||/eletric|elétric|electri|cabo|cable|eletroduto|conduit|quadro|painel|luminar|lighting/.test(s))return 'electrical';
 if(pipeType){
  if(/esgoto|sanitar|sanitár|sewer|waste|soil|ventila/.test(s))return 'sewer';
  if(/pluvial|storm|rain|chuva|dren/.test(s))return 'storm';
  if(/agua|água|water|hidraul|potavel|potável|recalque|aliment|barrilete|reservat|fria|quente/.test(s))return 'hydraulic';
  return 'pipes';
 }
 if(/IFCDOOR|IFCWINDOW|IFCROOF|IFCCOVERING|IFCSPACE|IFCFURNISH/.test(type)||/arquitet|architect/.test(s))return 'architecture';
 if(/IFCBEAM|IFCCOLUMN|IFCSLAB|IFCWALL|IFCFOOTING|IFCPILE|IFCSTAIR|IFCMEMBER|IFCPLATE/.test(type))return 'structural';
 return 'other';
}
function ggMaterialOpacity(m,base){
 const mode=ggModeFor(m),pct=Math.max(0,Math.min(95,Number(ggDisciplineOpacity[mode]||0)));
 return Math.max(.03,Math.min(1,Number(base||1)*(1-pct/100)));
}
function ggApplyLayers(){
 hiddenIDs.clear();isolatedID=null;
 for(const m of meshes){if(ggDisciplineState[ggModeFor(m)]===false)hiddenIDs.add(m.userData.id)}
 update();
 return new Set(meshes.filter(m=>m.visible).map(m=>m.userData.id)).size;
}
function ggSetLayer(mode,value){
 if(!(mode in ggDisciplineState))return 0;
 ggDisciplineState[mode]=Boolean(value);const shown=ggApplyLayers();
 status(`${mode}: ${ggDisciplineState[mode]?'ligado':'desligado'} · ${shown} elemento(s) visível(is).`);return shown;
}
function ggSetLayerOpacity(mode,value){
 if(!(mode in ggDisciplineOpacity))return;
 ggDisciplineOpacity[mode]=Math.max(0,Math.min(95,Number(value)||0));update();
}
function ggSetAllLayers(value=true){for(const k of Object.keys(ggDisciplineState))ggDisciplineState[k]=Boolean(value);return ggApplyLayers()}
function ggQuickFilter(mode='all'){
 if(mode==='all'){ggSetAllLayers(true);status('');return meshes.length}
 for(const k of Object.keys(ggDisciplineState))ggDisciplineState[k]=k===mode;
 const shown=ggApplyLayers();
 const labelsQuick={steel:'Armaduras',structural:'Estrutural',hydraulic:'Hidráulica / água',sewer:'Esgoto sanitário',storm:'Pluvial / drenagem',electrical:'Elétrica',pipes:'Tubulações',architecture:'Arquitetura',other:'Outros'};
 status(shown?`${labelsQuick[mode]||mode}: ${shown} elemento(s) visível(is).`:`Nenhum elemento identificado como ${labelsQuick[mode]||mode}. Verifique a classificação exportada no IFC.`);return shown;
}
function ggSetCut(a){axis=a;document.querySelectorAll('[data-axis]').forEach(b=>b.classList.toggle('active',b.dataset.axis===axis));$('cut').checked=true;update();}
function ggClearCut(){$('cut').checked=false;update();}
function ggSetCutPosition(value){$('position').value=String(Math.max(0,Math.min(100,Number(value)||0)));update();}
function ggSetOpacity(value){$('opacity').value=String(Math.max(0,Math.min(95,Number(value)||0)));update();}
function ggView(view){fit(view||'iso');}
window.GG_VIEWER_API={
 filter:ggQuickFilter,
 setLayer:ggSetLayer,
 setLayerOpacity:ggSetLayerOpacity,
 setAllLayers:ggSetAllLayers,
 getLayers:()=>({state:{...ggDisciplineState},opacity:{...ggDisciplineOpacity}}),
 modeForID:id=>{const m=meshes.find(x=>x.userData.id===id);return m?ggModeFor(m):null},
 setCut:ggSetCut,clearCut:ggClearCut,setCutPosition:ggSetCutPosition,setOpacity:ggSetOpacity,view:ggView,fit:()=>fit(),flipCut:()=>{sign*=-1;update()},toggleGrid:value=>{$('showGrid').checked=Boolean(value);update()},toggleEdges:value=>{$('edges').checked=Boolean(value);$('edges').dispatchEvent(new Event('change'))},showAll:()=>ggQuickFilter('all')
};
$('layerSearch').oninput=layerUI;$('sidebarToggle').onclick=()=>{document.body.classList.toggle('sidebar-hidden');$('sidebarToggle').setAttribute('aria-expanded',String(!document.body.classList.contains('sidebar-hidden')))};'''

start = text.find('function ggElementText(m){')
end_marker = "$('layerSearch').oninput=layerUI;"
if start >= 0:
    end = text.find(end_marker, start)
    if end < 0:
        raise SystemExit('existing technical patch end marker not found')
    end += len(end_marker)
    text = text[:start] + patch + text[end:]
elif marker in text:
    text = text.replace(marker, patch, 1)
else:
    raise SystemExit('sidebar marker not found')

# Lighter renderer: lower pixel density on mobile/high-DPI and cap idle mobile rendering.
text = text.replace(
    "renderer=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));",
    "renderer=new T.WebGLRenderer({antialias:!mobileLayout(),alpha:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,mobileLayout()?1.1:1.5));"
)
text = text.replace(
    "renderer.setAnimationLoop(()=>{if(transition){camera.position.lerp(transition.position,.16);controls.target.lerp(transition.target,.16);if(camera.position.distanceTo(transition.position)<transition.distance*.001){camera.position.copy(transition.position);controls.target.copy(transition.target);transition=null}}controls.update();renderer.render(scene,camera)});",
    "let ggLastFrame=0;renderer.setAnimationLoop((now=0)=>{if(document.hidden)return;const interval=mobileLayout()?33:16;if(!transition&&now-ggLastFrame<interval)return;ggLastFrame=now;if(transition){camera.position.lerp(transition.position,.16);controls.target.lerp(transition.target,.16);if(camera.position.distanceTo(transition.position)<transition.distance*.001){camera.position.copy(transition.position);controls.target.copy(transition.target);transition=null}}controls.update();renderer.render(scene,camera)});"
)
text = text.replace(
    "renderer.setPixelRatio(file.size>100*1024*1024?1:Math.min(devicePixelRatio,2));",
    "renderer.setPixelRatio(file.size>100*1024*1024?1:Math.min(devicePixelRatio,mobileLayout()?1:1.5));"
)

# Whole-element context + annotated section detail.
text = text.replace(
    "let elementSection=null,sectionContours=null;",
    "let elementSection=null,sectionContours=null,sectionContextGroup=null,sectionAnnotationGroup=null;"
)

helper_marker = "function frameSection(){"
helpers = r'''function clearSectionAnnotations(){
 if(!sectionAnnotationGroup)return;
 sectionAnnotationGroup.traverse(o=>{if(o.material?.map)o.material.map.dispose();if(o.material)o.material.dispose?.();if(o.geometry)o.geometry.dispose?.()});
 scene?.remove(sectionAnnotationGroup);sectionAnnotationGroup=null;
}
function clearSectionContext(){
 if(!sectionContextGroup)return;
 sectionContextGroup.traverse(o=>{if(o.material)o.material.dispose?.()});
 scene?.remove(sectionContextGroup);sectionContextGroup=null;
}
function clearSectionPresentation(){clearSectionAnnotations();clearSectionContext();window.GG_SECTION_INFO=null;window.dispatchEvent(new CustomEvent('gg-section-update'));}
function sectionSprite(text,position,size){
 const c=document.createElement('canvas');c.width=960;c.height=180;const x=c.getContext('2d');x.fillStyle='rgba(8,28,36,.94)';x.beginPath();x.roundRect(4,4,952,172,24);x.fill();x.strokeStyle='rgba(255,255,255,.35)';x.lineWidth=4;x.stroke();x.fillStyle='#fff';x.font='700 72px Arial';x.textAlign='center';x.textBaseline='middle';x.fillText(text,480,92);
 const texture=new T.CanvasTexture(c);texture.colorSpace=T.SRGBColorSpace;const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:false,depthWrite:false,transparent:true}));sprite.position.copy(position);sprite.scale.set(size*5.35,size,1);sprite.renderOrder=60;sectionAnnotationGroup.add(sprite);return sprite;
}
function sectionLine(points,color=0x33b6d2){
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points.flatMap(p=>p.toArray()),3));const line=new T.LineSegments(g,new T.LineBasicMaterial({color,depthTest:false,depthWrite:false,transparent:true,opacity:.96}));line.renderOrder=55;sectionAnnotationGroup.add(line);return line;
}
function sectionDimension(a,b,offsetDir,label,labelSize){
 const tick=offsetDir.clone().normalize().multiplyScalar(labelSize*.28);sectionLine([a,b,a.clone().sub(tick),a.clone().add(tick),b.clone().sub(tick),b.clone().add(tick)]);
 sectionSprite(label,a.clone().add(b).multiplyScalar(.5).addScaledVector(offsetDir.clone().normalize(),labelSize*.7),labelSize);
}
function sectionRangeAlong(mesh,n){
 const box=new T.Box3().setFromObject(mesh),pts=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])pts.push(new T.Vector3(x,y,z));
 return [Math.min(...pts.map(p=>p.dot(n))),Math.max(...pts.map(p=>p.dot(n)))];
}
function rebuildSectionContext(){
 clearSectionContext();const s=elementSection;if(!s)return;sectionContextGroup=new T.Group();sectionContextGroup.name='GG_SECTION_CONTEXT';
 for(const m of meshes)if(s.ids.has(m.userData.id)){
  m.updateWorldMatrix(true,false);const steel=isSteel(m.userData.type),host=m.userData.id===s.hostID;
  const material=new T.MeshBasicMaterial({color:steel?0xf08a52:0x8fa7b2,side:T.DoubleSide,transparent:true,opacity:host?.13:.22,depthWrite:false,depthTest:true,wireframe:false});
  const ghost=new T.Mesh(m.geometry,material);ghost.matrix.copy(m.matrixWorld);ghost.matrixAutoUpdate=false;ghost.renderOrder=host?2:3;sectionContextGroup.add(ghost);
 }
 scene.add(sectionContextGroup);
}
function refreshSectionPresentation(){
 const s=elementSection,f=s?.frame;if(!s||!f)return;if(!sectionContextGroup)rebuildSectionContext();clearSectionAnnotations();sectionAnnotationGroup=new T.Group();sectionAnnotationGroup.name='GG_SECTION_ANNOTATIONS';scene.add(sectionAnnotationGroup);
 const mid1=(f.lo[1]+f.hi[1])/2,mid2=(f.lo[2]+f.hi[2])/2,planeCenter=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,mid1).addScaledVector(f.v,mid2);
 const width=f.hi[1]-f.lo[1],height=f.hi[2]-f.lo[2],length=f.hi[0]-f.lo[0],cross=Math.max(width,height,.05),piece=Math.max(length,cross,.1),gap=cross*.16+piece*.012,labelSize=Math.max(cross*.09,piece*.023,.035);
 const u1=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,f.lo[1]).addScaledVector(f.v,f.lo[2]-gap),u2=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,f.hi[1]).addScaledVector(f.v,f.lo[2]-gap);
 const v1=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,f.hi[1]+gap).addScaledVector(f.v,f.lo[2]),v2=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,f.hi[1]+gap).addScaledVector(f.v,f.hi[2]);
 const cm=v=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}).format(v*100)+' cm';
 sectionDimension(u1,u2,f.v.clone().negate(),'B · '+cm(width),labelSize);sectionDimension(v1,v2,f.u,'H · '+cm(height),labelSize);
 const meta=new Map((s.barData||[]).map(b=>[Number(b.id),b])),callouts=[];
 for(const [id,b] of meta){if(!b?.diameters?.length)continue;const ms=meshes.filter(m=>m.userData.id===id);if(!ms.length)continue;let min=Infinity,max=-Infinity,bb=new T.Box3();for(const m of ms){const r=sectionRangeAlong(m,f.n);min=Math.min(min,r[0]);max=Math.max(max,r[1]);bb.union(new T.Box3().setFromObject(m));}if(s.at<min-.01||s.at>max+.01)continue;const p=bb.getCenter(new T.Vector3());p.addScaledVector(f.n,s.at-p.dot(f.n));callouts.push({id,p,text:'Ø '+b.diameters.join(' / '),role:b.role||''});
 }
 callouts.slice(0,12).forEach((c,i)=>{let radial=c.p.clone().sub(planeCenter);radial.addScaledVector(f.n,-radial.dot(f.n));if(radial.lengthSq()<1e-8)radial=(i%2?f.u:f.v).clone();radial.normalize();const labelPos=c.p.clone().addScaledVector(radial,cross*(.28+(i%3)*.07)+piece*.014).addScaledVector(f.n,piece*.008);const dir=c.p.clone().sub(labelPos),dist=dir.length();if(dist>.001){dir.normalize();const arrow=new T.ArrowHelper(dir,labelPos,dist,0xff8b42,Math.min(labelSize*.7,dist*.32),Math.min(labelSize*.36,dist*.16));arrow.line.material.depthTest=false;arrow.cone.material.depthTest=false;arrow.line.renderOrder=58;arrow.cone.renderOrder=58;sectionAnnotationGroup.add(arrow);}sectionSprite(c.text,labelPos,labelSize*.82);});
 window.GG_SECTION_INFO={width:cm(width),height:cm(height),position:Number($('sectionPosition').value),bars:[...new Set(callouts.map(c=>c.text))],pieceLength:cm(length)};window.dispatchEvent(new CustomEvent('gg-section-update'));
}
'''
if helper_marker in text and 'function refreshSectionPresentation(){' not in text:
    text = text.replace(helper_marker, helpers + helper_marker, 1)

text = text.replace(
    "if(vertices.length){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));sectionContours=new T.LineSegments(g,new T.LineBasicMaterial({color:0x993b12,depthTest:false,clippingPlanes:s.planes.slice(2)}));sectionContours.renderOrder=10;scene.add(sectionContours);}\n}",
    "if(vertices.length){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));sectionContours=new T.LineSegments(g,new T.LineBasicMaterial({color:0xff7a32,depthTest:false,depthWrite:false,clippingPlanes:s.planes.slice(2)}));sectionContours.renderOrder=50;scene.add(sectionContours);}\n refreshSectionPresentation();\n}"
)

old_frame = r'''function frameSection(){
 const s=elementSection,f=s?.frame;if(!f)return;transition=null;
 const center=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,(f.lo[1]+f.hi[1])/2).addScaledVector(f.v,(f.lo[2]+f.hi[2])/2);
 const span=Math.max(f.hi[1]-f.lo[1],f.hi[2]-f.lo[2],.1),aspect=$('canvas').clientWidth/$('canvas').clientHeight;
 camera.up.copy(f.v);camera.position.copy(center).addScaledVector(f.n,Math.max(f.hi[0]-f.lo[0],span)*2+1);controls.target.copy(center);camera.userData.span=span*1.5/Math.min(aspect,1);camera.zoom=1;camera.near=.0001;camera.far=Math.max(box.getSize(new T.Vector3()).length()*10,100);resizeCamera(aspect);camera.updateProjectionMatrix();controls.update();
}'''
new_frame = r'''function frameSection(){
 const s=elementSection,f=s?.frame;if(!f)return;transition=null;
 const center=f.n.clone().multiplyScalar((f.lo[0]+f.hi[0])/2).addScaledVector(f.u,(f.lo[1]+f.hi[1])/2).addScaledVector(f.v,(f.lo[2]+f.hi[2])/2);
 const cross=Math.max(f.hi[1]-f.lo[1],f.hi[2]-f.lo[2],.1),length=Math.max(f.hi[0]-f.lo[0],cross),span=Math.max(length,cross),aspect=$('canvas').clientWidth/$('canvas').clientHeight;
 const view=f.n.clone().multiplyScalar(1.12).addScaledVector(f.u,.46).addScaledVector(f.v,.3).normalize();camera.up.copy(f.v);camera.position.copy(center).addScaledVector(view,span*2.05+1);controls.target.copy(center);camera.userData.span=span*1.28/Math.min(aspect,1);camera.zoom=1;camera.near=.0001;camera.far=Math.max(box.getSize(new T.Vector3()).length()*12,100);resizeCamera(aspect);camera.updateProjectionMatrix();controls.update();
}'''
text = text.replace(old_frame,new_frame)

text = text.replace(
    "const ids=new Set(info.sectionCandidates||info.linked.map(r=>r.id));if(isSteel(info.type))ids.add(info.id);",
    "const ids=new Set(info.sectionCandidates||info.linked.map(r=>r.id));ids.add(info.id);if(isSteel(info.type))ids.add(info.id);"
)
text = text.replace(
    "elementSection={ids,hostID:info.id,bounds:selectionBounds(),previous:viewState()};",
    "elementSection={ids,hostID:info.id,bounds:selectionBounds(),previous:viewState(),barData:info.reinforcementBars||[]};clearSectionPresentation();"
)
text = text.replace(
    "function closeElementSection(){const previous=elementSection?.previous;elementSection=null;$('elementSection').hidden=true;camera?.up.set(0,0,1);if(previous)restoreState(previous);else update();status('');}",
    "function closeElementSection(){const previous=elementSection?.previous;elementSection=null;clearSectionPresentation();$('elementSection').hidden=true;camera?.up.set(0,0,1);if(previous)restoreState(previous);else update();status('');}"
)

app_path.write_text(text, encoding='utf-8')

# Expose reliable per-bar diameter metadata so 3D callouts can point to the actual bar.
prop_path = Path('dist/properties.js')
prop = prop_path.read_text(encoding='utf-8')
prop = prop.replace('    const reinforcement=[];','    const reinforcement=[],reinforcementBars=[];')
old_loop = r'''    for(const bar of unresolvedSteel?[{id}]:linked.length?linked:namedBars.map(id=>({id}))){
      const b=line(bar.id),description=[name(b.Name),name(b.ObjectType),name(b.PredefinedType)].join(' ');
      for(const row of barRows(bar.id))grouped.get(role(description+' '+(row.roleText||''))).push(row);
    }'''
new_loop = r'''    for(const bar of unresolvedSteel?[{id}]:linked.length?linked:namedBars.map(id=>({id}))){
      const b=line(bar.id),description=[name(b.Name),name(b.ObjectType),name(b.PredefinedType)].join(' '),rowsForBar=barRows(bar.id),roles=new Set();
      for(const row of rowsForBar){const classified=role(description+' '+(row.roleText||''));roles.add(classified);grouped.get(classified).push(row);}
      reinforcementBars.push({id:bar.id,name:name(b.Name),role:[...roles].join(' / ')||role(description),diameters:[...new Set(rowsForBar.map(r=>r.value).filter(Boolean))]});
    }'''
prop = prop.replace(old_loop,new_loop)
prop = prop.replace(
    "return {id,name:name(element.Name)||'Elemento IFC',type,fields,reinforcement,linked,sectionCandidates:[...new Set([...linked.map(b=>b.id),...namedBars])],barAssociation,units,clickedID,unresolvedSteel};",
    "return {id,name:name(element.Name)||'Elemento IFC',type,fields,reinforcement,reinforcementBars,linked,sectionCandidates:[...new Set([...linked.map(b=>b.id),...namedBars])],barAssociation,units,clickedID,unresolvedSteel};"
)
prop_path.write_text(prop, encoding='utf-8')

# Screen-space dimension panel: readable even when the whole member is framed.
dim_path = Path('dist/dimensions-r9.js')
dim_path.write_text(r'''import './eng-r10.js';

const valuesHost=document.getElementById('dimensionValues');
const viewport=document.getElementById('viewport');
let cached=[];
function ensureOverlay(){let o=document.getElementById('bigDimensionOverlay');if(o||!viewport)return o;o=document.createElement('div');o.id='bigDimensionOverlay';o.setAttribute('aria-label','Cotas ampliadas do elemento');o.innerHTML='<small>COTAS DO ELEMENTO</small><div class="big-dimension-values"></div>';viewport.appendChild(o);return o;}
function readValues(){if(!valuesHost)return cached;const now=[...valuesHost.querySelectorAll('span')].map(el=>el.textContent?.trim()).filter(Boolean);if(now.length)cached=now;return cached;}
function sectionValues(){const s=window.GG_SECTION_INFO;if(!s)return [];return [`B: ${s.width}`,`H: ${s.height}`,`Peça: ${s.pieceLength}`,...(s.bars||[]).slice(0,6)];}
function render(){const o=ensureOverlay();if(!o)return;const section=document.body.classList.contains('section-active'),normal=document.body.classList.contains('dimensions-active');const vals=section?sectionValues():readValues();o.hidden=!(section||normal)||!vals.length;if(o.hidden)return;o.querySelector('small').textContent=section?'CORTE · PEÇA INTEIRA':'COTAS DO ELEMENTO';const h=o.querySelector('.big-dimension-values');h.replaceChildren(...vals.map(text=>{const s=document.createElement('span');s.textContent=text;return s;}));}
if(valuesHost)new MutationObserver(render).observe(valuesHost,{childList:true,subtree:true,characterData:true});new MutationObserver(render).observe(document.body,{attributes:true,attributeFilter:['class']});window.addEventListener('gg-section-update',render);window.addEventListener('resize',render);render();
''', encoding='utf-8')

# Load the lightweight visual polish layer.
index_path = Path('dist/index.html')
index = index_path.read_text(encoding='utf-8')
if 'ui-polish-r15.css' not in index:
    index = index.replace('<link rel="stylesheet" href="style.css">','<link rel="stylesheet" href="style.css"><link rel="stylesheet" href="ui-polish-r15.css">',1)
index_path.write_text(index, encoding='utf-8')

css_path = Path('dist/ui-polish-r15.css')
css_path.write_text(r''':root{--gg-ink:#18333d;--gg-muted:#667e87;--gg-line:#d8e4e8;--gg-panel:#fbfdfe;--gg-accent:#b7653e}html,body{background:#eef3f5}header{min-height:58px;border-bottom:1px solid #dbe5e8;background:rgba(255,255,255,.96);box-shadow:0 1px 0 rgba(13,42,51,.04)}header button{border-radius:10px}#sidebar{background:#f9fcfd;border-right:1px solid var(--gg-line);contain:layout paint;scrollbar-width:thin}#projectWorkspace{background:#edf2f4}#viewport{background:radial-gradient(circle at 50% 42%,#fff 0,#f4f8f9 52%,#e8eef1 100%);contain:layout paint}.view-controls,.toolbar{border:1px solid rgba(199,216,222,.9);background:rgba(255,255,255,.94);box-shadow:0 8px 22px rgba(20,50,60,.08);border-radius:14px}.view-controls button,.toolbar button{border-radius:9px;min-height:38px}#informationDock{background:transparent}.inspector{border:1px solid #d6e3e7;border-radius:16px;background:rgba(255,255,255,.98);box-shadow:0 14px 34px rgba(19,50,59,.1);overflow:hidden}.inspector-head{background:linear-gradient(180deg,#fff,#f7fafb);border-bottom:1px solid #e1e9ec}.element-actions{gap:7px}.element-actions button{border-radius:9px}.element-data{content-visibility:auto;contain-intrinsic-size:420px}.element-row{border-color:#e6edef}#elementSection{margin:10px 12px 12px;padding:14px;border:1px solid #cadde3;border-radius:14px;background:linear-gradient(145deg,#f7fbfc,#eef5f7);box-shadow:inset 0 1px 0 #fff}#elementSection>strong{display:block;margin-bottom:10px;color:#173e4a;font-size:14px}#elementSection label{display:grid;gap:5px;margin-top:9px;color:#526c76;font-size:12px}#elementSection select,#elementSection input{accent-color:var(--gg-accent)}#elementSection button{margin-top:10px;border-radius:9px}#bigDimensionOverlay{position:absolute;left:14px;bottom:72px;z-index:45;pointer-events:none;max-width:min(470px,calc(100% - 28px));padding:10px 12px;border:1px solid rgba(188,211,219,.9);border-radius:13px;background:rgba(9,31,39,.9);box-shadow:0 8px 24px rgba(7,26,33,.18);color:white;backdrop-filter:blur(5px)}#bigDimensionOverlay[hidden]{display:none!important}#bigDimensionOverlay small{display:block;margin-bottom:7px;color:#9ed7e6;font:700 10px/1.2 system-ui;letter-spacing:.1em}.big-dimension-values{display:flex;gap:6px;flex-wrap:wrap}.big-dimension-values span{display:inline-flex;align-items:center;min-height:28px;padding:5px 8px;border:1px solid rgba(255,255,255,.16);border-radius:8px;background:rgba(255,255,255,.08);font:700 12px/1.2 system-ui;color:#fff}body.section-active #viewport{background:radial-gradient(circle at 50% 45%,#fff 0,#f3f8fa 55%,#e4ecef 100%)}body.section-active .background-brand{opacity:.12}#canvas canvas{touch-action:none;outline:none}.navigation{background:rgba(255,255,255,.82);border-radius:8px;padding:5px 9px}.layer,.gg-layer-row{content-visibility:auto;contain-intrinsic-size:44px}@media(max-width:760px){header{min-height:52px}.view-controls,.toolbar{border-radius:12px}#bigDimensionOverlay{left:8px;bottom:58px;max-width:calc(100% - 16px);padding:8px}.big-dimension-values span{font-size:11px;min-height:26px}#elementSection{margin:8px;padding:12px}.inspector{border-radius:14px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important;animation-duration:.01ms!important;animation-iteration-count:1!important}}
''', encoding='utf-8')
