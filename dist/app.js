import { createInspector } from './properties.js';
const $=id=>document.getElementById(id);
const PUBLIC_VIEWER_ORIGIN='https://eng-gustavo-g.hatchable.site';
const urlParams=new URLSearchParams(location.search),sharedId=urlParams.get('share'),embedded=$('embeddedIFC'),sharedMode=Boolean(sharedId||embedded);
let readOnlyMode=Boolean(embedded),trustedReadOnlyLoad=false,sharePermission=embedded?'view':'edit';
let T,Orbit,api,scene,camera,renderer,controls,model,box,grid,busy=false,axis='z',sign=1,selected=null;let W,apiReady=false,currentModelID=null,inspector=null,currentFile=null,propertyWindow=null,selectionRevision=0,isolatedID=null,transition=null;const hiddenIDs=new Set();let elementInfo=null;const propertyCache=new Map();const categories=new Map();const ggDisciplineCache=new Map();let meshes=[];let ggRenderQueued=0,ggTransitionRAF=0;
const mobileLayout=()=>Boolean(window.matchMedia?.('(max-width:760px)').matches);
function setMobileInspectorExpanded(expanded){const panel=$('selection'),toggle=$('mobileInspectorToggle');if(!panel)return;panel.classList.toggle('mobile-expanded',Boolean(expanded));if(toggle){toggle.setAttribute('aria-expanded',String(Boolean(expanded)));toggle.textContent=expanded?'Menos':'Dados';}}
const status=(message)=>{$('status').textContent=message;$('status').hidden=!message};
const labels={IFCREINFORCINGBAR:'Armaduras · barras',IFCREINFORCINGMESH:'Armaduras · telas',IFCTENDON:'Tendões',IFCTENDONANCHOR:'Ancoragens',IFCBEAM:'Vigas',IFCCOLUMN:'Pilares',IFCSLAB:'Lajes',IFCWALL:'Paredes',IFCWALLSTANDARDCASE:'Paredes',IFCFOOTING:'Fundações',IFCPILE:'Estacas',IFCSTAIR:'Escadas',IFCDOOR:'Portas',IFCWINDOW:'Janelas',IFCROOF:'Coberturas',IFCBUILDINGELEMENTPROXY:'Outros elementos',IFCCOVERING:'Revestimentos',IFCMEMBER:'Membros estruturais',IFCPLATE:'Placas',IFCPIPESEGMENT:'Tubulações'};
function hideBrandIntro(){if($('brandIntro'))$('brandIntro').hidden=true;}
const editControls='#share,#file,.open,#uploadPDFs,#pdfFiles,#exportIFC,#exportHTML,#exportPNG,#shareZIP,#shareHTML,#saveHTML,#saveZIP,#pdfDownload,#printElement,[data-owner-control]';
function applyAccessUI(){
 document.body.classList.toggle('readonly',readOnlyMode);
 document.body.classList.toggle('owner-ready',!readOnlyMode);
 document.body.classList.remove('locked');
 for(const el of document.querySelectorAll(editControls)){
  const fileInput=el.matches?.('input[type=\"file\"]');
  if(readOnlyMode){el.hidden=true;el.disabled=true;}
  else if(fileInput){el.hidden=true;el.disabled=false;}
  else if(el.id!=='pdfDownload'){el.hidden=false;el.disabled=false;}
 }
 if($('ownerAccount'))$('ownerAccount').hidden=true;
 if($('ownerLogout'))$('ownerLogout').hidden=true;
}
function editableReady(){readOnlyMode=false;sharePermission='edit';applyAccessUI();hideBrandIntro();status('');}
function viewerReady(){readOnlyMode=true;sharePermission='view';applyAccessUI();hideBrandIntro();}
async function initAccess(){
 if(embedded){viewerReady();return;}
 if(sharedId){viewerReady();return;}
 editableReady();
}
if($('brandEnter'))$('brandEnter').onclick=hideBrandIntro;
applyAccessUI();
const isSteel=t=>/IFCREINFORCING|IFCTENDON/.test(t);
function ggRenderNow(){if(renderer&&!document.hidden)renderer.render(scene,camera)}
function ggScheduleRender(){if(!renderer||document.hidden||ggRenderQueued)return;ggRenderQueued=requestAnimationFrame(()=>{ggRenderQueued=0;ggRenderNow()})}
function ggRunTransition(){if(!renderer||!transition||ggTransitionRAF)return;const step=()=>{ggTransitionRAF=0;if(!renderer||!transition){ggScheduleRender();return}camera.position.lerp(transition.position,.2);controls.target.lerp(transition.target,.2);if(camera.position.distanceTo(transition.position)<Math.max(transition.distance*.001,.0001)){camera.position.copy(transition.position);controls.target.copy(transition.target);transition=null}controls.update();ggRenderNow();if(transition)ggTransitionRAF=requestAnimationFrame(step)};ggTransitionRAF=requestAnimationFrame(step)}
async function init(){if(renderer)return;status('Preparando o visualizador 3D…');[T,{OrbitControls:Orbit}]=await Promise.all([import('three'),import('three/addons/controls/OrbitControls.js')]);scene=new T.Scene();camera=new T.PerspectiveCamera(45,1,.01,100000);camera.up.set(0,0,1);renderer=new T.WebGLRenderer({antialias:false,alpha:true,preserveDrawingBuffer:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,mobileLayout()?1:1.25));renderer.localClippingEnabled=true;$('canvas').append(renderer.domElement);controls=new Orbit(camera,renderer.domElement);controls.enableDamping=false;controls.zoomSpeed=.8;controls.rotateSpeed=.7;controls.screenSpacePanning=true;controls.touches.ONE=T.TOUCH.ROTATE;controls.touches.TWO=T.TOUCH.DOLLY_PAN;controls.addEventListener("start",()=>{transition=null;if(ggTransitionRAF){cancelAnimationFrame(ggTransitionRAF);ggTransitionRAF=0}});controls.addEventListener("change",ggScheduleRender);renderer.domElement.tabIndex=0;scene.add(new T.HemisphereLight(0xffffff,0x8996a5,2));const light=new T.DirectionalLight(0xffffff,2.3);light.position.set(20,-30,50);scene.add(light);new ResizeObserver(()=>{const w=$('canvas').clientWidth,h=$('canvas').clientHeight;if(!w||!h)return;renderer.setSize(w,h,false);resizeCamera(w/h);camera.updateProjectionMatrix();ggScheduleRender()}).observe($('canvas'));let down;renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY]});renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const r=renderer.domElement.getBoundingClientRect(),ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);const hit=ray.intersectObjects(meshes,false).find(h=>h.object.isMesh&&h.object.userData.id!==undefined&&h.object.visible&&h.object.material.opacity>.02&&(!h.object.material.clippingPlanes.length||h.object.material.clippingPlanes.every(p=>p.distanceToPoint(h.point)>=0)));select(hit?.object)});renderer.domElement.addEventListener("dblclick",()=>{if(selected)focusSelected()});}
const ggWorldBoxCache=new WeakMap();
function ggWorldBox(mesh){let b=ggWorldBoxCache.get(mesh);if(!b){mesh.updateWorldMatrix(true,false);b=new T.Box3().setFromObject(mesh);ggWorldBoxCache.set(mesh,b);}return b;}
function ggAugmentRebarGeometry(info){
 if(!info||info.unresolvedSteel||!inspector||!T||!/IFCBEAM|IFCCOLUMN|IFCSLAB|IFCWALL|IFCFOOTING|IFCPILE|IFCMEMBER|IFCPLATE/.test(String(info.type||'')))return info;
 const hosts=meshes.filter(m=>m.userData.id===info.id);if(!hosts.length)return info;
 const hostBox=new T.Box3();for(const m of hosts)hostBox.union(ggWorldBox(m));if(hostBox.isEmpty())return info;
 const size=hostBox.getSize(new T.Vector3()),margin=Math.max(.008,Math.max(size.x,size.y,size.z)*.006);hostBox.expandByScalar(margin);
 const ids=new Set();
 for(const m of meshes){if(!isSteel(m.userData.type)||m.userData.id===info.id)continue;const bb=ggWorldBox(m);if(hostBox.intersectsBox(bb))ids.add(m.userData.id);}
 if(!ids.size)return info;
 const meta=new Map((info.reinforcementBars||[]).map(b=>[Number(b.id),b]));
 for(const id of ids){if(meta.has(Number(id)))continue;try{const b=inspector.read(Number(id),{withRelated:false,resolveHost:false}),r=(b?.reinforcementBars||[]).find(x=>Number(x.id)===Number(id));if(r)meta.set(Number(id),r);}catch(e){console.warn('Falha ao ler barra #'+id,e)}}
 info.sectionCandidates=[...ids];info.reinforcementBars=[...meta.values()];
 const linked=new Map((info.linked||[]).map(x=>[Number(x.id),x]));for(const id of ids)if(!linked.has(Number(id)))linked.set(Number(id),{id:Number(id),name:meshes.find(m=>m.userData.id===Number(id))?.userData?.name||''});info.linked=[...linked.values()];
 const grouped=new Map();for(const b of info.reinforcementBars){const label=String(b.role||'Sem classificação no IFC').split(' / ')[0]||'Sem classificação no IFC';if(!grouped.has(label))grouped.set(label,new Set());for(const d of b.diameters||[])grouped.get(label).add(d);}
 if(Array.isArray(info.reinforcement))info.reinforcement=info.reinforcement.map(([label,value,metaRow={}])=>{const vals=grouped.get(label);return vals?.size?[label,[...vals].join(' / '),{...metaRow,missing:false,note:'Barras associadas pela geometria do elemento e diâmetro declarado no IFC.'}]:[label,value,metaRow]});
 info.barAssociation='Barras associadas pela interseção geométrica com o elemento; diâmetros lidos diretamente do IFC.';return info;
}
async function select(mesh){
 if(mesh&&inspector&&isSteel(mesh.userData.type)){const host=inspector.hostFor(mesh.userData.id);if(host!==null)mesh=meshes.find(m=>m.userData.id===host)||mesh;}
  const revision=++selectionRevision;
  if(selected)for(const m of meshes)if(m.userData.id===selected.userData.id)m.material.emissive.setHex(0);
  if(dimensionData&&dimensionData.hostID!==mesh?.userData.id)clearDimensions();
  selected=mesh||null;elementInfo=null;$('selection').hidden=!mesh;if(mobileLayout())setMobileInspectorExpanded(false);
  if(!mesh){$('selectionStatus').textContent='Clique em um elemento para inspecionar';if(propertyWindow&&!propertyWindow.closed)propertyWindow.document.body.textContent='Nenhum elemento selecionado.';return;}
  for(const m of meshes)if(m.userData.id===mesh.userData.id)m.material.emissive.setHex(mobileLayout()?0x8a4c2d:0x635035);ggScheduleRender();
  $('elementName').textContent=mesh.userData.name||'Elemento IFC';$('elementType').textContent=(labels[mesh.userData.type]||mesh.userData.type)+' · #'+mesh.userData.id;
  $('selectionStatus').textContent='Selecionado: #'+mesh.userData.id;$('propertyBody').textContent='Lendo propriedades do IFC…';
  await new Promise(r=>setTimeout(r,25));if(revision!==selectionRevision)return;
  try{if(!propertyCache.has(mesh.userData.id))propertyCache.set(mesh.userData.id,inspector.read(mesh.userData.id));elementInfo=ggAugmentRebarGeometry(propertyCache.get(mesh.userData.id));$('elementName').textContent=elementInfo.name;$('elementType').textContent=(labels[elementInfo.type]||elementInfo.type)+' · #'+elementInfo.id;renderProperties();if(mobileLayout()&&revision===selectionRevision){requestAnimationFrame(()=>requestAnimationFrame(()=>{if(selected===mesh&&!elementSection)focusSelected()}));}}catch(e){$('propertyBody').textContent='Não foi possível ler as propriedades deste elemento.';console.error(e)}
}
function dispose(group){if(!group)return;const geometries=new Set();group.traverse(m=>{if(m.geometry&&!geometries.has(m.geometry)){geometries.add(m.geometry);m.geometry.dispose();}if(m.material){if(Array.isArray(m.material))m.material.forEach(x=>x.dispose());else m.material.dispose()}});scene?.remove(group)}
function fit(view='iso',targetBox=null,animate=true){
 if(!box)return;let chosen=targetBox;
 if(!chosen){chosen=new T.Box3();for(const m of meshes)if(m.visible)chosen.union(new T.Box3().setFromObject(m));if(chosen.isEmpty())chosen=box;}
 const c=chosen.getCenter(new T.Vector3()),size=chosen.getSize(new T.Vector3()),d=Math.max(size.x,size.y,size.z,.1);
 const v=view==='top'?new T.Vector3(0,-.00001,1):view==='front'?new T.Vector3(0,-1,0):view==='right'?new T.Vector3(1,0,0):new T.Vector3(1,-1,.8).normalize();
 const aspect=$('canvas').clientWidth/$('canvas').clientHeight,distance=d*1.65/Math.min(aspect,1),position=c.clone().addScaledVector(v,distance);
 camera.near=Math.max(d/10000,.00001);camera.far=Math.max(distance+d*200,box.getSize(new T.Vector3()).length()*200);controls.maxDistance=camera.far*.7;
 if(camera.isOrthographicCamera){camera.userData.span=d*1.5/Math.min(aspect,1);camera.zoom=1;resizeCamera(aspect);}camera.updateProjectionMatrix();
 if(animate){transition={position,target:c,distance};ggRunTransition()}else{transition=null;camera.position.copy(position);controls.target.copy(c);controls.update();ggScheduleRender()}
}
function update(options={}){if(dimensionGroup){dimensionGroup.visible=!elementSection&&!$('cut').checked&&meshes.some(m=>m.userData.id===dimensionData.hostID&&m.visible);}document.body.classList.toggle('section-active',!!elementSection);if(!model)return;if(!elementSection)camera.up.set(0,0,1);if(elementSection)prepareSection(options.sectionContours!==false);else if(sectionContours){dispose(sectionContours);sectionContours=null;}const opacity=1-Number($('opacity').value)/100;$('opacityValue').value=$('opacity').value+'%';$('cutValue').value=$('position').value+'%';const normal=new T.Vector3();normal[axis]=-sign;const coord=T.MathUtils.lerp(box.min[axis],box.max[axis],Number($('position').value)/100);const plane=new T.Plane(normal,sign*coord);for(const m of meshes){m.visible=categories.get(m.userData.type).visible&&!hiddenIDs.has(m.userData.id)&&(isolatedID===null||m.userData.id===isolatedID);const mat=m.material;mat.opacity=ggMaterialOpacity(m,isSteel(m.userData.type)?1:opacity);mat.transparent=mat.opacity<1;mat.depthWrite=mat.opacity>=1;mat.clippingPlanes=$('cut').checked?[plane]:[];if(elementSection){
 m.visible=elementSection.ids.has(m.userData.id);mat.opacity=1;mat.transparent=false;mat.depthWrite=true;
 mat.clippingPlanes=elementSection.planes||[];
 $('sectionValue').textContent=$('sectionPosition').value+'%';
 }const clipCount=mat.clippingPlanes?.length||0,newClipCount=(elementSection?elementSection.planes||[]:$('cut').checked?[plane]:[]).length,newTransparent=mat.opacity<1,newDepthWrite=mat.opacity>=1;if(mat.transparent!==newTransparent||mat.depthWrite!==newDepthWrite||clipCount!==newClipCount)mat.needsUpdate=true;mat.transparent=newTransparent;mat.depthWrite=newDepthWrite;for(const child of m.children){child.visible=$("edges").checked;child.material.clippingPlanes=mat.clippingPlanes}}if(grid)grid.visible=!elementSection&&$("showGrid").checked;const visible=new Set(meshes.filter(m=>m.visible).map(m=>m.userData.id)).size,total=new Set(meshes.map(m=>m.userData.id)).size;$('count').textContent=visible.toLocaleString('pt-BR')+' / '+total.toLocaleString('pt-BR')+' elementos visíveis';ggScheduleRender()}
