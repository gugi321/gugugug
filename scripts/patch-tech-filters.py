from pathlib import Path

path = Path('dist/app.js')
text = path.read_text(encoding='utf-8')

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

path.write_text(text, encoding='utf-8')
