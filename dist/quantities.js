const $ = id => document.getElementById(id);

let currentIfcFile = null;
let cachedKey = '';
let cachedSnapshot = null;
let parsing = false;

const TYPE_LABELS = {
  IFCBEAM:'Vigas',IFCCOLUMN:'Pilares',IFCSLAB:'Lajes',IFCWALL:'Paredes',IFCWALLSTANDARDCASE:'Paredes',
  IFCFOOTING:'Fundações',IFCPILE:'Estacas',IFCSTAIR:'Escadas',IFCSTAIRFLIGHT:'Lances de escada',IFCROOF:'Coberturas',
  IFCMEMBER:'Membros estruturais',IFCPLATE:'Placas',IFCCOVERING:'Revestimentos',IFCDOOR:'Portas',IFCWINDOW:'Janelas',
  IFCBUILDINGELEMENTPROXY:'Outros elementos',IFCPIPESEGMENT:'Tubulações',IFCDUCTSEGMENT:'Dutos',IFCFLOWSEGMENT:'Segmentos de instalações',
  IFCFLOWTERMINAL:'Terminais de instalações',IFCFITTING:'Conexões',IFCDISTRIBUTIONELEMENT:'Instalações',
  IFCREINFORCINGBAR:'Armaduras · barras',IFCREINFORCINGMESH:'Armaduras · telas',IFCTENDON:'Tendões',IFCTENDONANCHOR:'Ancoragens',
  IFCRAILING:'Guarda-corpos',IFCRAMP:'Rampas',IFCRAMPFLIGHT:'Lances de rampa',IFCCURTAINWALL:'Fachadas cortina',
  IFCCHIMNEY:'Chaminés',IFCSHADINGDEVICE:'Brises / sombreamento',IFCBUILDINGELEMENTPART:'Partes de elementos',IFCELEMENTASSEMBLY:'Conjuntos'
};
const TYPES = Object.keys(TYPE_LABELS);
const STEEL_TYPES = new Set(['IFCREINFORCINGBAR','IFCREINFORCINGMESH']);

const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const valueOf = x => x && typeof x === 'object' && 'value' in x ? x.value : x;
const human = n => Number(n || 0).toLocaleString('pt-BR',{maximumFractionDigits:2});
const human3 = n => Number(n || 0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:3});
const sizeText = bytes => { const u=['B','KB','MB','GB']; let v=Number(bytes)||0,i=0; while(v>=1024&&i<u.length-1){v/=1024;i++;} return `${v>=100||i===0?v.toFixed(0):v.toFixed(1)} ${u[i]}`; };
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const csvCell = v => `"${String(v ?? '').replace(/"/g,'""')}"`;

function rememberFile(file){
  if(!file || !/\.ifc$/i.test(file.name)) return;
  currentIfcFile = file;
  const key = `${file.name}|${file.size}|${file.lastModified}`;
  if(key !== cachedKey){ cachedKey = ''; cachedSnapshot = null; }
}

function captureIfcFile(){
  const input = $('file');
  input?.addEventListener('change',()=>rememberFile(input.files?.[0]));
  $('viewport')?.addEventListener('drop',e=>rememberFile([...(e.dataTransfer?.files||[])].find(f=>/\.ifc$/i.test(f.name))),true);
}

function ensureButton(){
  let box = $('projectQuickTools');
  const sidebar = $('sidebar');
  if(!sidebar) return;
  if(!box){
    box=document.createElement('section');box.id='projectQuickTools';box.className='project-quick-tools';
    box.innerHTML='<div class="eyebrow">PROJETO <span>00</span></div>';
    sidebar.prepend(box);
  }
  if(!$('quantitiesOpen')){
    const b=document.createElement('button');b.id='quantitiesOpen';b.type='button';b.className='sidebar-feature';b.textContent='▦ Quantitativos';box.appendChild(b);
  }
  $('quantitiesOpen').onclick=openQuantities;
}