function layerUI(){$('layers').replaceChildren();for(const [type,cat] of [...categories].sort((a,b)=>Number(isSteel(b[0]))-Number(isSteel(a[0]))||a[0].localeCompare(b[0]))){if(!((labels[type]||type)+' '+type).toLowerCase().includes($('layerSearch').value.toLowerCase()))continue;const label=document.createElement('label');label.className='layer';const check=document.createElement('input');check.type='checkbox';check.checked=cat.visible;check.onchange=()=>{cat.visible=check.checked;update()};const name=document.createElement('span');name.textContent=labels[type]||type.replace(/^IFC/,'');const count=document.createElement('b');count.textContent=cat.ids.size;label.append(check,name,count);$('layers').append(label)}}
async function load(file){if(readOnlyMode&&!trustedReadOnlyLoad){status('Este compartilhamento permite somente visualizar o modelo enviado.');return false}if(pdfUploading){status('Aguarde o envio dos PDFs antes de trocar o modelo.');return false}if(!file||busy)return false;if(!/\.ifc$/i.test(file.name)){status('Selecione um arquivo .ifc. Arquivos IFCZIP devem ser descompactados.');return}if(file.size>1024*1024*1024){status('O limite de abertura é 1 GB. Para modelos maiores, exporte por pavimento ou disciplina.');return false}busy=true;document.querySelectorAll('.open').forEach(b=>b.disabled=true);let id,newGroup;try{
 const header=await file.slice(0,4096).text();if(!header.includes('ISO-10303-21'))throw Error('O arquivo não contém um IFC STEP válido.');
 await init();
 if(file.size>100*1024*1024){
  status('Modelo grande: liberando memória antes de carregar…');clearDimensions();select(null);dispose(model);dispose(grid);model=null;grid=null;box=null;meshes=[];categories.clear();propertyCache.clear();ggDisciplineCache.clear();inspector=null;currentFile=null;elementSection=null;hiddenIDs.clear();isolatedID=null;clearHTMLExport();$('elementSection').hidden=true;
  if(currentModelID!==null){api.CloseModel(currentModelID);currentModelID=null;}
  $('welcome').hidden=false;$('filename').textContent='Carregando '+file.name;$('layers').replaceChildren();$('count').textContent='Preparando modelo grande';
  document.querySelectorAll('aside button,aside input,.toolbar button,.view-controls button,#share').forEach(x=>x.disabled=true);
  await new Promise(r=>setTimeout(r,40));
 }
 renderer.setPixelRatio(file.size>100*1024*1024?1:Math.min(devicePixelRatio,mobileLayout()?1:1.5));
 if(!apiReady){status('Carregando o leitor IFC…');W=await import('https://cdn.jsdelivr.net/npm/web-ifc@0.0.68/web-ifc-api.js');api=new W.IfcAPI();api.SetWasmPath('https://cdn.jsdelivr.net/npm/web-ifc@0.0.68/');await api.Init();apiReady=true}status('Lendo o modelo… Arquivos grandes podem levar alguns instantes.');await new Promise(r=>setTimeout(r,60));{const bytes=new Uint8Array(await file.arrayBuffer());id=api.OpenModel(bytes,{COORDINATE_TO_ORIGIN:true});}if(id<0)throw Error('Não foi possível interpretar este IFC.');newGroup=new T.Group();const geometryCache=new Map();api.StreamAllMeshes(id,flat=>{let line;try{line=api.GetLine(id,flat.expressID)}catch{}const type=String(api.GetNameFromTypeCode(line?.type||api.GetLineType(id,flat.expressID))||'IFCOTHER').toUpperCase();for(let j=0;j<flat.geometries.size();j++){const placed=flat.geometries.get(j);let g=geometryCache.get(placed.geometryExpressID);
 if(!g){const geometry=api.GetGeometry(id,placed.geometryExpressID);try{
 const vertices=api.GetVertexArray(geometry.GetVertexData(),geometry.GetVertexDataSize()).slice();
 const indices=api.GetIndexArray(geometry.GetIndexData(),geometry.GetIndexDataSize()).slice();
 g=new T.BufferGeometry();const interleaved=new T.InterleavedBuffer(vertices,6);
 g.setAttribute('position',new T.InterleavedBufferAttribute(interleaved,3,0));g.setAttribute('normal',new T.InterleavedBufferAttribute(interleaved,3,3));g.setIndex(new T.BufferAttribute(indices,1));geometryCache.set(placed.geometryExpressID,g);
 }finally{geometry.delete()}}
 const c=placed.color;const mat=new T.MeshStandardMaterial({color:isSteel(type)?0xe8753e:new T.Color(c.x,c.y,c.z),roughness:.75,metalness:isSteel(type)?.18:0,side:T.DoubleSide,clippingPlanes:[]});const m=new T.Mesh(g,mat);m.applyMatrix4(new T.Matrix4().fromArray(placed.flatTransformation));m.userData={id:flat.expressID,type,name:line?.Name?.value||''};newGroup.add(m)}});if(!newGroup.children.length)throw Error('Este IFC não contém geometria 3D compatível. Confira as opções de exportação.');select(null);if(currentModelID!==null)api.CloseModel(currentModelID);currentModelID=id;inspector=createInspector(api,W,id);currentFile=file;await prepareDocuments(file);clearDimensions();clearHTMLExport();elementSection=null;$('elementSection').hidden=true;propertyCache.clear();hiddenIDs.clear();isolatedID=null;dispose(model);dispose(grid);model=newGroup;newGroup=null;
// web-ifc emits Y-up geometry. Restore IFC Z-up before centering, views and clipping.
 model.rotation.x=Math.PI/2;scene.add(model);model.updateMatrixWorld(true);box=new T.Box3().setFromObject(model);const center=box.getCenter(new T.Vector3());model.position.sub(center);model.updateMatrixWorld(true);box.setFromObject(model);meshes=model.children;categories.clear();for(const m of meshes){const type=m.userData.type;if(!categories.has(type))categories.set(type,{visible:true,ids:new Set()});categories.get(type).ids.add(m.userData.id)}const sz=box.getSize(new T.Vector3());grid=new T.GridHelper(Math.max(sz.x,sz.y,1)*2,20,0xbdcbd2,0xdce4e8);grid.rotation.x=Math.PI/2;grid.position.z=box.min.z-.01;scene.add(grid);$('filename').textContent=file.name;$('shareLinkRow').hidden=true;$('shareLink').value='';$('shareStatus').textContent='';$('welcome').hidden=true;document.querySelectorAll('aside button, aside input,.toolbar button,.view-controls button,#share,#projectPDFs').forEach(x=>x.disabled=false);if(readOnlyMode)document.querySelectorAll('#share,#file,.open,[data-owner-control]').forEach(x=>{x.hidden=true;x.disabled=true});$('opacity').value=0;$('cut').checked=false;$('edges').checked=false;$('layerSearch').value='';layerUI();update();fit('iso',null,false);if(readOnlyMode)$('filename').textContent=file.name+' · somente visualização';status([...categories.keys()].some(isSteel)?'':'Modelo aberto. Nenhuma barra ou tela foi identificada como armadura IFC. Confira a exportação.');return true}catch(e){console.error(e);dispose(newGroup);status(/memory|allocation|out of bounds|array buffer/i.test(e.message||'')?'Não há memória disponível para este modelo. Tente em um computador com mais memória ou exporte por pavimento.':(e.message||'Falha ao abrir o modelo.')+' Verifique a conexão e tente novamente.');return false}finally{if(id!==undefined&&id>=0&&id!==currentModelID)api?.CloseModel(id);busy=false;document.querySelectorAll('.open').forEach(b=>b.disabled=false);if(readOnlyMode)document.querySelectorAll('#share,#file,.open,[data-owner-control]').forEach(x=>{x.hidden=true;x.disabled=true});$('file').value=''}}
