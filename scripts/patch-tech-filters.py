from pathlib import Path

path = Path('dist/app.js')
text = path.read_text(encoding='utf-8')

text = text.replace(
    "const PUBLIC_VIEWER_ORIGIN='https://visualizar-gustavo-gil-20260915-222909-8602.netlify.app';",
    "const PUBLIC_VIEWER_ORIGIN='https://eng-gustavo-g.hatchable.site';"
)

marker = "$('layerSearch').oninput=layerUI;$('sidebarToggle').onclick=()=>{document.body.classList.toggle('sidebar-hidden');$('sidebarToggle').setAttribute('aria-expanded',String(!document.body.classList.contains('sidebar-hidden')))};"

patch = r'''function ggElementText(m){
 const line=currentModelID!==null?(()=>{try{return api.GetLine(currentModelID,m.userData.id)}catch{return null}})():null;
 return [m.userData.type,m.userData.name,line?.Name?.value,line?.ObjectType?.value,line?.Description?.value,line?.Tag?.value,line?.PredefinedType?.value].filter(Boolean).join(' ').toLowerCase();
}
function ggQuickFilter(mode='all'){
 clearDimensions();elementSection=null;$('elementSection').hidden=true;hiddenIDs.clear();isolatedID=null;categories.forEach(c=>c.visible=true);
 const structural=new Set(['IFCBEAM','IFCCOLUMN','IFCSLAB','IFCWALL','IFCWALLSTANDARDCASE','IFCFOOTING','IFCPILE','IFCSTAIR','IFCMEMBER','IFCPLATE','IFCREINFORCINGBAR','IFCREINFORCINGMESH','IFCTENDON','IFCTENDONANCHOR']);
 const pipeType=t=>/IFCPIPE|IFCFLOWSEGMENT|IFCFLOWFITTING|IFCDISTRIBUTION/.test(t||'');
 let shown=0;
 for(const m of meshes){
  const type=String(m.userData.type||''),s=ggElementText(m);let show=true;
  if(mode==='steel')show=isSteel(type);
  else if(mode==='structural')show=structural.has(type);
  else if(mode==='hydraulic')show=pipeType(type)&&(/agua|água|water|hidraul|potavel|potável|recalque|aliment|barrilete|reservat|fria|quente/.test(s)||!/esgoto|sanitar|sanitár|sewer|waste|pluvial|storm|rain|chuva|dren/.test(s));
  else if(mode==='sewer')show=pipeType(type)&&/esgoto|sanitar|sanitár|sewer|waste|soil|ventila/.test(s);
  else if(mode==='storm')show=pipeType(type)&&/pluvial|storm|rain|chuva|dren/.test(s);
  else if(mode==='electrical')show=/eletric|elétric|electri|cabo|cable|eletroduto|conduit|quadro|painel|luminar|lighting/.test(s)||/IFCCABLE|IFCELECTRIC|IFCLIGHT/.test(type);
  else if(mode==='pipes')show=pipeType(type);
  else if(mode==='architecture')show=/IFCDOOR|IFCWINDOW|IFCROOF|IFCCOVERING|IFCSPACE|IFCFURNISH/.test(type);
  if(!show)hiddenIDs.add(m.userData.id);else shown++;
 }
 layerUI();update();
 const labelsQuick={steel:'Armaduras',structural:'Estrutural',hydraulic:'Hidráulica / água',sewer:'Esgoto sanitário',storm:'Pluvial / drenagem',electrical:'Elétrica',pipes:'Tubulações',architecture:'Arquitetura'};
 status(mode==='all'?'':shown?`${labelsQuick[mode]||mode}: ${shown} elemento(s) visível(is).`:`Nenhum elemento identificado como ${labelsQuick[mode]||mode}. Verifique a classificação exportada no IFC.`);
 return shown;
}
function ggSetCut(a){axis=a;document.querySelectorAll('[data-axis]').forEach(b=>b.classList.toggle('active',b.dataset.axis===axis));$('cut').checked=true;update();}
function ggClearCut(){$('cut').checked=false;update();}
function ggSetCutPosition(value){$('position').value=String(Math.max(0,Math.min(100,Number(value)||0)));update();}
function ggSetOpacity(value){$('opacity').value=String(Math.max(0,Math.min(95,Number(value)||0)));update();}
function ggView(view){fit(view||'iso');}
window.GG_VIEWER_API={filter:ggQuickFilter,setCut:ggSetCut,clearCut:ggClearCut,setCutPosition:ggSetCutPosition,setOpacity:ggSetOpacity,view:ggView,fit:()=>fit(),flipCut:()=>{sign*=-1;update()},toggleGrid:value=>{$('showGrid').checked=Boolean(value);update()},toggleEdges:value=>{$('edges').checked=Boolean(value);$('edges').dispatchEvent(new Event('change'))},showAll:()=>ggQuickFilter('all')};
$('layerSearch').oninput=layerUI;$('sidebarToggle').onclick=()=>{document.body.classList.toggle('sidebar-hidden');$('sidebarToggle').setAttribute('aria-expanded',String(!document.body.classList.contains('sidebar-hidden')))};'''

if 'window.GG_VIEWER_API=' not in text:
    if marker not in text:
        raise SystemExit('sidebar marker not found')
    text = text.replace(marker, patch, 1)

path.write_text(text, encoding='utf-8')