function ensureDialog(){
  if($('quantitiesDialog')) return $('quantitiesDialog');
  const d=document.createElement('dialog');d.id='quantitiesDialog';
  d.innerHTML=`
    <div class="dialog-head quantity-head"><div><span class="eyebrow">IFC · LEVANTAMENTO</span><h2>Quantitativos do projeto</h2></div><button id="quantitiesClose" type="button">×</button></div>
    <div class="quantity-actions"><button id="quantitiesRefresh" type="button">Recalcular</button><button id="quantitiesCsv" type="button">Baixar CSV</button></div>
    <p id="quantityStatus" class="quantity-note">Abra um IFC e toque em Recalcular.</p>
    <div id="quantityCards" class="quantity-cards"></div>
    <div id="quantityCoverage"></div>
    <section class="quantity-section"><div class="quantity-section-title"><strong>Elementos por categoria</strong><span>contagem + grandezas encontradas no IFC</span></div><div id="quantityTableWrap" class="quantity-table-wrap"></div></section>
    <section class="quantity-section"><div class="quantity-section-title"><strong>Aço por bitola</strong><span>comprimento e massa</span></div><div id="steelTableWrap" class="quantity-table-wrap"></div></section>
    <section class="quantity-section"><div class="quantity-section-title"><strong>Distribuição por pavimento</strong><span>elementos diretamente contidos em cada nível IFC</span></div><div id="floorTableWrap" class="quantity-table-wrap"></div></section>
    <p class="quantity-footnote">Volumes, áreas e pesos explícitos vêm das propriedades/quantidades IFC. Quando não há peso explícito de barras, a massa teórica é calculada apenas se o IFC informar comprimento e diâmetro, usando 7.850 kg/m³. Telas só são estimadas quando comprimento, largura, espaçamentos e diâmetros estão declarados.</p>`;
  document.body.appendChild(d);
  $('quantitiesClose').onclick=()=>d.close();
  $('quantitiesRefresh').onclick=()=>calculateAndRender(true);
  $('quantitiesCsv').onclick=exportCsv;
  d.addEventListener('click',e=>{if(e.target===d)d.close()});
  return d;
}

function basicLayerSnapshot(){
  return [...document.querySelectorAll('#layers .layer')].map(row=>({
    label:row.querySelector('span')?.textContent?.trim()||'Outros',
    count:Number((row.querySelector('b')?.textContent||'0').replace(/\D/g,''))||0
  })).filter(x=>x.count>0);
}

function setStatus(text,kind=''){
  const el=$('quantityStatus');if(!el)return;el.textContent=text;el.dataset.kind=kind;
}

async function calculateAndRender(force=false){
  if(parsing) return;
  if(!currentIfcFile){
    const basic=basicLayerSnapshot();
    renderBasic(basic);
    setStatus(basic.length?'O IFC está aberto, mas o arquivo original não está mais disponível para a leitura avançada. Reabra o IFC e toque em Recalcular.':'Abra um IFC para gerar os quantitativos.','warn');
    return;
  }
  const key=`${currentIfcFile.name}|${currentIfcFile.size}|${currentIfcFile.lastModified}`;
  if(!force && cachedSnapshot && cachedKey===key){renderSnapshot(cachedSnapshot);return;}
  parsing=true;$('quantitiesRefresh').disabled=true;$('quantitiesCsv').disabled=true;
  try{
    setStatus(`Lendo ${currentIfcFile.name} (${sizeText(currentIfcFile.size)})…`,'busy');
    cachedSnapshot=await parseIfc(currentIfcFile,msg=>setStatus(msg,'busy'));
    cachedKey=key;renderSnapshot(cachedSnapshot);setStatus('Quantitativos calculados a partir do IFC aberto.','ok');
  }catch(e){
    console.error('quantities',e);renderBasic(basicLayerSnapshot());setStatus(`Não foi possível concluir a leitura avançada: ${e?.message||e}. A contagem básica continua disponível.`,'error');
  }finally{parsing=false;$('quantitiesRefresh').disabled=false;$('quantitiesCsv').disabled=!cachedSnapshot;}
}