document.querySelectorAll('.open').forEach(b=>b.onclick=()=>$('file').click());$('file').onchange=e=>load(e.target.files[0]);$('viewport').ondragover=e=>{e.preventDefault();$('viewport').classList.add('drag')};$('viewport').ondragleave=()=>$('viewport').classList.remove('drag');$('viewport').ondrop=e=>{e.preventDefault();$('viewport').classList.remove('drag');load(e.dataTransfer.files[0])};$('all').onclick=()=>{clearDimensions();elementSection=null;$('elementSection').hidden=true;hiddenIDs.clear();isolatedID=null;categories.forEach(c=>c.visible=true);layerUI();update();status('')};$('steel').onclick=()=>{clearDimensions();elementSection=null;$('elementSection').hidden=true;if(![...categories.keys()].some(isSteel)){status('Nenhuma armadura IFC identificada. Exporte as barras e telas no programa de origem.');return}hiddenIDs.clear();isolatedID=null;categories.forEach((c,t)=>c.visible=isSteel(t));layerUI();update();status('')};$('opacity').oninput=update;$('cut').onchange=update;$('position').oninput=update;document.querySelectorAll('[data-axis]').forEach(b=>b.onclick=()=>{axis=b.dataset.axis;document.querySelectorAll('[data-axis]').forEach(x=>x.classList.toggle('active',x===b));$('cut').checked=true;update()});$('flip').onclick=()=>{sign*=-1;update()};$('fit').onclick=()=>fit();$('reset').onclick=()=>{clearDimensions();elementSection=null;$('elementSection').hidden=true;hiddenIDs.clear();isolatedID=null;categories.forEach(c=>c.visible=true);$('opacity').value=0;$('cut').checked=false;select(null);$('edges').checked=false;$('layerSearch').value='';layerUI();update();fit('iso',null,false);status('')};

