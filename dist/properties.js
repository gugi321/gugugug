// IFC attributes and quantities are read from the source; absent values are never invented.
export function createInspector(api, W, modelID) {
  const line = ref => { try { return api.GetLine(modelID, typeof ref === 'number' ? ref : ref?.value); } catch { return null; } };
  const val = x => x && typeof x === 'object' && 'value' in x ? x.value : x;
  const name = x => String(val(x) ?? '');
  const all = type => {
    if (!Number.isFinite(W[type])) return [];
    try { const ids = api.GetLineIDsWithType(modelID, W[type]); const out=[]; for(let i=0;i<ids.size();i++)out.push(ids.get(i)); return out; } catch { return []; }
  };
  const relations = new Map();
  function index(type, field) {
    const cacheKey=type+field;
    if(relations.has(cacheKey))return relations.get(cacheKey);
    const map=new Map();
    for(const id of all(type)){const rel=line(id);if(!rel)continue;const refs=Array.isArray(rel[field])?rel[field]:[rel[field]];for(const ref of refs){const key=val(ref);if(key==null)continue;if(!map.has(key))map.set(key,[]);map.get(key).push(rel);}}
    relations.set(cacheKey,map);return map;
  }
  const units={};
  const prefixes={EXA:1e18,PETA:1e15,TERA:1e12,GIGA:1e9,MEGA:1e6,KILO:1e3,HECTO:1e2,DECA:10,DECI:.1,CENTI:.01,MILLI:.001,MICRO:1e-6,NANO:1e-9};
  function unit(ref, depth=0){
    const u=line(ref);if(!u||depth>5)return null;
    const kind=name(u.UnitType),n=name(u.Name),p=prefixes[name(u.Prefix)]||1;
    const bases={METRE:['m',1],SQUARE_METRE:['m²',2],CUBIC_METRE:['m³',3],PASCAL:['Pa',1],GRAM:['kg',1],RADIAN:['rad',1]};
    if(bases[n])return {kind,label:bases[n][0],factor:Math.pow(p,bases[n][1])*(n==='GRAM'?.001:1)};
    if(u.ConversionFactor){const c=line(u.ConversionFactor),base=unit(c?.UnitComponent,depth+1),factor=Number(val(c?.ValueComponent));if(base&&Number.isFinite(factor))return {...base,kind,factor:base.factor*factor};}
    return {kind,label:n||'unidade IFC',factor:null};
  }
  const project=line(all('IFCPROJECT')[0]);
  const assignment=line(project?.UnitsInContext)||line(all('IFCUNITASSIGNMENT')[0]);
  for(const ref of assignment?.Units||[]){const u=unit(ref);if(u)units[u.kind]=u;}
  const numeric = new Intl.NumberFormat('pt-BR',{maximumFractionDigits:5});
  function kindFor(key){
    const k=key.toLowerCase();
    if(/volume/.test(k))return 'VOLUMEUNIT';if(/area|área|crosssection/.test(k))return 'AREAUNIT';
    if(/pressure|strength|fck|resist|tensao|tensão/.test(k))return 'PRESSUREUNIT';
    if(/weight|mass|massa|peso/.test(k))return 'MASSUNIT';
    if(/length|width|height|depth|diameter|thickness|spacing|cover|elevation|eleva[cç][aã]o|se[cç][aã]o_[bh]|nivel|nível|comprimento|largura|altura|espessura|di.metro|bitola|cobrimento|espa.amento/.test(k))return 'LENGTHUNIT';
    return '';
  }
  function format(value,key,explicit){
    const v=val(value);if(v==null)return 'Não informado';if(typeof v==='boolean')return v?'Sim':'Não';
    if(typeof v!=='number')return String(v);
    const measure=value?.name||'',kind=/AREAMEASURE/.test(measure)?'AREAUNIT':/VOLUMEMEASURE/.test(measure)?'VOLUMEUNIT':/LENGTHMEASURE/.test(measure)?'LENGTHUNIT':/PRESSUREMEASURE/.test(measure)?'PRESSUREUNIT':kindFor(key);
    const suffix=key.match(/(?:\(|\[)\s*(mm|cm|m|m²|m2|MPa|kPa|Pa)\s*(?:\)|\])\s*$/i)?.[1];
    const declared={mm:{label:'m',factor:.001,kind:'LENGTHUNIT'},cm:{label:'m',factor:.01,kind:'LENGTHUNIT'},m:{label:'m',factor:1,kind:'LENGTHUNIT'},'m²':{label:'m²',factor:1,kind:'AREAUNIT'},m2:{label:'m²',factor:1,kind:'AREAUNIT'},mpa:{label:'Pa',factor:1e6,kind:'PRESSUREUNIT'},kpa:{label:'Pa',factor:1e3,kind:'PRESSUREUNIT'},pa:{label:'Pa',factor:1,kind:'PRESSUREUNIT'}};
    const u=explicit?unit(explicit):suffix?declared[suffix.toLowerCase()]:units[kind];
    if(u?.kind&&kind&&u.kind!==kind)return numeric.format(v)+' (unidade incompatível)';
    if(!kind&&!explicit)return numeric.format(v);
    if(!u)return numeric.format(v)+' (unidade não informada)';
    if(u.factor==null)return numeric.format(v)+' '+u.label;
    let out=v*u.factor,label=u.label;
    if(kind==='LENGTHUNIT'&&/diameter|di.metro|bitola/i.test(key)){out*=1000;label='mm';}
    if(kind==='PRESSUREUNIT'&&u.label==='Pa'){out/=1e6;label='MPa';}
    return numeric.format(out)+' '+label;
  }
  const steelType=id=>/IFCREINFORCING|IFCTENDON/.test(String(api.GetNameFromTypeCode(line(id)?.type)||'').toUpperCase());
  const hostType=id=>/^(IFCBEAM|IFCCOLUMN|IFCSLAB|IFCWALL|IFCWALLSTANDARDCASE|IFCFOOTING|IFCPILE|IFCMEMBER|IFCPLATE)$/.test(String(api.GetNameFromTypeCode(line(id)?.type)||'').toUpperCase());
  let namedGroups=null;
  function nameGroups(){
    if(namedGroups)return namedGroups;
    const hosts=new Map(),bars=new Map(),scope=new Map();
    for(const rid of all('IFCRELCONTAINEDINSPATIALSTRUCTURE')){const r=line(rid);for(const ref of r?.RelatedElements||[])scope.set(val(ref),val(r.RelatingStructure));}
    const key=(id,label)=>scope.has(id)?scope.get(id)+'|'+label.trim().toUpperCase():null;
    for(const type of ['IFCBEAM','IFCCOLUMN','IFCSLAB','IFCFOOTING','IFCWALL','IFCPILE','IFCMEMBER','IFCPLATE'])for(const id of all(type)){const k=key(id,name(line(id)?.Name));if(k){if(!hosts.has(k))hosts.set(k,[]);hosts.get(k).push(id);}}
    for(const type of ['IFCREINFORCINGBAR','IFCREINFORCINGMESH'])for(const id of all(type)){const label=name(line(id)?.Name);if(!label.includes(' - '))continue;const k=key(id,label.split(' - ')[0]);if(k){if(!bars.has(k))bars.set(k,[]);bars.get(k).push(id);}}
    return namedGroups={hosts,bars,key};
  }
  function hostFor(id){
    if(!steelType(id))return id;
    const queue=[id],seen=new Set(queue),hosts=new Set();
    while(queue.length){const child=queue.shift();for(const kind of ['IFCRELAGGREGATES','IFCRELNESTS'])for(const rel of index(kind,'RelatedObjects').get(child)||[]){const parent=val(rel.RelatingObject);if(seen.has(parent))continue;seen.add(parent);if(hostType(parent))hosts.add(parent);else queue.push(parent);}}
    if(hosts.size)return hosts.size===1?[...hosts][0]:null;const groups=nameGroups(),label=name(line(id)?.Name);if(!label.includes(' - '))return null;const matches=groups.hosts.get(groups.key(id,label.split(' - ')[0]))||[];return matches.length===1?matches[0]:null;
  }
  function read(id,{withRelated=true,resolveHost=true}={}){
    const clickedID=id,hostID=resolveHost?hostFor(id):id;if(hostID!==null)id=hostID;
    const element=line(id);if(!element)return null;
    const unresolvedSteel=steelType(id);
    const rows=[];let visited=new Set();
    const add=(group,key,value,unitRef)=>{if(val(value)==null||val(value)===''||(typeof val(value)==='number'&&!Number.isFinite(val(value))))return;rows.push({group,key,value:format(value,key,unitRef),raw:val(value),measure:value?.name,unitRef});};
    const direct=['Name','Description','ObjectType','Tag','GlobalId','NominalDiameter','BarLength','CrossSectionArea','SteelGrade','PredefinedType','BarSurface','MeshLength','MeshWidth','LongitudinalBarNominalDiameter','TransverseBarNominalDiameter','LongitudinalBarSpacing','TransverseBarSpacing'];
    for(const key of direct)add('Atributos IFC',key,element[key]);
    function property(ref,group,depth=0){
      if(depth>8)return;const p=line(ref);if(!p||visited.has(p.expressID))return;visited.add(p.expressID);
      const key=name(p.Name)||'Propriedade';
      const values=['NominalValue','LengthValue','AreaValue','VolumeValue','WeightValue','CountValue','TimeValue','NumberValue','UpperBoundValue','LowerBoundValue','SetPointValue'];
      for(const field of values)if(p[field]!=null)add(group,key+(field.endsWith('BoundValue')?' · '+field:''),p[field],p.Unit);
      for(const field of ['ListValues','EnumerationValues'])if(p[field])add(group,key,p[field].map(x=>format(x,key,p.Unit)).join(', '));
      for(const ref of p.HasProperties||p.Quantities||p.Properties||[])property(ref,group+' / '+key,depth+1);
      if(p.Material){const mat=line(p.Material);if(mat)add(group,'Material',mat.Name);}
      if(p.LayerThickness!=null)add(group,'LayerThickness',p.LayerThickness);
    }
    function pset(ref,prefix='') {if(Array.isArray(ref)){for(const r of ref)pset(r,prefix);return;}const p=line(ref);if(!p)return;const group=prefix+(name(p.Name)||'Propriedades IFC');for(const r of p.HasProperties||p.Quantities||p.Properties||[])property(r,group);}
    for(const rel of index('IFCRELDEFINESBYPROPERTIES','RelatedObjects').get(id)||[])pset(rel.RelatingPropertyDefinition);
    const typeRefs=[];
    for(const rel of index('IFCRELDEFINESBYTYPE','RelatedObjects').get(id)||[]){const type=line(rel.RelatingType);if(!type)continue;typeRefs.push(type.expressID);add('Tipo IFC','Name',type.Name);for(const p of type.HasPropertySets||[])pset(p,'Tipo · ');}
    const materialIDs=new Set();
    function material(ref,depth=0){
      const m=line(ref);if(!m||depth>8||materialIDs.has(m.expressID))return;materialIDs.add(m.expressID);
      for(const key of ['Name','Description','Category','LayerThickness','TotalThickness'])add('Materiais / camadas',key,m[key]);
      for(const key of ['Material','ForLayerSet','ForProfileSet','ForConstituentSet'])if(m[key])material(m[key],depth+1);
      for(const key of ['Materials','MaterialLayers','MaterialProfiles','MaterialConstituents'])for(const r of m[key]||[])material(r,depth+1);
    }
    for(const objID of [id,...typeRefs])for(const rel of index('IFCRELASSOCIATESMATERIAL','RelatedObjects').get(objID)||[])material(rel.RelatingMaterial);
    for(const kind of ['IFCMATERIALPROPERTIES','IFCEXTENDEDMATERIALPROPERTIES','IFCMECHANICALCONCRETEMATERIALPROPERTIES'])for(const matID of materialIDs)for(const p of index(kind,'Material').get(matID)||[]){const mat=line(matID);if(p.CompressiveStrength!=null)add('Material · Concreto','CompressiveStrength',p.CompressiveStrength);for(const r of p.Properties||p.ExtendedProperties||[])property(r,'Material · '+name(mat?.Name)+' '+name(mat?.Category)+' · '+(name(p.Name)||'Propriedades'));}
    for(const rel of index('IFCRELCONTAINEDINSPATIALSTRUCTURE','RelatedElements').get(id)||[]){
      const storey=line(rel.RelatingStructure);
      if(storey){add('Pavimento IFC','StoreyName',storey.Name);add('Pavimento IFC','Elevation',storey.Elevation);}
    }
    const linked=[],components=[];
    if(withRelated){const queue=[id],seen=new Set(queue);while(queue.length){const parent=queue.shift();for(const kind of ['IFCRELAGGREGATES','IFCRELNESTS'])for(const rel of index(kind,'RelatingObject').get(parent)||[])for(const ref of rel.RelatedObjects||[]){const childID=val(ref);if(seen.has(childID))continue;seen.add(childID);if(hostType(childID)){components.push(childID);continue;}queue.push(childID);const child=line(childID);const type=child&&String(api.GetNameFromTypeCode(child.type)).toUpperCase();if(!/IFCREINFORCING|IFCTENDON/.test(type||''))components.push(childID);if(/IFCREINFORCING|IFCTENDON/.test(type||'')){linked.push({id:childID,name:name(child.Name),diameter:['NominalDiameter','LongitudinalBarNominalDiameter','TransverseBarNominalDiameter'].filter(k=>child[k]!=null).map(k=>format(child[k],k)).join(' / ')||null});}}}}
    let namedBars=[],barAssociation='';
    if(!unresolvedSteel&&!linked.length){const groups=nameGroups(),k=groups.key(id,name(element.Name));namedBars=(groups.bars.get(k)||[]).filter(barID=>{const text=name(line(barID)?.Name),host=String(api.GetNameFromTypeCode(element.type)).toUpperCase();return host==='IFCFOOTING'?/sapata|footing/i.test(text):!/sapata|footing/i.test(text)});
      if(namedBars.length){const unique=(groups.hosts.get(k)||[]).length===1;barAssociation=unique?'Barras identificadas pelo mesmo nome e pavimento.':'Barras agrupadas por nome e pavimento; podem incluir outros trechos deste elemento.';
        if(unique)for(const barID of namedBars)linked.push({id:barID,name:name(line(barID)?.Name)});
      }
    }
    const norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const key=r=>norm(r.key.replace(/(?:\(|\[)\s*(mm|cm|m|m²|m2|MPa|kPa|Pa)\s*(?:\)|\])\s*$/i,''));
    function objectProperties(objectID,prefix){
      for(const rel of index('IFCRELDEFINESBYPROPERTIES','RelatedObjects').get(objectID)||[])pset(rel.RelatingPropertyDefinition,prefix);
      for(const rel of index('IFCRELDEFINESBYTYPE','RelatedObjects').get(objectID)||[]){const t=line(rel.RelatingType);for(const ref of t?.HasPropertySets||[])pset(ref,prefix+'Tipo · ');}
    }
    for(const componentID of components){const component=line(componentID),identity=[name(component?.Name),name(component?.ObjectType)].join(' ');
      if(/eps|poliestireno|treli[cç]a|lattice|truss/i.test(identity)){
        const prior=visited;visited=new Set();objectProperties(componentID,'Componente · '+identity+' · ');visited=prior;
        if(/treli[cç]a|lattice|truss/i.test(identity))add('Componente · Treliça','Treliça',component.Name);
      }
    }
    // Decode explicitly paired exported item descriptions and quantities.
    const itemGroups=new Map();for(const r of rows){if(!itemGroups.has(r.group))itemGroups.set(r.group,[]);itemGroups.get(r.group).push(r);}
    for(const items of itemGroups.values()){
      const description=items.find(r=>/^descricao\d*$/.test(key(r))),quantity=items.find(r=>/^quantidade\d*$/.test(key(r)));
      if(description&&quantity&&/^Forma\b/i.test(description.raw)&&quantity.measure==='IFCAREAMEASURE')rows.push({...quantity,key:'FormworkArea'});
      if(description&&/^Armadura\b/i.test(description.raw)){const match=String(description.raw).match(/[øØ⌀]\s*(\d+(?:[.,]\d+)?)\s*mm/i);if(match)rows.push({group:'Armaduras do elemento',key:'BarDiameter',value:match[1].replace('.',',')+' mm',raw:match[1]});}
    }
    const classRows=rows.filter(r=>/^(strengthclass|classedeconcreto)$/.test(key(r))&&(!/strengthclass/.test(key(r))||/concrete/i.test(r.group)));
    for(const r of classRows){const match=String(r.raw).match(/^C\s*-?\s*(\d+(?:[.,]\d+)?)(?:\s*\/\s*\d+)?$/i);if(match)rows.push({group:r.group,key:'fck',value:match[1].replace('.',',')+' MPa',raw:Number(match[1].replace(',','.'))});}
    const priority=r=>r.group.startsWith('Tipo')?2:r.group.startsWith('Material')?3:r.group.startsWith('Componente')?4:1;
    const find=(pattern,filter=()=>true)=>{const matched=rows.filter(r=>!unresolvedSteel&&pattern.test(key(r))&&filter(r));const best=Math.min(...matched.map(priority));return matched.filter(r=>priority(r)===best)};
    const fields=[];
    function field(label,matched,{multiple=false,note=''}={}){
      const values=[...new Set(matched.map(r=>r.value))];
      const conflict=values.length>1&&!multiple;
      fields.push([label,values.length?values.join(' / '):'Não informado',{missing:!values.length,conflict,note:conflict?'Valores diferentes declarados no IFC. Confira o elemento.':note}]);
    }
    const notEPS=r=>!/eps|poliestireno|rebar|reinforc|armadura|steel|barra|estribo/.test(norm(r.group+' '+r.key))&&!r.group.startsWith('Componente');
    const type=String(api.GetNameFromTypeCode(element.type)).toUpperCase();
    field('Largura',find(/^(width|largura|secaobw|secaob|sectionwidth|larguradasecao|larguradoelemento|larguradaviga|larguradopilar|larguratotal|overallwidth)$/,notEPS));
    const heights=find(/^(height|altura|secaoh|sectionheight|alturadasecao|alturatotal|alturadoelemento|alturadaviga|alturadopilar|alturadalaje|overallheight)$/,notEPS);
    field(type==='IFCSLAB'?'Altura / espessura da laje':'Altura',heights.length?heights:type==='IFCSLAB'?find(/^(thickness|espessura|overallthickness|espessuratotal|espessuradalaje|totalthickness)$/,notEPS):[]);
    field('Cobrimento',find(/^(concretecover|nominalcover|cover|cobrimento|cobrimentonominal|cobrimentodaarmadura|cobrimentodoconcreto)$/));
    const fck=find(/^(fck|fckdoconcreto|fckconcreto|concretefck|characteristiccompressivestrength|resistenciacaracteristicaacompressao|resistenciacaracteristicadoconcreto)$/,notEPS);
    field('fck do concreto',fck.length?fck:find(/^(compressivestrength|resistenciaacompressao)$/,r=>notEPS(r)&&/concrete|concreto/.test(norm(r.group))),{note:!fck.length?'Resistência à compressão declarada no material concreto.':''});
    const levels=find(/^(level|nivel|elevacao|referencelevel|niveldoelemento|niveldeimplantacao|cotadonivel)$/);
    if(levels.length){const reference=rows.filter(r=>r.key==='StoreyName'||r.key==='Elevation').map(r=>r.value).join(' · ');const relative=levels.every(r=>/AltoQi_Eberick_Elemento/i.test(r.group));field('Nível do elemento',relative&&reference?levels.map(r=>({...r,value:reference+' · desnível '+r.value})):levels,{note:relative?'Pavimento de referência e elevação relativa declarada.':'Elevação declarada do elemento. '+reference});}
    else {
      const names=rows.filter(r=>!unresolvedSteel&&r.key==='StoreyName').map(r=>r.value),elevations=rows.filter(r=>!unresolvedSteel&&r.key==='Elevation').map(r=>r.value);
      field('Nível do elemento',names.length||elevations.length?[{value:[...names,...elevations].join(' · ')}]:[],{note:'Pavimento de referência; não é a cota da face do elemento.'});
    }
    const reinforcement=[];
    function barRows(barID){
      const bar=line(barID),out=[],start=rows.length,prior=visited;visited=new Set();
      objectProperties(barID,'Barra · ');
      const properties=rows.splice(start);visited=prior;
      const roleText=properties.filter(r=>/role|funcao|posicao|position|classification|classificacao/.test(key(r))).map(r=>r.value).join(' ');
      for(const k of ['NominalDiameter','LongitudinalBarNominalDiameter','TransverseBarNominalDiameter'])if(bar[k]!=null)out.push({value:format(bar[k],k),roleText});
      for(const row of properties)if(/diameter|diametro|bitola/.test(key(row)))out.push({...row,roleText:roleText+' '+row.key+' '+row.group});
      return out;
    }
    function role(text){
      const t=norm(text),hits=[];
      if(/superior|upper|top/.test(t))hits.push('Armadura superior');
      if(/inferior|lower|bottom/.test(t))hits.push('Armadura inferior');
      if(/estrib|stirrup|shear|transversal/.test(t))return 'Estribos · transversal';
      if(/pele|skin|lateral/.test(t))return 'Armadura de pele';
      return hits.length===1?hits[0]:/longitudinal/.test(t)&&!hits.length?'Longitudinal sem posição definida':'Sem classificação no IFC';
    }
    const grouped=new Map(['Armadura superior','Armadura inferior','Estribos · transversal','Armadura de pele','Longitudinal sem posição definida','Sem classificação no IFC'].map(k=>[k,[]]));
    for(const bar of unresolvedSteel?[{id}]:linked.length?linked:namedBars.map(id=>({id}))){
      const b=line(bar.id),description=[name(b.Name),name(b.ObjectType),name(b.PredefinedType)].join(' ');
      for(const row of barRows(bar.id))grouped.get(role(description+' '+(row.roleText||''))).push(row);
    }
    // Read explicit reinforcement diameter properties on the host, never its dimensions.
    if(!unresolvedSteel)for(const row of rows)if(/diameter|diametro|bitola/.test(key(row))){grouped.get(role(row.group+' '+row.key)).push(row);}
    for(const [label,values] of grouped){if(values.length||['Armadura superior','Armadura inferior','Estribos · transversal','Armadura de pele'].includes(label)){
      const unique=[...new Set(values.map(r=>r.value))];reinforcement.push([label,unique.join(' / ')||'Não informado',{missing:!unique.length,note:unique.length?barAssociation:''}]);
    }}
    field('Área da forma',find(/^(formworkarea|shutteringarea|areadeforma|areadaforma|areadeformas|areadasformas|areaforma|areadeformadoelemento|areadeformada|areasuperficialdeforma|formwork)$/));
    if(type==='IFCSLAB'){
      field('Treliça da laje',find(/^(trelica|tipodetrelica|tipodatrelica|trelicadalaje|modelodatrelica|designacaodatrelica|latticegirder|trusstype)$/));
      for(const [label,pattern,generic] of [['Altura do EPS',/^(epsheight|heightofeps|alturadoeps|alturaeps|alturadoblocoeps|alturaenchimento|alturadoenchimento)$/, /^(height|altura)$/],['Largura do EPS',/^(epswidth|widthofeps|larguradoeps|larguraeps|larguradoblocoeps|larguraenchimento|larguradoenchimento)$/, /^(width|largura)$/]]){
        const exact=find(pattern,r=>!/enchimento/.test(key(r))||/eps|poliestireno/.test(norm(r.group))); field(label,exact.length?exact:find(generic,r=>/eps|poliestireno/.test(norm(r.group))));
      }
    }
    if(type==='IFCSLAB')for(const f of fields)if(f[2].missing&&/EPS|Treliça/.test(f[0])){f[1]='Não consta nas propriedades deste IFC';f[2].note='O tipo de laje, por si só, não informa as dimensões do EPS nem o modelo da treliça.';}
    return {id,name:name(element.Name)||'Elemento IFC',type,fields,reinforcement,linked,sectionCandidates:[...new Set([...linked.map(b=>b.id),...namedBars])],barAssociation,units,clickedID,unresolvedSteel};
  }
  function catalog(){
    const floors=all('IFCBUILDINGSTOREY').map(id=>({id,name:name(line(id)?.Name)||'Pavimento #'+id}));
    const elements=[];for(const type of ['IFCBEAM','IFCCOLUMN','IFCSLAB','IFCWALL','IFCFOOTING','IFCPILE'])for(const id of all(type)){const rel=index('IFCRELCONTAINEDINSPATIALSTRUCTURE','RelatedElements').get(id)?.[0];elements.push({id,name:name(line(id)?.Name)||'#'+id,floor:val(rel?.RelatingStructure)??''});}
    return {floors,elements};
  }
  return {read,units,hostFor,catalog};
}