function renderBasic(rows){
  const total=rows.reduce((s,x)=>s+x.count,0);
  $('quantityCards').innerHTML=`<article><span>Elementos visíveis no leitor</span><strong>${human(total)}</strong></article><article><span>Categorias</span><strong>${human(rows.length)}</strong></article><article><span>Volume IFC</span><strong>—</strong></article><article><span>Aço</span><strong>—</strong></article>`;
  $('quantityCoverage').innerHTML='';
  $('quantityTableWrap').innerHTML=rows.length?`<table class="quantity-table"><thead><tr><th>Categoria</th><th>Qtd.</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.label)}</td><td>${human(r.count)}</td></tr>`).join('')}</tbody></table>`:'<div class="quantity-empty">Nenhum elemento disponível.</div>';
  $('steelTableWrap').innerHTML='<div class="quantity-empty">Reabra o IFC para calcular aço.</div>';
  $('floorTableWrap').innerHTML='';
}

function renderSnapshot(s){
  $('quantityCards').innerHTML=`
    <article><span>Elementos IFC</span><strong>${human(s.totalElements)}</strong></article>
    <article><span>Volume informado</span><strong>${s.totalVolume>0?human3(s.totalVolume)+' m³':'—'}</strong></article>
    <article><span>Área de formas</span><strong>${s.totalFormwork>0?human3(s.totalFormwork)+' m²':'—'}</strong></article>
    <article><span>Aço total</span><strong>${s.steel.mass>0?human3(s.steel.mass)+' kg':'—'}</strong></article>
    <article><span>Comprimento de barras</span><strong>${s.steel.length>0?human3(s.steel.length)+' m':'—'}</strong></article>
    <article><span>Pavimentos</span><strong>${human(s.floors.length)}</strong></article>`;
  const explicit=s.steel.explicitMass, theoretical=s.steel.theoreticalMass;
  $('quantityCoverage').innerHTML=`<div class="quantity-coverage"><span><b>${human(s.categories.length)}</b> categorias encontradas</span><span><b>${human3(explicit)} kg</b> de aço com peso explícito</span><span><b>${human3(theoretical)} kg</b> de aço calculado pela geometria IFC</span><span><b>${human(s.steel.unresolved)}</b> armaduras sem dados suficientes</span></div>`;
  $('quantityTableWrap').innerHTML=`<table class="quantity-table"><thead><tr><th>Categoria</th><th>Qtd.</th><th>Volume m³</th><th>Área m²</th><th>Formas m²</th><th>Aço kg</th></tr></thead><tbody>${s.categories.map(r=>`<tr><td>${esc(r.label)}</td><td>${human(r.count)}</td><td>${r.volume?human3(r.volume):'—'}</td><td>${r.area?human3(r.area):'—'}</td><td>${r.formwork?human3(r.formwork):'—'}</td><td>${r.steelMass?human3(r.steelMass):'—'}</td></tr>`).join('')}</tbody></table>`;
  $('steelTableWrap').innerHTML=s.steel.byDiameter.length?`<table class="quantity-table"><thead><tr><th>Bitola</th><th>Comprimento</th><th>Massa teórica</th></tr></thead><tbody>${s.steel.byDiameter.map(r=>`<tr><td>Ø ${human(r.diameterMm)} mm</td><td>${human3(r.length)} m</td><td>${human3(r.mass)} kg</td></tr>`).join('')}</tbody></table>`:'<div class="quantity-empty">O IFC não forneceu bitolas e comprimentos suficientes para o detalhamento por diâmetro.</div>';
  $('floorTableWrap').innerHTML=s.floors.length?`<table class="quantity-table"><thead><tr><th>Pavimento</th><th>Elementos</th><th>Volume m³</th><th>Formas m²</th></tr></thead><tbody>${s.floors.map(r=>`<tr><td>${esc(r.name)}</td><td>${human(r.count)}</td><td>${r.volume?human3(r.volume):'—'}</td><td>${r.formwork?human3(r.formwork):'—'}</td></tr>`).join('')}</tbody></table>`:'<div class="quantity-empty">Pavimentos não identificados nas relações de contenção IFC.</div>';
}

function exportCsv(){
  const s=cachedSnapshot;if(!s)return;
  const lines=[['Arquivo',s.file],['Elementos IFC',s.totalElements],['Volume informado (m³)',s.totalVolume],['Área de formas (m²)',s.totalFormwork],['Aço total (kg)',s.steel.mass],['Aço com peso explícito (kg)',s.steel.explicitMass],['Aço calculado pela geometria IFC (kg)',s.steel.theoreticalMass],[],['Categoria','Quantidade','Volume (m³)','Área (m²)','Formas (m²)','Aço (kg)']];
  s.categories.forEach(r=>lines.push([r.label,r.count,r.volume,r.area,r.formwork,r.steelMass]));
  lines.push([],['Aço por bitola'],['Bitola (mm)','Comprimento (m)','Massa teórica (kg)']);s.steel.byDiameter.forEach(r=>lines.push([r.diameterMm,r.length,r.mass]));
  lines.push([],['Por pavimento'],['Pavimento','Elementos','Volume (m³)','Formas (m²)']);s.floors.forEach(r=>lines.push([r.name,r.count,r.volume,r.formwork]));
  const blob=new Blob(['\ufeff'+lines.map(r=>r.map(csvCell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=(s.file.replace(/\.ifc$/i,'')||'projeto')+'-quantitativos.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}

async function parseIfc(file,onProgress){
  const W=await import('https://cdn.jsdelivr.net/npm/web-ifc@0.0.68/web-ifc-api.js');
  const api=new W.IfcAPI();api.SetWasmPath('https://cdn.jsdelivr.net/npm/web-ifc@0.0.68/');
  onProgress('Inicializando o leitor IFC…');await api.Init();
  let modelID=null;
  try{
    onProgress('Abrindo o IFC para levantamento…');const bytes=new Uint8Array(await file.arrayBuffer());modelID=api.OpenModel(bytes,{COORDINATE_TO_ORIGIN:false});if(modelID<0)throw new Error('IFC inválido ou incompatível.');
    const line=ref=>{try{return api.GetLine(modelID,typeof ref==='number'?ref:valueOf(ref));}catch{return null;}};
    const idsOf=type=>{if(!Number.isFinite(W[type]))return[];try{const v=api.GetLineIDsWithType(modelID,W[type]),out=[];for(let i=0;i<v.size();i++)out.push(v.get(i));return out;}catch{return[];}};
    const unitCache=new Map();const prefixes={EXA:1e18,PETA:1e15,TERA:1e12,GIGA:1e9,MEGA:1e6,KILO:1e3,HECTO:1e2,DECA:10,DECI:.1,CENTI:.01,MILLI:.001,MICRO:1e-6,NANO:1e-9};
    function unit(ref,depth=0){const id=typeof ref==='number'?ref:valueOf(ref);if(unitCache.has(id))return unitCache.get(id);const u=line(ref);if(!u||depth>6)return null;const name=String(valueOf(u.Name)||''),kind=String(valueOf(u.UnitType)||''),prefix=prefixes[String(valueOf(u.Prefix)||'')]||1;let result=null;if(name==='METRE')result={kind,factor:prefix};else if(name==='SQUARE_METRE')result={kind,factor:prefix**2};else if(name==='CUBIC_METRE')result={kind,factor:prefix**3};else if(name==='GRAM')result={kind,factor:prefix*.001};else if(u.ConversionFactor){const c=line(u.ConversionFactor),base=unit(c?.UnitComponent,depth+1),f=Number(valueOf(c?.ValueComponent));if(base&&Number.isFinite(f))result={kind,factor:base.factor*f};}unitCache.set(id,result);return result;}
    const project=line(idsOf('IFCPROJECT')[0]),assignment=line(project?.UnitsInContext)||line(idsOf('IFCUNITASSIGNMENT')[0]);const units={};for(const ref of assignment?.Units||[]){const u=unit(ref);if(u?.kind)units[u.kind]=u;}
    const factor=(kind,unitRef)=>unitRef?unit(unitRef)?.factor:units[kind]?.factor;
    const toSI=(row,kind)=>{const v=Number(row.raw);if(!Number.isFinite(v))return null;const f=factor(kind,row.unitRef);return Number.isFinite(f)?v*f:null;};
    const relMap=new Map();onProgress('Indexando propriedades e quantidades…');for(const rid of idsOf('IFCRELDEFINESBYPROPERTIES')){const r=line(rid);for(const ref of r?.RelatedObjects||[]){const id=valueOf(ref);if(!relMap.has(id))relMap.set(id,[]);relMap.get(id).push(r.RelatingPropertyDefinition);}}
    const floorMap=new Map(),floorNames=new Map();for(const rid of idsOf('IFCRELCONTAINEDINSPATIALSTRUCTURE')){const r=line(rid),sid=valueOf(r?.RelatingStructure),storey=line(sid),sname=String(valueOf(storey?.Name)||`Pavimento #${sid}`);floorNames.set(sid,sname);for(const ref of r?.RelatedElements||[])floorMap.set(valueOf(ref),sid);}
    function collectRows(id){const e=line(id),rows=[],visited=new Set();const add=(key,val,unitRef,source='IFC')=>{const raw=valueOf(val);if(raw==null||raw===''||typeof raw==='boolean')return;rows.push({key:String(key||''),n:norm(key),raw,measure:val?.name||'',unitRef,source});};for(const k of ['NominalDiameter','BarLength','CrossSectionArea','MeshLength','MeshWidth','LongitudinalBarNominalDiameter','TransverseBarNominalDiameter','LongitudinalBarSpacing','TransverseBarSpacing'])if(e?.[k]!=null)add(k,e[k],null,'Atributo IFC');function walk(ref,depth=0){const p=line(ref);if(!p||depth>10||visited.has(p.expressID))return;visited.add(p.expressID);const key=String(valueOf(p.Name)||api.GetNameFromTypeCode(p.type)||'Propriedade');for(const field of ['NominalValue','LengthValue','AreaValue','VolumeValue','WeightValue','CountValue','NumberValue'])if(p[field]!=null)add(key,p[field],p.Unit,field);for(const child of p.HasProperties||p.Quantities||p.Properties||[])walk(child,depth+1);}for(const ref of relMap.get(id)||[])walk(ref);return rows;}
    const kindOf=r=>/VOLUMEMEASURE/i.test(r.measure)?'VOLUMEUNIT':/AREAMEASURE/i.test(r.measure)?'AREAUNIT':/LENGTHMEASURE/i.test(r.measure)?'LENGTHUNIT':/MASSMEASURE|WEIGHTMEASURE/i.test(r.measure)?'MASSUNIT':'';
    const pick=(rows,names,kind)=>{for(const n of names){const r=rows.find(x=>x.n===n&&(kind?kindOf(x)===kind||!kindOf(x):true));if(r)return r;}return kind?rows.find(x=>kindOf(x)===kind):null;};
    const countMap=new Map(),catMap=new Map(),floorAgg=new Map();let totalVolume=0,totalFormwork=0,totalArea=0;const steel={mass:0,length:0,explicitMass:0,theoreticalMass:0,unresolved:0,diameters:new Map()};
    const addCat=(type)=>{const label=TYPE_LABELS[type]||type.replace(/^IFC/,'');if(!catMap.has(label))catMap.set(label,{label,count:0,volume:0,area:0,formwork:0,steelMass:0});return catMap.get(label);};
    const addDiameter=(dMm,length)=>{if(!(dMm>0&&length>0))return;const key=Math.round(dMm*100)/100;if(!steel.diameters.has(key))steel.diameters.set(key,{diameterMm:key,length:0,mass:0});const row=steel.diameters.get(key),mass=7850*Math.PI*Math.pow(dMm/1000,2)/4*length;row.length+=length;row.mass+=mass;steel.length+=length;};
    const elementRecords=[];onProgress('Lendo elementos, volumes, áreas e armaduras…');
    for(const type of TYPES){const ids=idsOf(type);if(!ids.length)continue;countMap.set(type,ids.length);for(const id of ids){const rows=collectRows(id),cat=addCat(type);cat.count++;const volRow=pick(rows,['netvolume','volume','concretevolume','volumedeconcreto','grossvolume'],'VOLUMEUNIT'),areaRow=pick(rows,['netarea','area','grossarea','planarea','surfacearea'],'AREAUNIT'),formRow=pick(rows,['formworkarea','shutteringarea','areadeforma','areadaforma','areaforma','areasuperficialdeforma'],'AREAUNIT');const volume=volRow?toSI(volRow,'VOLUMEUNIT'):null,area=areaRow?toSI(areaRow,'AREAUNIT'):null,form=formRow?toSI(formRow,'AREAUNIT'):null;if(volume>0){cat.volume+=volume;totalVolume+=volume}if(area>0){cat.area+=area;totalArea+=area}if(form>0){cat.formwork+=form;totalFormwork+=form}const sid=floorMap.get(id),floor=sid?floorNames.get(sid):'';elementRecords.push({id,type,floor,volume:volume||0,formwork:form||0});if(STEEL_TYPES.has(type)){
          const massRow=pick(rows,['steelweight','rebarweight','weight','mass','peso','massa','pesodeaco','massadeaco'],'MASSUNIT');const explicit=massRow?toSI(massRow,'MASSUNIT'):null;let calc=0;
          if(type==='IFCREINFORCINGBAR'){
            const l=pick(rows,['barlength','length','comprimento'],'LENGTHUNIT'),d=pick(rows,['nominaldiameter','bardiameter','diameter','diametro','bitola'],'LENGTHUNIT');const length=l?toSI(l,'LENGTHUNIT'):null,diameter=d?toSI(d,'LENGTHUNIT'):null;let multiplier=1;const c=pick(rows,['barcount','numberofbars','countofbars','numerodebarras'],'');if(c&&Number(c.raw)>1)multiplier=Number(c.raw);if(length>0&&diameter>0){const totalL=length*multiplier,dmm=diameter*1000;addDiameter(dmm,totalL);calc=7850*Math.PI*diameter*diameter/4*totalL;}
          }else{
            const ml=pick(rows,['meshlength'],'LENGTHUNIT'),mw=pick(rows,['meshwidth'],'LENGTHUNIT'),ld=pick(rows,['longitudinalbarnominaldiameter'],'LENGTHUNIT'),td=pick(rows,['transversebarnominaldiameter'],'LENGTHUNIT'),ls=pick(rows,['longitudinalbarspacing'],'LENGTHUNIT'),ts=pick(rows,['transversebarspacing'],'LENGTHUNIT');const L=ml?toSI(ml,'LENGTHUNIT'):null,Wd=mw?toSI(mw,'LENGTHUNIT'):null,d1=ld?toSI(ld,'LENGTHUNIT'):null,d2=td?toSI(td,'LENGTHUNIT'):null,s1=ls?toSI(ls,'LENGTHUNIT'):null,s2=ts?toSI(ts,'LENGTHUNIT'):null;if(L>0&&Wd>0&&d1>0&&d2>0&&s1>0&&s2>0){const n1=Math.floor(Wd/s1)+1,n2=Math.floor(L/s2)+1,l1=n1*L,l2=n2*Wd;addDiameter(d1*1000,l1);addDiameter(d2*1000,l2);calc=7850*Math.PI*d1*d1/4*l1+7850*Math.PI*d2*d2/4*l2;}
          }
          const chosen=explicit>0?explicit:calc;cat.steelMass+=chosen||0;steel.mass+=chosen||0;if(explicit>0)steel.explicitMass+=explicit;else if(calc>0)steel.theoreticalMass+=calc;else steel.unresolved++;
        }} }
    for(const e of elementRecords){const name=e.floor||'Sem pavimento direto';if(!floorAgg.has(name))floorAgg.set(name,{name,count:0,volume:0,formwork:0});const f=floorAgg.get(name);f.count++;f.volume+=e.volume;f.formwork+=e.formwork;}
    const byDiameter=[...steel.diameters.values()].sort((a,b)=>a.diameterMm-b.diameterMm);const categories=[...catMap.values()].sort((a,b)=>b.count-a.count||a.label.localeCompare(b.label,'pt-BR'));const floors=[...floorAgg.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
    return {file:file.name,totalElements:categories.reduce((s,x)=>s+x.count,0),totalVolume,totalArea,totalFormwork,categories,floors,steel:{mass:steel.mass,length:steel.length,explicitMass:steel.explicitMass,theoreticalMass:steel.theoreticalMass,unresolved:steel.unresolved,byDiameter}};
  }finally{try{if(modelID!==null)api.CloseModel(modelID)}catch{};try{api.Dispose?.()}catch{}}
}

async function openQuantities(){
  const d=ensureDialog();
  document.body.classList.add('sidebar-hidden');$('sidebarToggle')?.setAttribute('aria-expanded','false');
  if(typeof d.showModal==='function'&&!d.open)d.showModal();else d.setAttribute('open','');
  await calculateAndRender(false);
}

export function installQuantities(){ captureIfcFile(); ensureButton(); ensureDialog(); }