const inspectorStyles='.element-data{margin:0}.element-row{display:grid;grid-template-columns:44% 1fr;gap:12px;padding:12px 0;border-bottom:1px solid #e5ebee}.element-row dt{font-size:12px;color:#637780}.element-row dd{margin:0;font-size:14px;font-weight:600;overflow-wrap:anywhere}.element-row small{display:block;font-size:11px;font-weight:400;line-height:1.45;margin-top:5px;color:#72838b}.is-missing dd{font-weight:400;color:#829097}.is-conflict dd{color:#9a570c}.section-open{width:100%;margin-top:14px;padding:12px}.section-open:disabled{opacity:.5;cursor:default}';
function renderProperties(){
 const body=$('propertyBody');body.replaceChildren();if(!elementInfo){body.textContent='Dados não disponíveis.';return;}
 const summary=document.createElement('dl');summary.className='element-data';
 const sections=[['Elemento · dados do IFC',elementInfo.unresolvedSteel?[]:elementInfo.fields],['Diâmetros das armaduras',elementInfo.reinforcement||[]]];
 for(const [heading,fields] of sections){const title=document.createElement('h3');title.className='data-heading';title.textContent=heading;summary.append(title);if(!fields.length){const note=document.createElement('p');note.className='geometry-note';note.textContent='Elemento de concreto não vinculado no IFC. As dimensões e o fck da barra não são exibidos como dados do elemento.';summary.append(note)}
 for(const [label,text,meta={}] of fields){
  const row=document.createElement('div');row.className='element-row'+(meta.missing?' is-missing':'')+(meta.conflict?' is-conflict':'');
  const title=document.createElement('dt'),value=document.createElement('dd');title.textContent=label;value.textContent=text;
  if(meta.note&&!meta.missing){const detail=document.createElement('small');detail.textContent=meta.note;value.append(detail)}row.append(title,value);summary.append(row);
 }}body.append(summary);
 const cut=document.createElement('button');cut.textContent='Ver corte transversal';cut.className='section-open';cut.onclick=openElementSection;
 cut.disabled=!meshes.some(m=>m.userData.id===elementInfo.id);body.append(cut);
 const note=document.createElement('p');note.className='geometry-note';note.textContent=(elementInfo.reinforcementBars||[]).length?'Corte geométrico com armaduras associadas ao elemento.':'Corte geométrico disponível. Armaduras aparecem somente quando existirem e forem associadas ao elemento.';body.append(note);syncPropertyWindow();
}
let elementSection=null,sectionContours=null,sectionContextGroup=null,sectionAnnotationGroup=null;
function sectionFrame(hostID,mode='auto'){
 const points=[];let longest=-1,n=new T.Vector3(1,0,0);
 for(const m of meshes)if(m.userData.id===hostID){
  m.geometry.computeBoundingBox();const b=m.geometry.boundingBox,size=b.getSize(new T.Vector3());
  for(const axis of ['x','y','z'])if(size[axis]>longest){longest=size[axis];n.set(0,0,0);n[axis]=1;n.transformDirection(m.matrixWorld);}
  for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z])points.push(new T.Vector3(x,y,z).applyMatrix4(m.matrixWorld));
 }
 if(!points.length)return null;
 if(mode!=='auto'){n.set(0,0,0);n[mode]=1;}
 const up=Math.abs(n.z)>.95?new T.Vector3(0,1,0):new T.Vector3(0,0,1),u=new T.Vector3().crossVectors(up,n).normalize(),v=new T.Vector3().crossVectors(n,u).normalize();
 const axes=[n,u,v],lo=axes.map(a=>Math.min(...points.map(p=>p.dot(a)))),hi=axes.map(a=>Math.max(...points.map(p=>p.dot(a))));
 return {n,u,v,axes,lo,hi};
}
function prepareSection(buildContours=true){
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
}
function clearSectionAnnotations(){
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
 const c=document.createElement('canvas');c.width=384;c.height=72;const x=c.getContext('2d');x.fillStyle='rgba(8,28,36,.92)';x.beginPath();x.roundRect(2,2,380,68,10);x.fill();x.strokeStyle='rgba(255,255,255,.3)';x.lineWidth=2;x.stroke();x.fillStyle='#fff';x.font='700 28px Arial';x.textAlign='center';x.textBaseline='middle';x.fillText(text,192,37);
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
 for(const m of meshes)if(m.userData.id===s.hostID){
  m.updateWorldMatrix(true,false);const material=new T.MeshBasicMaterial({color:0x8fa7b2,side:T.DoubleSide,transparent:true,opacity:.12,depthWrite:false,depthTest:true,wireframe:false});
  const ghost=new T.Mesh(m.geometry,material);ghost.matrix.copy(m.matrixWorld);ghost.matrixAutoUpdate=false;ghost.renderOrder=2;sectionContextGroup.add(ghost);
 }
 scene.add(sectionContextGroup);
}
function refreshSectionPresentation(){
 const s=elementSection,f=s?.frame;if(!s||!f)return;if(!sectionContextGroup)rebuildSectionContext();clearSectionAnnotations();sectionAnnotationGroup=new T.Group();sectionAnnotationGroup.name='GG_SECTION_ANNOTATIONS';scene.add(sectionAnnotationGroup);
 const mid1=(f.lo[1]+f.hi[1])/2,mid2=(f.lo[2]+f.hi[2])/2,planeCenter=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,mid1).addScaledVector(f.v,mid2);
 const width=f.hi[1]-f.lo[1],height=f.hi[2]-f.lo[2],length=f.hi[0]-f.lo[0],cross=Math.max(width,height,.05),piece=Math.max(length,cross,.1),gap=Math.max(cross*.18,Math.min(piece*.01,cross*.22),.025),labelSize=Math.max(cross*.075,Math.min(piece*.008,cross*.14),.026);
 const hostType=String(meshes.find(m=>m.userData.id===s.hostID)?.userData.type||''),uVertical=Math.abs(f.u.z),vVertical=Math.abs(f.v.z);let uLabel='B',vLabel='H';
 if(/IFCBEAM|IFCMEMBER/.test(hostType)){if(uVertical>=vVertical){uLabel='H';vLabel='B';}}
 else if(/IFCCOLUMN|IFCPILE/.test(hostType)){if(width>height){uLabel='H';vLabel='B';}}
 else if(/IFCSLAB|IFCPLATE/.test(hostType)){if(uVertical>=vVertical){uLabel='Esp.';vLabel='Larg.';}else{uLabel='Larg.';vLabel='Esp.';}}
 const u1=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,f.lo[1]).addScaledVector(f.v,f.lo[2]-gap),u2=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,f.hi[1]).addScaledVector(f.v,f.lo[2]-gap);
 const v1=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,f.hi[1]+gap).addScaledVector(f.v,f.lo[2]),v2=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,f.hi[1]+gap).addScaledVector(f.v,f.hi[2]);
 const ue1=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,f.lo[1]).addScaledVector(f.v,f.lo[2]),ue2=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,f.hi[1]).addScaledVector(f.v,f.lo[2]),ve1=ue2.clone(),ve2=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,f.hi[1]).addScaledVector(f.v,f.hi[2]);
 const cm=v=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}).format(v*100)+' cm',along=Math.max(0,s.at-f.lo[0]),m=v=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v)+' m';
 sectionLine([ue1,u1,ue2,u2,ve1,v1,ve2,v2],0x7bc7d7);sectionDimension(u1,u2,f.v.clone().negate(),uLabel+' · '+cm(width),labelSize);sectionDimension(v1,v2,f.u,vLabel+' · '+cm(height),labelSize);
 const meta=new Map((s.barData||[]).map(b=>[Number(b.id),b])),callouts=[];
 for(const [id,b] of meta){if(!b?.diameters?.length)continue;const ms=meshes.filter(m=>m.userData.id===id);if(!ms.length)continue;let min=Infinity,max=-Infinity,bb=new T.Box3();for(const m of ms){const r=sectionRangeAlong(m,f.n);min=Math.min(min,r[0]);max=Math.max(max,r[1]);bb.union(new T.Box3().setFromObject(m));}const halfBand=Math.max(0,Number($('sectionThickness').value)||0)/2;if(s.at<min-halfBand-.01||s.at>max+halfBand+.01)continue;const p=bb.getCenter(new T.Vector3()),spanN=max-min;if(spanN>Math.max(halfBand*1.5,.05))p.addScaledVector(f.n,s.at-p.dot(f.n));callouts.push({id,p,text:'Ø '+b.diameters.join(' / '),role:b.role||''});
 }
 const uniqueCallouts=[];const seenCallouts=new Set();for(const c of callouts.sort((a,b)=>a.p.distanceToSquared(planeCenter)-b.p.distanceToSquared(planeCenter))){const key=c.text+'|'+c.role;if(seenCallouts.has(key))continue;seenCallouts.add(key);uniqueCallouts.push(c)}
 uniqueCallouts.slice(0,6).forEach((c,i)=>{let radial=c.p.clone().sub(planeCenter);radial.addScaledVector(f.n,-radial.dot(f.n));if(radial.lengthSq()<1e-8)radial=(i%2?f.u:f.v).clone();radial.normalize();const labelPos=c.p.clone().addScaledVector(radial,cross*(.24+(i%3)*.065)+Math.min(piece*.006,cross*.08)).addScaledVector(f.n,Math.min(piece*.004,cross*.05));const dir=c.p.clone().sub(labelPos),dist=dir.length();if(dist>.001){dir.normalize();const arrow=new T.ArrowHelper(dir,labelPos,dist,0xff8b42,Math.min(labelSize*.62,dist*.3),Math.min(labelSize*.3,dist*.14));arrow.userData.ggRebarCallout=true;arrow.line.material.depthTest=false;arrow.cone.material.depthTest=false;arrow.line.renderOrder=58;arrow.cone.renderOrder=58;sectionAnnotationGroup.add(arrow);}sectionSprite(c.text,labelPos,labelSize*.78);});
 window.GG_SECTION_INFO={width:cm(width),height:cm(height),widthLabel:uLabel,heightLabel:vLabel,position:Number($('sectionPosition').value),positionText:(Number($('sectionPosition').value)).toLocaleString('pt-BR')+'% · '+m(along),bars:[...new Set(uniqueCallouts.map(c=>c.text))],pieceLength:cm(length)};window.dispatchEvent(new CustomEvent('gg-section-update'));
}
function frameSection(){
 const s=elementSection,f=s?.frame;if(!f)return;transition=null;
 const center=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,(f.lo[1]+f.hi[1])/2).addScaledVector(f.v,(f.lo[2]+f.hi[2])/2);
 const sectionW=Math.max(f.hi[1]-f.lo[1],.05),sectionH=Math.max(f.hi[2]-f.lo[2],.05),cross=Math.max(sectionW,sectionH,.1),length=Math.max(f.hi[0]-f.lo[0],cross),aspect=Math.max($('canvas').clientWidth/$('canvas').clientHeight,.35),sectionSpan=Math.max(sectionH*1.85,sectionW/aspect*1.85,cross*1.55,mobileLayout()?.42:.32);
 const view=f.n.clone().multiplyScalar(1).addScaledVector(f.u,.07).addScaledVector(f.v,.04).normalize();camera.up.copy(f.v);camera.position.copy(center).addScaledVector(view,Math.max(sectionSpan*3.2,1.1));controls.target.copy(center);camera.userData.span=sectionSpan;camera.zoom=1;camera.near=.0001;camera.far=Math.max(box.getSize(new T.Vector3()).length()*12,100);resizeCamera(aspect);camera.updateProjectionMatrix();controls.update();ggScheduleRender();
}
function openElementSection(){
 if(!selected||!elementInfo)return;if(mobileLayout())setMobileInspectorExpanded(true);
 const info=elementInfo;
 clearDimensions();
 if(elementSection)closeElementSection();
 const ids=new Set(info.sectionCandidates||info.linked.map(r=>r.id));ids.add(info.id);if(isSteel(info.type))ids.add(info.id);
 if(!meshes.some(m=>ids.has(m.userData.id))){status('Não há geometria de armadura identificada para este elemento.');return;}
 elementSection={ids,hostID:info.id,bounds:selectionBounds(),previous:viewState(),barData:info.reinforcementBars||[]};clearSectionPresentation();
 $('elementSection').hidden=false;$('sectionPosition').value=50;$('sectionAxis').value='auto';$('sectionThickness').value='0.2';
 changeProjection(true);update();frameSection();status(info.barAssociation||'Corte transversal da armadura. Ajuste a posição ao longo do elemento.');
}
function closeElementSection(){const previous=elementSection?.previous;elementSection=null;clearSectionPresentation();$('elementSection').hidden=true;camera?.up.set(0,0,1);if(previous)restoreState(previous);else update();status('');}
$('closeSection').onclick=closeElementSection;
let sectionFrameRequest=0,sectionContourTimer=0;
$('sectionPosition').oninput=()=>{cancelAnimationFrame(sectionFrameRequest);sectionFrameRequest=requestAnimationFrame(()=>{if(elementSection){update({sectionContours:false});frameSection();clearTimeout(sectionContourTimer);sectionContourTimer=setTimeout(()=>{if(elementSection){prepareSection(true);ggScheduleRender()}},140)}})};
$('sectionAxis').onchange=$('sectionThickness').onchange=()=>{if(elementSection){update();frameSection()}};
function syncPropertyWindow(){if(!propertyWindow||propertyWindow.closed)return;const d=propertyWindow.document;d.title='Propriedades · Eng Gustavo Gil';d.body.replaceChildren();const style=d.createElement('style');style.textContent='body{font:14px Arial;color:#263d48;background:#f6f9fb;padding:24px;line-height:1.5}h1{font-size:23px}h2{font-size:18px}.property-summary{display:grid;grid-template-columns:1fr 1fr;gap:10px}.metric{background:white;padding:14px;border:1px solid #dbe5ea;border-radius:8px}.metric span,.metric small{display:block;color:#718994}.metric strong{display:block;font-size:17px;margin:6px 0}.metric small{font-size:11px}table{width:100%;border-collapse:collapse;background:white}th,td{padding:10px;text-align:left;border-bottom:1px solid #e5ebef;overflow-wrap:anywhere}th{width:45%;font-weight:400;color:#647e8b}details{margin-top:18px}summary{font-weight:bold;cursor:pointer}.geometry-note{color:#708692;font-size:12px}';d.head.querySelectorAll('style').forEach(s=>s.remove());style.textContent+=inspectorStyles;d.head.append(style);const brand=d.createElement('p');brand.textContent='ENG GUSTAVO GIL · PROPRIEDADES IFC';const title=d.createElement('h1');title.textContent=$('elementName').textContent;const type=d.createElement('p');type.textContent=$('elementType').textContent;d.body.append(brand,title,type,d.importNode($('propertyBody'),true));d.querySelector('.section-open').onclick=()=>{openElementSection();window.focus()};}
let dimensionGroup=null,dimensionData=null;
function clearDimensions(){
 if(dimensionGroup){dimensionGroup.traverse(o=>o.material?.map?.dispose());dispose(dimensionGroup);}
 dimensionGroup=null;dimensionData=null;$('dimensionPanel').hidden=true;document.body.classList.remove('dimensions-active');
}
function measureElement(hostID){
 const targets=meshes.filter(m=>m.userData.id===hostID);if(!targets.length)return null;
 let reference=targets[0],largest=-1;
 for(const m of targets){m.geometry.computeBoundingBox();const size=m.geometry.boundingBox.getSize(new T.Vector3()).multiply(m.getWorldScale(new T.Vector3()));const score=size.lengthSq();if(score>largest){largest=score;reference=m;}}
 const origin=reference.getWorldPosition(new T.Vector3()),basis=[new T.Vector3(1,0,0),new T.Vector3(0,1,0),new T.Vector3(0,0,1)].map(v=>v.transformDirection(reference.matrixWorld));
 if(basis.some((v,i)=>basis.some((w,j)=>i!==j&&Math.abs(v.dot(w))>1e-5)))throw Error('Esta geometria tem eixos deformados. Não foi possível criar cotas locais confiáveis.');
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity],point=new T.Vector3();
 for(const m of targets){const a=m.geometry.getAttribute('position');for(let i=0;i<a.count;i++){point.fromBufferAttribute(a,i).applyMatrix4(m.matrixWorld).sub(origin);for(let j=0;j<3;j++){const d=point.dot(basis[j]);lo[j]=Math.min(lo[j],d);hi[j]=Math.max(hi[j],d);}}}
 const values=hi.map((max,i)=>max-lo[i]);if(values.some(v=>!Number.isFinite(v)))return null;
 return {hostID,origin,basis,lo,hi,values};
}
function dimensionPoint(data,coords){return data.origin.clone().addScaledVector(data.basis[0],coords[0]).addScaledVector(data.basis[1],coords[1]).addScaledVector(data.basis[2],coords[2]);}
const measureText=value=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:2}).format(value*100)+' cm';
function dimensionLabels(data){
 const type=String(meshes.find(m=>m.userData.id===data.hostID)?.userData.type||''),idx=[0,1,2],labels=['A','B','C'];
 const longest=idx.reduce((a,b)=>data.values[b]>data.values[a]?b:a,0),vertical=idx.reduce((a,b)=>Math.abs(data.basis[b].z)>Math.abs(data.basis[a].z)?b:a,0);
 if(/IFCBEAM|IFCMEMBER/.test(type)){
  labels[longest]='L';const rest=idx.filter(i=>i!==longest),h=rest.reduce((a,b)=>Math.abs(data.basis[b].z)>Math.abs(data.basis[a].z)?b:a,rest[0]);labels[h]='H';labels[rest.find(i=>i!==h)]='B';
 }else if(/IFCCOLUMN|IFCPILE/.test(type)){
  labels[longest]='L';const rest=idx.filter(i=>i!==longest).sort((a,b)=>data.values[a]-data.values[b]);labels[rest[0]]='B';labels[rest[1]]='H';
 }else if(/IFCSLAB|IFCPLATE/.test(type)){
  const minValue=Math.min(...data.values),near=idx.filter(i=>data.values[i]<=minValue*1.05+.002),thick=near.reduce((a,b)=>Math.abs(data.basis[b].z)>Math.abs(data.basis[a].z)?b:a,near[0]),rest=idx.filter(i=>i!==thick).sort((a,b)=>data.values[b]-data.values[a]);labels[thick]='Esp.';labels[rest[0]]='L';labels[rest[1]]='B';
 }else if(/IFCWALL/.test(type)){
  const thick=idx.reduce((a,b)=>data.values[b]<data.values[a]?b:a,0),rest=idx.filter(i=>i!==thick),h=rest.reduce((a,b)=>Math.abs(data.basis[b].z)>Math.abs(data.basis[a].z)?b:a,rest[0]);labels[thick]='Esp.';labels[h]='H';labels[rest.find(i=>i!==h)]='L';
 }
 return labels;
}
function dimensionLabel(text,position,size){
 const canvas=document.createElement('canvas');canvas.width=768;canvas.height=128;const ctx=canvas.getContext('2d');ctx.fillStyle='rgba(255,255,255,.97)';ctx.fillRect(0,0,768,128);ctx.strokeStyle='rgba(30,91,112,.22)';ctx.lineWidth=3;ctx.strokeRect(2,2,764,124);ctx.font=(mobileLayout()?'700 58px Arial':'700 52px Arial');ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#0f536d';ctx.fillText(text,384,64);
 const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:false,depthWrite:false}));sprite.position.copy(position);sprite.scale.set(size*6,size,1);sprite.renderOrder=30;dimensionGroup.add(sprite);
}
function buildDimensions(hostID){
 clearDimensions();const data=measureElement(hostID);if(!data)return;data.labels=dimensionLabels(data);dimensionData=data;dimensionGroup=new T.Group();scene.add(dimensionGroup);
 const max=Math.max(...data.values,.1);
 for(let i=0;i<3;i++){
  const others=[0,1,2].filter(k=>k!==i),j=others.slice().sort((a,b)=>data.values[a]-data.values[b])[0],localScale=Math.max(Math.min(...others.map(k=>data.values[k])),.05),offset=Math.max(localScale*(mobileLayout()?.32:.24),max*(mobileLayout()?.025:.018),mobileLayout()?.04:.03),labelHeight=Math.max(localScale*(mobileLayout()?.24:.18),max*(mobileLayout()?.024:.016),mobileLayout()?.05:.035);
  const start=[...data.lo],end=[...data.lo];start[j]-=offset;end[j]-=offset;end[i]=data.hi[i];
  const a=dimensionPoint(data,start),b=dimensionPoint(data,end),refA=[...start],refB=[...end];refA[j]=refB[j]=data.lo[j];
  const positions=[...a.toArray(),...b.toArray(),...dimensionPoint(data,refA).toArray(),...a.toArray(),...dimensionPoint(data,refB).toArray(),...b.toArray()];
  const tick=data.basis[j].clone().multiplyScalar(Math.max(offset*.11,.004));for(const endpoint of [a,b])positions.push(...endpoint.clone().sub(tick).toArray(),...endpoint.clone().add(tick).toArray());
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));const line=new T.LineSegments(g,new T.LineBasicMaterial({color:0x24748d,depthTest:false,depthWrite:false,transparent:true,opacity:.95}));line.renderOrder=20;dimensionGroup.add(line);
  dimensionLabel((data.labels[i]||String.fromCharCode(65+i))+' · '+measureText(data.values[i]),a.clone().add(b).multiplyScalar(.5).addScaledVector(data.basis[j],-labelHeight*.72),labelHeight);
 }
 $('dimensionValues').replaceChildren();for(let i=0;i<3;i++){const value=document.createElement('span');value.textContent=(data.labels[i]||String.fromCharCode(65+i))+': '+measureText(data.values[i]);$('dimensionValues').append(value)}
 $('dimensionPanel').hidden=false;document.body.classList.add('dimensions-active');
}
function isolateAndDimension(){
 if(!selected||!elementInfo)return;const info=elementInfo;if(mobileLayout())setMobileInspectorExpanded(false);
 if(info.unresolvedSteel){status('Selecione o elemento de concreto para cotar suas dimensões.');return;}
 if(elementSection)closeElementSection();
 try{isolatedID=info.id;hiddenIDs.clear();categories.forEach(c=>c.visible=true);$('cut').checked=false;$('opacity').value=0;changeProjection(true);layerUI();update();buildDimensions(info.id);dimensionView('iso');status('Cotas medidas na geometria. As propriedades declaradas no IFC permanecem separadas.');}catch(e){clearDimensions();status(e.message)}
}
function dimensionView(view){
 const data=dimensionData;if(!data)return;const chosen=new T.Box3();for(const m of meshes)if(m.userData.id===data.hostID)chosen.union(new T.Box3().setFromObject(m));chosen.expandByScalar(Math.max(...data.values)*.2);
 if(view==='iso'){camera.up.set(0,0,1);fit('iso',chosen,false);return;}
 transition=null;const i=Number(view),normal=data.basis[i],up=data.basis[(i+2)%3],target=dimensionPoint(data,data.hi.map((v,i)=>(v+data.lo[i])/2)),size=Math.max(...data.values,.1),aspect=$('canvas').clientWidth/$('canvas').clientHeight;
 camera.up.copy(up);camera.position.copy(target).addScaledVector(normal,size*3);controls.target.copy(target);camera.userData.span=(Math.max(data.values[(i+2)%3],data.values[(i+1)%3]/aspect)+size*.65)*1.15;camera.zoom=1;resizeCamera(aspect);camera.updateProjectionMatrix();controls.update();
}
$('hideDimensions').onclick=()=>{clearDimensions();camera?.up.set(0,0,1)};
document.querySelectorAll('[data-dimension-view]').forEach(b=>b.onclick=()=>dimensionView(b.dataset.dimensionView));
$('printElement').onclick=()=>{
 if(!dimensionData||!elementInfo)return;
 const popup=window.open('','ifc-element-sheet','popup,width=1000,height=820');if(!popup){status('Permita a abertura da ficha no navegador para imprimir ou salvar em PDF.');return;}
 const d=popup.document;d.head.replaceChildren();d.body.replaceChildren();d.title='Ficha · '+elementInfo.name;
 const style=d.createElement('style');style.textContent='body{font:14px Arial;color:#233c46;max-width:1000px;margin:30px auto;padding:20px}h1{font-size:24px}h2{font-size:17px;margin-top:24px}img{width:100%;max-height:520px;object-fit:contain;background:#eff4f6}table{width:100%;border-collapse:collapse}td{padding:8px;border-bottom:1px solid #ddd}small,p{line-height:1.5}button{padding:12px}@media print{button{display:none}body{margin:0;padding:0}tr{break-inside:avoid}}';d.head.append(style);
 const title=d.createElement('h1');title.textContent='Ficha do elemento · '+elementInfo.name;d.body.append(title);
 const source=d.createElement('p');source.textContent='Arquivo: '+currentFile.name+' · '+elementInfo.type+' · #'+elementInfo.id+' · Arquivo modificado em: '+new Date(currentFile.lastModified).toLocaleString('pt-BR')+' (metadado do arquivo; não identifica revisão aprovada)';d.body.append(source);
 renderer.render(scene,camera);const img=d.createElement('img');img.alt='Vista cotada do elemento';img.src=renderer.domElement.toDataURL('image/png');d.body.append(img);
 const section=(heading,rows)=>{const h=d.createElement('h2');h.textContent=heading;d.body.append(h);const table=d.createElement('table');for(const [label,value,meta] of rows){const tr=d.createElement('tr'),a=d.createElement('td'),b=d.createElement('td');a.textContent=label;b.textContent=value+(meta?.note?' — '+meta.note:'');tr.append(a,b);table.append(tr)}d.body.append(table)};
 section('Medido no modelo — extensões totais nos eixos locais',dimensionData.values.map((v,i)=>[dimensionData.labels?.[i]||('Eixo '+String.fromCharCode(65+i)),measureText(v)]));section('Dados do IFC — propriedades e valores interpretados',elementInfo.fields);section('Armaduras — dados e identificação no IFC',elementInfo.reinforcement||[]);
 const note=d.createElement('p');note.textContent='As cotas representam as extensões totais da geometria selecionada, sem descontar aberturas. Não equivalem automaticamente a vão livre, seção constante, cobrimento ou detalhamento executivo. Desenvolvido pelo Eng. Gustavo Gil.';d.body.append(note);
 const print=d.createElement('button');print.textContent='Imprimir / Salvar como PDF';print.onclick=()=>popup.print();d.body.prepend(print);popup.focus();
};
function selectionBounds(){const bounds=new T.Box3();if(selected)for(const m of meshes)if(m.userData.id===(elementInfo?.id??selected.userData.id))bounds.union(new T.Box3().setFromObject(m));return bounds}
function focusSelected(){if(selected)fit('iso',selectionBounds())}
function resizeCamera(aspect){if(camera.isPerspectiveCamera)camera.aspect=aspect;else{const span=camera.userData.span||10;camera.left=-span*aspect/2;camera.right=span*aspect/2;camera.top=span/2;camera.bottom=-span/2;}}
function changeProjection(orthographic){
 if(!camera||Boolean(camera.isOrthographicCamera)===orthographic)return;
 const old=camera,aspect=$('canvas').clientWidth/$('canvas').clientHeight;
 camera=orthographic?new T.OrthographicCamera(-1,1,1,-1,old.near,old.far):new T.PerspectiveCamera(45,aspect,old.near,old.far);
 camera.position.copy(old.position);camera.quaternion.copy(old.quaternion);camera.up.copy(old.up);camera.userData.span=2*old.position.distanceTo(controls.target)*Math.tan(Math.PI/8);resizeCamera(aspect);camera.updateProjectionMatrix();controls.object=camera;controls.update();$('projection').classList.toggle('active',orthographic);$('projection').setAttribute('aria-pressed',String(orthographic));$('viewName').textContent=orthographic?'PROJEÇÃO ORTOGONAL':'PERSPECTIVA 3D';
}
function navigationMode(pan){if(!controls)return;controls.mouseButtons.LEFT=pan?T.MOUSE.PAN:T.MOUSE.ROTATE;controls.touches.ONE=pan?T.TOUCH.PAN:T.TOUCH.ROTATE;for(const id of ['pan','orbit']){const active=(id==='pan')===pan;$(id).classList.toggle('active',active);$(id).setAttribute('aria-pressed',String(active))}$('canvas').style.cursor=pan?'move':'grab'}
function zoom(factor){if(!camera)return;transition=null;if(camera.isOrthographicCamera){camera.zoom=T.MathUtils.clamp(camera.zoom/factor,.05,1000);camera.updateProjectionMatrix()}else{camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target)}controls.update()}
if($('mobileInspectorToggle'))$('mobileInspectorToggle').onclick=()=>setMobileInspectorExpanded(!$('selection').classList.contains('mobile-expanded'));$('closeProperties').onclick=()=>{if(elementSection)closeElementSection();setMobileInspectorExpanded(false);select(null)};$('focusElement').onclick=focusSelected;$('isolateElement').onclick=isolateAndDimension;$('hideElement').onclick=()=>{if(selected){hiddenIDs.add(selected.userData.id);select(null);update()}};
$('popout').onclick=()=>{propertyWindow=window.open('','ifc-element-properties','popup,width=520,height=760');if(!propertyWindow){status('O navegador bloqueou a nova janela. Permita pop-ups ou use o painel de propriedades.');return}propertyWindow.document.body.textContent='Carregando propriedades…';if(elementInfo)syncPropertyWindow();propertyWindow.focus()};
function ggElementText(m){
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
$('layerSearch').oninput=layerUI;$('sidebarToggle').onclick=()=>{document.body.classList.toggle('sidebar-hidden');$('sidebarToggle').setAttribute('aria-expanded',String(!document.body.classList.contains('sidebar-hidden')))};$('sidebarToggle').onclick=()=>{document.body.classList.toggle('sidebar-hidden');$('sidebarToggle').setAttribute('aria-expanded',String(!document.body.classList.contains('sidebar-hidden')))};$('sidebarToggle').onclick=()=>{document.body.classList.toggle('sidebar-hidden');$('sidebarToggle').setAttribute('aria-expanded',String(!document.body.classList.contains('sidebar-hidden')))};$('sidebarToggle').onclick=()=>{document.body.classList.toggle('sidebar-hidden');$('sidebarToggle').setAttribute('aria-expanded',String(!document.body.classList.contains('sidebar-hidden')))};
if(window.matchMedia?.('(max-width:760px)').matches){document.body.classList.add('sidebar-hidden');$('sidebarToggle').setAttribute('aria-expanded','false');}
$('showGrid').onchange=update;$('edges').onchange=()=>{if($('edges').checked){for(const m of meshes){if(m.children.length)continue;const edge=new T.LineSegments(new T.EdgesGeometry(m.geometry,35),new T.LineBasicMaterial({color:0x354e60,transparent:true,opacity:.3,clippingPlanes:[]}));m.add(edge)}}update()};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>fit(b.dataset.view));$('projection').onclick=()=>changeProjection(!camera.isOrthographicCamera);$('orbit').onclick=()=>navigationMode(false);$('pan').onclick=()=>navigationMode(true);$('zoomIn').onclick=()=>zoom(.8);$('zoomOut').onclick=()=>zoom(1.25);
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else if($('projectWorkspace').requestFullscreen)await $('projectWorkspace').requestFullscreen();else{document.body.classList.toggle('sidebar-hidden');status('Modo ampliado ativado. Este navegador não oferece tela cheia para esta página.')}}catch{status('Tela cheia não está disponível neste navegador.')}};
document.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||$('shareDialog').open||$('pdfDialog').open)return;if(e.key==='Escape'){select(null);return}if(!model)return;if(e.key.toLowerCase()==='f'){e.preventDefault();selected?focusSelected():fit()}if(e.key.toLowerCase()==='g')navigationMode(false);if(e.key.toLowerCase()==='m')navigationMode(true)});
function setShareProgress(percent,text=''){const wrap=$('shareProgress'),bar=$('shareProgressBar'),label=$('shareProgressText');if(!wrap||!bar||!label)return;const value=Math.max(0,Math.min(100,Number(percent)||0));wrap.hidden=false;bar.style.width=value+'%';label.textContent=text||Math.round(value)+'%';}
function resetShareProgress(){if($('shareProgress'))$('shareProgress').hidden=true;if($('shareProgressBar'))$('shareProgressBar').style.width='0%';if($('shareProgressText'))$('shareProgressText').textContent='Preparando…';}
$('share').onclick=async()=>{if(readOnlyMode)return;$('shareDialog').showModal();resetShareProgress();$('shareLinkRow').hidden=true;$('shareStatus').textContent='Verificando compartilhamento…';try{const r=await fetch('/api/share?health=1',{cache:'no-store'});const body=await r.json().catch(()=>({}));if(!r.ok||!body.ok)throw Error(body.detail||body.error||'Serviço indisponível');$('shareStatus').textContent='Pronto para criar o link.';}catch(error){$('shareStatus').textContent='Compartilhamento indisponível: '+(error.message||'erro desconhecido');}};$('closeShare').onclick=()=>$('shareDialog').close();

function apiError(response, fallback='Não foi possível concluir o compartilhamento.'){
 if(response.ok)return null;
 return response.json().then(body=>Error(body?.error||fallback)).catch(()=>Error(fallback));
}
async function shareFetch(url,options={},attempts=4){
 let lastError;
 for(let attempt=1;attempt<=attempts;attempt++){
  try{
   const response=await fetch(url,options);
   if(response.ok||response.status<500)return response;
   lastError=Error('Servidor temporariamente indisponível.');
  }catch(error){lastError=error}
  if(attempt<attempts)await new Promise(resolve=>setTimeout(resolve,500*attempt));
 }
 throw lastError||Error('Falha de conexão com o compartilhamento.');
}
async function createShareLink(){
 if(readOnlyMode){$('shareStatus').textContent='Este link foi compartilhado como somente visualização.';return;}
 if(!currentFile){$('shareStatus').textContent='Abra um IFC antes de criar um link.';return;}
 const button=$('createShare'),strong=button.querySelector('strong');button.disabled=true;button.classList.add('is-uploading');$('shareLinkRow').hidden=true;resetShareProgress();setShareProgress(0,'Preparando o envio…');$('shareStatus').textContent='';
 try{
  const health=await shareFetch('/api/share?health=1',{cache:'no-store'},2),healthBody=await health.json().catch(()=>({}));if(!health.ok||!healthBody.ok)throw Error(healthBody.detail||healthBody.error||'O armazenamento do compartilhamento não está disponível.');
  const shareId=crypto.randomUUID().replaceAll('-',''),chunkSize=4*1024*1024,total=Math.ceil(currentFile.size/chunkSize);
  if(!total||currentFile.size>1024*1024*1024)throw Error('Este modelo excede o limite de 1 GB para links compartilháveis.');
  for(let part=0;part<total;part++){
   const pct=Math.floor((part/total)*92);setShareProgress(pct,`Enviando IFC · parte ${part+1} de ${total}`);if(strong)strong.textContent=`🔗 Criando link… ${pct}%`;
   const response=await shareFetch(`/api/share?id=${shareId}`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream','X-Share-Action':'upload','X-Share-Part':String(part),'X-Share-Total':String(total)},body:currentFile.slice(part*chunkSize,Math.min(currentFile.size,(part+1)*chunkSize))});
   const error=await apiError(response,'Falha ao enviar uma parte do IFC.');if(error)throw error;
  }
  setShareProgress(95,'Finalizando o link…');if(strong)strong.textContent='🔗 Finalizando link…';
  const response=await shareFetch(`/api/share?id=${shareId}`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'finalize',total,size:currentFile.size,name:currentFile.name,state:viewState(),permission:'view'})});
  const error=await apiError(response,'Falha ao finalizar o compartilhamento.');if(error)throw error;
  const result=await response.json(),shareUrl=`${PUBLIC_VIEWER_ORIGIN}/projeto/${shareId}`;
  $('shareLink').value=shareUrl;$('shareLinkRow').hidden=false;setShareProgress(100,'Link criado com sucesso.');$('shareStatus').textContent='Link criado. Use Copiar para enviar.';
  try{await navigator.clipboard.writeText(shareUrl);$('shareStatus').textContent='Link criado e copiado para a área de transferência.'}catch{}
 }catch(error){setShareProgress(0,'Falha ao criar o link.');$('shareStatus').textContent=error.message||'Não foi possível criar o link.'}
 finally{button.disabled=false;button.classList.remove('is-uploading');if(strong)strong.textContent='🔗 Criar link';}
}
async function openSharedModel(shareId){
 if(!/^[a-f0-9]{32}$/.test(shareId))return;
 $('welcome').hidden=false;status('Carregando modelo compartilhado…');
 try{
  const metaResponse=await fetch(`/api/share?id=${shareId}`),metaError=await apiError(metaResponse,'Modelo compartilhado não encontrado.');if(metaError)throw metaError;
  const meta=await metaResponse.json();if(!Number.isInteger(meta.total)||meta.total<1||meta.total>256)throw Error('O link contém dados incompletos.');
  sharePermission=meta.permission==='edit'?'edit':'view';readOnlyMode=sharePermission!=='edit';applyAccessUI();
  const parts=[];
  for(let part=0;part<meta.total;part++){
   status(`Baixando modelo compartilhado… ${part+1} de ${meta.total}`);
   const response=await fetch(`/api/share?id=${shareId}&part=${part}`),error=await apiError(response,'Falha ao baixar uma parte do modelo.');if(error)throw error;
   parts.push(await response.arrayBuffer());
  }
  const fileName=meta.name||`modelo-${shareId}.ifc`,file=new File(parts,fileName,{type:'application/x-step'});
  trustedReadOnlyLoad=readOnlyMode;try{if(!await load(file))return;}finally{trustedReadOnlyLoad=false}restoreDocuments(meta.state?.pdfs);restoreState(meta.state);$('filename').textContent=readOnlyMode?`${fileName} · somente visualização`:`${fileName} · compartilhado · edição permitida`;if($('brandIntroHint'))$('brandIntroHint').hidden=true;hideBrandIntro();status('');
 }catch(error){status(error.message||'Não foi possível abrir o modelo compartilhado.');$('welcome').hidden=false}
}
$('createShare').onclick=createShareLink;$('copyShareLink').onclick=async()=>{const value=$('shareLink').value;if(!value)return;try{await navigator.clipboard.writeText(value);$('shareStatus').textContent='Link copiado.'}catch{$('shareLink').focus();$('shareLink').select();$('shareStatus').textContent='Selecione e copie o link.'}};

function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
function fileStem(){return(currentFile?.name||'projeto').replace(/\.ifc$/i,'').replace(/[^\p{L}\p{N}_ -]/gu,'_')}
function viewState(){return {position:camera.position.toArray(),target:controls.target.toArray(),orthographic:!!camera.isOrthographicCamera,span:camera.userData.span,zoom:camera.zoom,axis,sign,cut:$('cut').checked,cutPosition:Number($('position').value),opacity:Number($('opacity').value),visible:[...categories].filter(([,c])=>c.visible).map(([k])=>k),hidden:[...hiddenIDs],isolated:isolatedID,selected:selected?.userData.id,grid:$('showGrid').checked,dimensionHost:dimensionData?.hostID,pdfs:documentMetadata(),section:elementSection?{ids:[...elementSection.ids],min:elementSection.bounds.min.toArray(),max:elementSection.bounds.max.toArray(),hostID:elementSection.hostID,thickness:Number($('sectionThickness').value),axis:$('sectionAxis').value,position:Number($('sectionPosition').value),previous:elementSection.previous}:null}}
function restoreState(s){if(!model||!s)return;clearDimensions();elementSection=s.section?{ids:new Set(s.section.ids),hostID:s.section.hostID??s.selected,bounds:new T.Box3(new T.Vector3().fromArray(s.section.min),new T.Vector3().fromArray(s.section.max)),previous:s.section.previous}:null;$('elementSection').hidden=!elementSection;if(elementSection){$('sectionThickness').value=String(s.section.thickness||.2);$('sectionAxis').value=s.section.axis;$('sectionPosition').value=s.section.position}transition=null;changeProjection(!!s.orthographic);if(Array.isArray(s.position)&&s.position.length>=3)camera.position.fromArray(s.position);if(Array.isArray(s.target)&&s.target.length>=3)controls.target.fromArray(s.target);if(s.span)camera.userData.span=s.span;camera.zoom=s.zoom||1;resizeCamera($('canvas').clientWidth/$('canvas').clientHeight);camera.updateProjectionMatrix();controls.update();axis=s.axis||'z';sign=s.sign||1;$('cut').checked=!!s.cut;$('position').value=s.cutPosition??50;$('opacity').value=s.opacity??0;$('showGrid').checked=s.grid??true;categories.forEach((c,k)=>c.visible=!s.visible||s.visible.some(t=>String(t).toUpperCase()===k));hiddenIDs.clear();(s.hidden||[]).forEach(id=>hiddenIDs.add(id));isolatedID=s.isolated??null;document.querySelectorAll('[data-axis]').forEach(b=>b.classList.toggle('active',b.dataset.axis===axis));layerUI();update();if(elementSection)frameSection();if(s.selected)select(meshes.find(m=>m.userData.id===s.selected));if(s.dimensionHost&&!elementSection)buildDimensions(s.dimensionHost)}
 $('exportPNG').onclick=async()=>{if(readOnlyMode){$('shareStatus').textContent='Este compartilhamento é somente para visualização.';return}try{renderer.render(scene,camera);const canvas=document.createElement('canvas');canvas.width=renderer.domElement.width;canvas.height=renderer.domElement.height;const ctx=canvas.getContext('2d');ctx.fillStyle='#eef3f6';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(renderer.domElement,0,0);canvas.toBlob(blob=>{if(!blob){$('shareStatus').textContent='Não foi possível gerar a imagem.';return}download(blob,fileStem()+'-vista.png');$('shareStatus').textContent='Imagem salva sem menus ou identificação da hospedagem.'},'image/png')}catch(e){$('shareStatus').textContent='Não foi possível gerar a imagem: '+e.message}};
$('exportIFC').onclick=async()=>{
 if(readOnlyMode){$('shareStatus').textContent='Este compartilhamento é somente para visualização.';return;}
 if(!currentFile)return;
 const file=currentFile;
 try{
  if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:file.name});$('shareStatus').textContent='Arquivo IFC enviado.';}
  else{download(file,file.name);$('shareStatus').textContent='IFC baixado. Anexe este arquivo na conversa ou no e-mail.';}
 }catch(e){if(e.name==='AbortError')return;download(file,file.name);$('shareStatus').textContent='O compartilhamento não concluiu. O IFC foi baixado para você anexar.';}
};
async function makeModelZIP(htmlFile,ifcFile){
 const chunks=[],central=[];let offset=0;const enc=new TextEncoder();
 const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
 for(const file of [htmlFile,ifcFile]){
  const bytes=new Uint8Array(await file.arrayBuffer()),name=enc.encode(file.name.replace(/[\\/]/g,'_'));let crc=0xffffffff;for(const b of bytes)crc=table[(crc^b)&255]^(crc>>>8);crc=(crc^0xffffffff)>>>0;
  const header=new Uint8Array(30+name.length),h=new DataView(header.buffer);h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint32(14,crc,true);h.setUint32(18,bytes.length,true);h.setUint32(22,bytes.length,true);h.setUint16(26,name.length,true);header.set(name,30);
  const entry=new Uint8Array(46+name.length),e=new DataView(entry.buffer);e.setUint32(0,0x02014b50,true);e.setUint16(4,20,true);e.setUint16(6,20,true);e.setUint16(8,0x800,true);e.setUint32(16,crc,true);e.setUint32(20,bytes.length,true);e.setUint32(24,bytes.length,true);e.setUint16(28,name.length,true);e.setUint32(42,offset,true);entry.set(name,46);central.push(entry);chunks.push(header,bytes);offset+=header.length+bytes.length;
 }
 const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,2,true);v.setUint16(10,2,true);v.setUint32(12,central.reduce((n,x)=>n+x.length,0),true);v.setUint32(16,offset,true);
 return new File([...chunks,...central,end],ifcFile.name.replace(/\.ifc$/i,'')+'-visualizacao-com-IFC.zip',{type:'application/zip'});
}
let preparedZIP=null,preparedZIPUrl=null;
 $('shareZIP').onclick=async()=>{if(readOnlyMode||!preparedZIP)return;try{await navigator.share({files:[preparedZIP],title:preparedZIP.name})}catch(e){if(e.name!=='AbortError')$('shareStatus').textContent='Use Baixar pacote HTML + IFC.'}};
let preparedHTML=null,preparedHTMLUrl=null;
function clearHTMLExport(){if(preparedZIPUrl)URL.revokeObjectURL(preparedZIPUrl);preparedZIP=null;preparedZIPUrl=null;$('saveZIP').removeAttribute('href');if(preparedHTMLUrl)URL.revokeObjectURL(preparedHTMLUrl);preparedHTML=null;preparedHTMLUrl=null;$('exportReady').hidden=true;$('saveHTML').removeAttribute('href');}
$('shareHTML').onclick=async()=>{if(readOnlyMode||!preparedHTML)return;try{await navigator.share({files:[preparedHTML],title:preparedHTML.name});$('shareStatus').textContent='Compartilhamento concluído.'}catch(e){if(e.name!=='AbortError')$('shareStatus').textContent='Use Salvar visualização HTML para baixar o arquivo.'}};
$('saveHTML').onclick=()=>{if(readOnlyMode)return;$('shareStatus').textContent='Download solicitado. Confira os downloads do navegador ou a pasta Arquivos.'};
$('exportHTML').onclick=async()=>{
 if(readOnlyMode){$('shareStatus').textContent='Este compartilhamento é somente para visualização.';return;}
 if(!currentFile)return;const exportFile=currentFile,exportState=viewState();const button=$('exportHTML');button.disabled=true;$('shareStatus').textContent='Preparando o modelo interativo…';
 try{
  if(location.protocol==='file:'){throw Error('Para exportar uma nova cópia, abra o IFC no aplicativo on-line. Este arquivo já pode ser encaminhado.');}
  let [html,css,js,properties]=await Promise.all(['index.html','style.css','app.js','properties.js'].map(async path=>{const r=await fetch(new URL(path,document.baseURI));if(!r.ok)throw Error('Não foi possível carregar os arquivos da visualização.');return r.text()}));
  const logoResponse=await fetch(new URL('logo-nosso-arquitetura.jpeg',document.baseURI));if(!logoResponse.ok)throw Error('Não foi possível carregar a logo. Tente novamente.');
  const logoBlob=await logoResponse.blob();
  const logoData=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Erro ao incorporar a logo'));reader.readAsDataURL(logoBlob)});

  css=css.replaceAll('logo-nosso-arquitetura.jpeg',logoData);
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=()=>reject(Error('Erro ao ler o IFC'));reader.readAsDataURL(exportFile)});
  const payload=JSON.stringify({name:exportFile.name,state:exportState,data}).replace(/</g,'\\u003c');
  const source=properties.replace('export function createInspector','function createInspector')+'\n'+js.replace("import { createInspector } from './properties.js';",'');
  const escapeHTML=t=>t.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const embeddedPanel='<section id="embeddedPanel" style="position:fixed;z-index:10;left:5%;right:5%;bottom:18px;padding:16px;background:#fff;border:1px solid #9aa;border-radius:10px;color:#234"><strong>Visualização somente leitura</strong><p id="embeddedMessage">IFC incluído: '+escapeHTML(exportFile.name)+'. O arquivo não pode ser substituído por esta cópia.</p></section>';
  const doc=html.replace('<base href="/">','').replace('<body>','<body>'+embeddedPanel).replace('<link rel="stylesheet" href="style.css">',()=>'<style>'+css+'</style>').replace('<script type="module" src="app.js"></script>',()=>'<script id="embeddedIFC" type="application/json">'+payload+'</script><script type="module">'+source.replace(/<\/script/gi,'<\\/script')+'</script>');
  clearHTMLExport();preparedHTML=new File([doc],fileStem()+'-visualizacao.html',{type:'text/html'});preparedHTMLUrl=URL.createObjectURL(preparedHTML);
  preparedZIP=await makeModelZIP(preparedHTML,exportFile);preparedZIPUrl=URL.createObjectURL(preparedZIP);$('saveZIP').href=preparedZIPUrl;$('saveZIP').download=preparedZIP.name;$('shareZIP').hidden=!navigator.canShare?.({files:[preparedZIP]});
  $('saveHTML').href=preparedHTMLUrl;$('saveHTML').download=preparedHTML.name;$('shareHTML').hidden=!navigator.canShare?.({files:[preparedHTML]});$('exportReady').hidden=false;
  $('shareStatus').textContent='Pacote pronto: contém a visualização HTML e o arquivo IFC original. Baixe ou compartilhe o ZIP para enviar os dois juntos.';$('exportReady').scrollIntoView({block:'nearest'});
 }catch(e){$('shareStatus').textContent=e.message}finally{button.disabled=false}
};
let pdfUploading=false;let projectDocuments=[],pdfScope='',pdfCatalog={floors:[],elements:[]},pdfReader=null,pdfDocument=null,pdfPage=1,pdfZoom=1,pdfRenderTask=null,pdfRenderVersion=0,pdfDownloadURL=null,pdfOpening=0,pdfPersistGeneration=0;
function documentMetadata(){return projectDocuments.map(({id,name,size,floor,elements})=>({id,name,size,floor,elements}));}
async function persistDocuments(){
 if(readOnlyMode||!pdfScope)return true;
 const pdfs=documentMetadata(),generation=++pdfPersistGeneration;
 try{localStorage.setItem('ifc-documents:'+pdfScope,JSON.stringify(pdfs));}catch{}
 try{
  const response=await fetch((location.protocol==='file:'?'https://eng-gustavogil.netlify.app':'')+'/api/share?catalog='+pdfScope,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({pdfs})});
  const error=await apiError(response,'Não foi possível salvar a lista de PDFs.');if(error)throw error;
  if(generation===pdfPersistGeneration){const body=await response.json().catch(()=>({}));$('pdfLibraryState').textContent=(body.count??pdfs.length)+' PDF(s) salvos online';}
  return true;
 }catch(error){if(generation===pdfPersistGeneration)$('pdfLibraryState').textContent='Lista local · falha ao sincronizar online';console.error('pdf catalog save',error);return false;}
}
async function prepareDocuments(file){
 const sample=new Blob([file.slice(0,65536),file.slice(Math.max(0,file.size-65536)),String(file.size)]);
 try{pdfScope=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await sample.arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join('');}catch{pdfScope=file.name+':'+file.size+':'+file.lastModified;}
 pdfOpening++;pdfRenderVersion++;if(pdfRenderTask){pdfRenderTask.cancel();try{await pdfRenderTask.promise}catch{}}if(pdfDocument){await pdfDocument.destroy();pdfDocument=null;}if(pdfDownloadURL){URL.revokeObjectURL(pdfDownloadURL);pdfDownloadURL=null;}$('pdfDownload').hidden=true;$('pdfCanvas').width=0;$('pdfPage').textContent='Nenhum PDF aberto';
 projectDocuments=[];pdfCatalog=inspector.catalog();
 if(!readOnlyMode){
  try{const saved=JSON.parse(localStorage.getItem('ifc-documents:'+pdfScope)||'[]');projectDocuments=cleanDocuments(saved);}catch{}
  $('pdfLibraryState').textContent='Carregando lista de PDFs…';
  try{
   const response=await fetch((location.protocol==='file:'?'https://eng-gustavogil.netlify.app':'')+'/api/share?catalog='+pdfScope,{cache:'no-store',credentials:'same-origin'});
   const error=await apiError(response,'Não foi possível carregar a lista de PDFs.');if(error)throw error;
   const body=await response.json();
   const online=cleanDocuments(body.pdfs);
   projectDocuments=[...new Map([...online,...projectDocuments].map(x=>[x.id,x])).values()].slice(0,40);
   try{localStorage.setItem('ifc-documents:'+pdfScope,JSON.stringify(documentMetadata()));}catch{}
   $('pdfLibraryState').textContent=projectDocuments.length+' PDF(s) salvos online';
  }catch(error){$('pdfLibraryState').textContent='Lista local · não foi possível consultar o servidor';console.error('pdf catalog load',error);}
 }
 $('projectPDFs').disabled=false;refreshPDFList();
}
function cleanDocuments(items){return Array.isArray(items)?items.filter(x=>x&&/^[a-f0-9]{32}$/.test(x.id)&&typeof x.name==='string'&&Array.isArray(x.elements)).slice(0,40).map(x=>({id:x.id,name:x.name.slice(0,180),size:Number(x.size)||0,floor:String(x.floor||''),elements:x.elements.filter(Number.isSafeInteger)})):[];}
function restoreDocuments(items){if(!Array.isArray(items))return;projectDocuments=readOnlyMode?cleanDocuments(items):[...new Map([...cleanDocuments(items),...projectDocuments].map(x=>[x.id,x])).values()].slice(0,40);persistDocuments();refreshPDFList();}
function fillFloorOptions(select,first){select.replaceChildren();select.add(new Option(first,''));for(const floor of pdfCatalog.floors)select.add(new Option(floor.name,String(floor.id)));}
function refreshPDFList(){
 const filter=$('pdfFloorFilter'),old=filter.value;fillFloorOptions(filter,'Todos os pavimentos');filter.value=old;const list=$('pdfList');list.replaceChildren();
 $('pdfCount').textContent=String(projectDocuments.length);$('pdfTab').disabled=!currentFile;const query=$('pdfSearch').value.trim().toLocaleLowerCase('pt-BR');
 const filtered=projectDocuments.filter(doc=>(!query||doc.name.toLocaleLowerCase('pt-BR').includes(query))&&(!filter.value||doc.floor===filter.value||doc.elements.some(id=>pdfCatalog.elements.some(e=>e.id===id&&String(e.floor)===filter.value)))&&(!$('pdfElementFilter').checked||doc.elements.includes(elementInfo?.id)));
 $('pdfListCount').textContent=filtered.length+' de '+projectDocuments.length+' plantas';
 if(!filtered.length){const empty=document.createElement('p');empty.className='hint';empty.textContent=readOnlyMode?'Nenhum PDF foi vinculado a este filtro.':'Nenhum PDF neste filtro. Adicione um projeto ou altere o filtro.';list.append(empty);}
 for(const doc of filtered){
  const card=document.createElement('details');card.className='pdf-card';card.open=readOnlyMode;const heading=document.createElement('summary');heading.textContent=doc.name;card.append(heading);
  const actions=document.createElement('div');actions.className='pdf-card-actions';
  const open=document.createElement('button');open.textContent='Visualizar PDF';open.onclick=()=>openProjectPDF(doc);actions.append(open);
  const external=document.createElement('button');external.textContent='Visualizar em outra janela';external.title='Abrir este PDF em uma nova aba ou janela';external.onclick=()=>openProjectPDFExternal(doc);actions.append(external);card.append(actions);
  if(readOnlyMode){const floorName=pdfCatalog.floors.find(f=>String(f.id)===String(doc.floor))?.name||'Geral / vários pavimentos';const linked=doc.elements.map(id=>pdfCatalog.elements.find(e=>e.id===id)?.name).filter(Boolean);const info=document.createElement('p');info.className='hint';info.textContent='Pavimento: '+floorName+(linked.length?'\nElementos: '+linked.join(', '):'');info.style.whiteSpace='pre-line';card.append(info);list.append(card);continue;}
  const floorLabel=document.createElement('label');floorLabel.textContent='Pavimento';const floor=document.createElement('select');fillFloorOptions(floor,'Geral / vários pavimentos');floor.value=doc.floor;floorLabel.append(floor);card.append(floorLabel);
  const elementLabel=document.createElement('label');elementLabel.textContent='Elementos vinculados';const choices=document.createElement('div');choices.className='pdf-element-choices';
  const selectedIDs=new Set(doc.elements);
  const suggest=document.createElement('button');suggest.textContent='Sugerir pelo nome do arquivo';suggest.onclick=()=>{const normalize=t=>t.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim(),text=' '+normalize(doc.name)+' ';const matches=pdfCatalog.floors.filter(f=>text.includes(' '+normalize(f.name)+' '));if(matches.length===1)floor.value=String(matches[0].id);selectedIDs.clear();if(floor.value)for(const el of pdfCatalog.elements.filter(e=>String(e.floor)===floor.value))if(text.includes(' '+normalize(el.name)+' '))selectedIDs.add(el.id);populate();$('pdfStatus').textContent='Sugestão baseada somente no nome do arquivo. Confira os vínculos e clique em Salvar organização.';};card.append(suggest);
  const populate=()=>{choices.replaceChildren();for(const el of pdfCatalog.elements.filter(e=>!floor.value||String(e.floor)===floor.value)){const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.checked=selectedIDs.has(el.id);check.onchange=()=>check.checked?selectedIDs.add(el.id):selectedIDs.delete(el.id);label.append(check,document.createTextNode(el.name+' · #'+el.id));choices.append(label)}};populate();floor.onchange=()=>{selectedIDs.clear();populate()};card.append(elementLabel,choices);
  const current=document.createElement('button');current.textContent='Vincular ao selecionado';current.disabled=!elementInfo;current.onclick=()=>{if(!elementInfo)return;const el=pdfCatalog.elements.find(e=>e.id===elementInfo.id);if(!el)return;floor.value=String(el.floor||'');selectedIDs.clear();selectedIDs.add(el.id);populate()};card.append(current);
  const save=document.createElement('button');save.textContent='Salvar organização';save.onclick=async()=>{doc.floor=floor.value;doc.elements=[...selectedIDs];await persistDocuments();$('pdfStatus').textContent='Organização salva. A lista deste IFC também foi atualizada online.';refreshPDFList()};card.append(save);
  const remove=document.createElement('button');remove.textContent='Remover desta lista';remove.onclick=async()=>{projectDocuments=projectDocuments.filter(x=>x.id!==doc.id);await persistDocuments();refreshPDFList();$('pdfStatus').textContent='Removido da lista deste IFC. Links já enviados mantêm a versão anterior.'};card.append(remove);list.append(card);
 }
}
async function uploadProjectDocument(file){
 if(readOnlyMode)throw Error('Este compartilhamento é somente para visualização.');
 const id=crypto.randomUUID().replaceAll('-',''),chunk=4*1024*1024,total=Math.ceil(file.size/chunk);
 for(let part=0;part<total;part++){
  $('pdfStatus').textContent='Enviando '+file.name+' · '+(part+1)+'/'+total;
  const r=await fetch((location.protocol==='file:'?'https://eng-gustavogil.netlify.app':'')+'/api/share?id='+id,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/octet-stream','X-Share-Action':'upload','X-Share-Part':String(part),'X-Share-Total':String(total)},body:file.slice(part*chunk,(part+1)*chunk)}),error=await apiError(r,'Falha ao enviar PDF.');if(error)throw error;
 }
 const r=await fetch((location.protocol==='file:'?'https://eng-gustavogil.netlify.app':'')+'/api/share?id='+id,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'finalize',total,size:file.size,name:file.name,state:{kind:'project-pdf'}})}),error=await apiError(r,'Falha ao finalizar PDF.');if(error)throw error;
 return {id,name:file.name,size:file.size,floor:'',elements:[]};
}
function projectTab(pdf){$('projectWorkspace').classList.toggle('pdf-active',pdf);$('pdfDialog').hidden=!pdf;$('modelTab').classList.toggle('active',!pdf);$('pdfTab').classList.toggle('active',pdf);$('modelTab').setAttribute('aria-pressed',String(!pdf));$('pdfTab').setAttribute('aria-pressed',String(pdf));if(pdf){refreshPDFList();if(pdfDocument)requestAnimationFrame(renderPDFPage);}}
$('projectPDFs').onclick=$('pdfTab').onclick=()=>projectTab(true);$('closePDFs').onclick=$('modelTab').onclick=()=>projectTab(false);$('uploadPDFs').onclick=()=>$('pdfFiles').click();
$('pdfFloorFilter').onchange=$('pdfElementFilter').onchange=refreshPDFList;$('pdfSearch').oninput=refreshPDFList;
$('pdfFiles').onchange=async e=>{
 if(readOnlyMode)return;const files=[...e.target.files];if(pdfUploading)return;pdfUploading=true;$('uploadPDFs').disabled=true;
 const failures=[];let uploaded=0;try{for(const file of files){try{if(projectDocuments.length>=40)throw Error('Limite de 40 PDFs por modelo.');if(!/\.pdf$/i.test(file.name)||file.size>100*1024*1024||file.size===0)throw Error('Selecione PDFs de até 100 MB.');if(!(await file.slice(0,1024).text()).includes('%PDF-'))throw Error('Arquivo não reconhecido como PDF: '+file.name);const doc=await uploadProjectDocument(file);projectDocuments.push(doc);uploaded++;await persistDocuments();refreshPDFList();}catch(error){failures.push(file.name+': '+error.message);}} $('pdfStatus').textContent=uploaded+' PDF(s) enviados e adicionados à lista deste IFC. Organize por pavimento e crie um novo link para incluir as plantas.'+(failures.length?' Não enviados: '+failures.join('; '):'');}catch(e){$('pdfStatus').textContent=e.message}finally{pdfUploading=false;$('uploadPDFs').disabled=false;$('pdfFiles').value=''}
};
async function renderPDFPage(){
 if(!pdfDocument)return;const version=++pdfRenderVersion;if(pdfRenderTask){pdfRenderTask.cancel();try{await pdfRenderTask.promise}catch{}}
 if(version!==pdfRenderVersion)return;
 try{const page=await pdfDocument.getPage(pdfPage);if(version!==pdfRenderVersion)return;const natural=page.getViewport({scale:1}),width=Math.max($('pdfCanvasWrap').clientWidth-24,250),scale=Math.min(width/natural.width*pdfZoom,4,8192/natural.width,8192/natural.height,Math.sqrt(16000000/(natural.width*natural.height))),viewport=page.getViewport({scale});const canvas=$('pdfCanvas');canvas.width=viewport.width;canvas.height=viewport.height;
 pdfRenderTask=page.render({canvasContext:canvas.getContext('2d'),viewport});await pdfRenderTask.promise;if(version!==pdfRenderVersion)return;$('pdfPage').textContent=pdfPage+' / '+pdfDocument.numPages;$('pdfPrevious').disabled=pdfPage<=1;$('pdfNext').disabled=pdfPage>=pdfDocument.numPages;
 }catch(e){if(e.name!=='RenderingCancelledException')$('pdfStatus').textContent='Não foi possível renderizar a página. Use Baixar PDF.';}
}
async function fetchProjectPDFBlob(doc,opening=null){
 const response=await fetch((location.protocol==='file:'?'https://eng-gustavogil.netlify.app':'')+'/api/share?id='+doc.id),error=await apiError(response,'PDF não encontrado.');if(error)throw error;const meta=await response.json();if(!Number.isInteger(meta.total)||meta.total<1||meta.total>25||meta.size>100*1024*1024)throw Error('PDF acima do limite do leitor.');
 const parts=[];for(let i=0;i<meta.total;i++){const r=await fetch((location.protocol==='file:'?'https://eng-gustavogil.netlify.app':'')+'/api/share?id='+doc.id+'&part='+i),err=await apiError(r);if(err)throw err;parts.push(await r.arrayBuffer());if(opening!==null&&opening!==pdfOpening)return null;$('pdfStatus').textContent='Baixando '+doc.name+' · '+(i+1)+'/'+meta.total;}
 const blob=new Blob(parts,{type:'application/pdf'});if(blob.size!==meta.size)throw Error('Download incompleto. Tente novamente.');return blob;
}
async function openProjectPDFExternal(doc){
 const popup=window.open('about:blank','_blank');
 if(!popup){$('pdfStatus').textContent='O navegador bloqueou a nova janela. Permita pop-ups para este site e tente novamente.';return;}
 try{popup.opener=null;popup.document.title='Abrindo '+doc.name;popup.document.body.innerHTML='<p style="font-family:system-ui;padding:24px">Carregando PDF…</p>';}catch{}
 try{
  $('pdfStatus').textContent='Preparando '+doc.name+' para abrir em outra janela…';const blob=await fetchProjectPDFBlob(doc);if(!blob){popup.close();return;}const url=URL.createObjectURL(blob);popup.location.replace(url);$('pdfStatus').textContent=doc.name+' aberto em outra janela.';setTimeout(()=>URL.revokeObjectURL(url),30*60*1000);
 }catch(e){try{popup.close()}catch{}$('pdfStatus').textContent=e.message;}
}
async function openProjectPDF(doc){
 const opening=++pdfOpening;
 try{
  $('pdfStatus').textContent='Baixando '+doc.name+'…';const blob=await fetchProjectPDFBlob(doc,opening);if(!blob||opening!==pdfOpening)return;
  if(pdfDownloadURL)URL.revokeObjectURL(pdfDownloadURL);pdfDownloadURL=URL.createObjectURL(blob);$('pdfDownload').href=pdfDownloadURL;$('pdfDownload').download=doc.name;$('pdfDownload').hidden=readOnlyMode;
  if(!pdfReader){pdfReader=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs');pdfReader.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs';}
  if(opening!==pdfOpening)return;if(pdfRenderTask){pdfRenderTask.cancel();try{await pdfRenderTask.promise}catch{}}if(pdfDocument)await pdfDocument.destroy();const loaded=await pdfReader.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,standardFontDataUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/',cMapUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/cmaps/',cMapPacked:true}).promise;if(opening!==pdfOpening){await loaded.destroy();return;}pdfDocument=loaded;pdfPage=1;pdfZoom=1;await renderPDFPage();$('pdfStatus').textContent=doc.name;
 }catch(e){$('pdfStatus').textContent=e.message+(readOnlyMode?'':' Se disponível, use Baixar PDF.');}
}
$('pdfPrevious').onclick=()=>{if(pdfDocument&&pdfPage>1){pdfPage--;renderPDFPage()}};$('pdfNext').onclick=()=>{if(pdfDocument&&pdfPage<pdfDocument.numPages){pdfPage++;renderPDFPage()}};$('pdfZoomIn').onclick=()=>{pdfZoom=Math.min(pdfZoom*1.25,4);renderPDFPage()};$('pdfZoomOut').onclick=()=>{pdfZoom=Math.max(pdfZoom/1.25,.25);renderPDFPage()};
async function bootstrapAccess(){
 await initAccess();
 if(sharedId)openSharedModel(sharedId);
 else if(embedded){(async()=>{try{const data=JSON.parse(embedded.textContent),binary=atob(data.data||$('embeddedDownload')?.getAttribute('href')?.split(',')[1]||''),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);trustedReadOnlyLoad=true;let opened=false;try{opened=await load(new File([bytes],data.name,{type:'application/x-step'}))}finally{trustedReadOnlyLoad=false}if(opened){restoreDocuments(data.state?.pdfs);restoreState(data.state);if($('embeddedPanel'))$('embeddedPanel').hidden=true;hideBrandIntro();}}catch(e){status('Não foi possível abrir o modelo incorporado: '+e.message)}})();}
}
bootstrapAccess();
window.addEventListener('beforeunload',()=>{if(propertyWindow&&!propertyWindow.closed)propertyWindow.close()});
