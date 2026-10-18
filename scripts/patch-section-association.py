from pathlib import Path

# Reinforcement association fallback: geometric overlap + IFC type metadata.
# --- properties.js: read diameter/role from IfcReinforcingBarType ---
prop_path=Path('dist/properties.js')
prop=prop_path.read_text(encoding='utf-8')
old="""    function barRows(barID){
      const bar=line(barID),out=[],start=rows.length,prior=visited;visited=new Set();
      objectProperties(barID,'Barra · ');
      const properties=rows.splice(start);visited=prior;
      const roleText=properties.filter(r=>/role|funcao|posicao|position|classification|classificacao/.test(key(r))).map(r=>r.value).join(' ');
      for(const k of ['NominalDiameter','LongitudinalBarNominalDiameter','TransverseBarNominalDiameter'])if(bar[k]!=null)out.push({value:format(bar[k],k),roleText});
      for(const row of properties)if(/diameter|diametro|bitola/.test(key(row)))out.push({...row,roleText:roleText+' '+row.key+' '+row.group});
      return out;
    }"""
new="""    function barRows(barID){
      const bar=line(barID),out=[],start=rows.length,prior=visited;visited=new Set();
      objectProperties(barID,'Barra · ');
      const properties=rows.splice(start);visited=prior;
      let typeText='';
      for(const rel of index('IFCRELDEFINESBYTYPE','RelatedObjects').get(barID)||[]){
        const t=line(rel.RelatingType);if(!t)continue;
        typeText+=' '+[name(t.Name),name(t.ObjectType),name(t.PredefinedType)].filter(Boolean).join(' ');
        for(const k of ['NominalDiameter','LongitudinalBarNominalDiameter','TransverseBarNominalDiameter'])if(t[k]!=null)out.push({value:format(t[k],k),roleText:typeText});
      }
      const roleText=(properties.filter(r=>/role|funcao|posicao|position|classification|classificacao/.test(key(r))).map(r=>r.value).join(' ')+' '+typeText).trim();
      for(const k of ['NominalDiameter','LongitudinalBarNominalDiameter','TransverseBarNominalDiameter'])if(bar[k]!=null)out.push({value:format(bar[k],k),roleText});
      for(const row of properties)if(/diameter|diametro|bitola/.test(key(row)))out.push({...row,roleText:roleText+' '+row.key+' '+row.group});
      return out;
    }"""
if old in prop:
    prop=prop.replace(old,new,1)
elif "let typeText=''" not in prop:
    raise SystemExit('barRows block not found')
prop=prop.replace("if(/estrib|stirrup|shear|transversal/.test(t))return 'Estribos · transversal';","if(/estrib|stirrup|ligature|tie|shear|transversal/.test(t))return 'Estribos · transversal';")
prop_path.write_text(prop,encoding='utf-8')

# --- app.js: geometric fallback association for rebar actually crossing the host member ---
app_path=Path('dist/app.js')
app=app_path.read_text(encoding='utf-8')
marker='async function select(mesh){'
helper=r'''function ggAugmentRebarGeometry(info){
 if(!info||info.unresolvedSteel||!inspector||!T||!/IFCBEAM|IFCCOLUMN|IFCSLAB|IFCWALL|IFCFOOTING|IFCPILE|IFCMEMBER|IFCPLATE/.test(String(info.type||'')))return info;
 const hosts=meshes.filter(m=>m.userData.id===info.id);if(!hosts.length)return info;
 const hostBox=new T.Box3();for(const m of hosts)hostBox.union(new T.Box3().setFromObject(m));if(hostBox.isEmpty())return info;
 const size=hostBox.getSize(new T.Vector3()),margin=Math.max(.008,Math.max(size.x,size.y,size.z)*.006);hostBox.expandByScalar(margin);
 const ids=new Set(info.sectionCandidates||[]);for(const item of info.linked||[])ids.add(item.id);
 for(const m of meshes){if(!isSteel(m.userData.type)||m.userData.id===info.id)continue;const bb=new T.Box3().setFromObject(m);if(hostBox.intersectsBox(bb))ids.add(m.userData.id);}
 if(!ids.size)return info;
 const meta=new Map((info.reinforcementBars||[]).map(b=>[Number(b.id),b]));
 for(const id of ids){if(meta.has(Number(id)))continue;try{const b=inspector.read(Number(id),{withRelated:false,resolveHost:false}),r=(b?.reinforcementBars||[]).find(x=>Number(x.id)===Number(id));if(r)meta.set(Number(id),r);}catch(e){console.warn('Falha ao ler barra #'+id,e)}}
 info.sectionCandidates=[...ids];info.reinforcementBars=[...meta.values()];
 const linked=new Map((info.linked||[]).map(x=>[Number(x.id),x]));for(const id of ids)if(!linked.has(Number(id)))linked.set(Number(id),{id:Number(id),name:meshes.find(m=>m.userData.id===Number(id))?.userData?.name||''});info.linked=[...linked.values()];
 const grouped=new Map();for(const b of info.reinforcementBars){const label=String(b.role||'Sem classificação no IFC').split(' / ')[0]||'Sem classificação no IFC';if(!grouped.has(label))grouped.set(label,new Set());for(const d of b.diameters||[])grouped.get(label).add(d);}
 if(Array.isArray(info.reinforcement))info.reinforcement=info.reinforcement.map(([label,value,metaRow={}])=>{const vals=grouped.get(label);return vals?.size?[label,[...vals].join(' / '),{...metaRow,missing:false,note:'Barras associadas pela geometria do elemento e diâmetro declarado no IFC.'}]:[label,value,metaRow]});
 info.barAssociation='Barras associadas pela interseção geométrica com o elemento; diâmetros lidos diretamente do IFC.';return info;
}
'''
if 'function ggAugmentRebarGeometry(info){' not in app:
    if marker not in app: raise SystemExit('select marker not found')
    app=app.replace(marker,helper+marker,1)
old_select="elementInfo=propertyCache.get(mesh.userData.id);$('elementName').textContent=elementInfo.name;"
new_select="elementInfo=ggAugmentRebarGeometry(propertyCache.get(mesh.userData.id));$('elementName').textContent=elementInfo.name;"
if old_select in app:
    app=app.replace(old_select,new_select,1)
elif 'elementInfo=ggAugmentRebarGeometry(propertyCache.get(mesh.userData.id))' not in app:
    raise SystemExit('selection property assignment not found')

# Diameter callouts follow the full visible section band, not only the center plane.
old_band="if(s.at<min-.01||s.at>max+.01)continue;const p=bb.getCenter(new T.Vector3());p.addScaledVector(f.n,s.at-p.dot(f.n));callouts.push({id,p,text:'Ø '+b.diameters.join(' / '),role:b.role||''});"
new_band="const halfBand=Math.max(0,Number($('sectionThickness').value)||0)/2;if(s.at<min-halfBand-.01||s.at>max+halfBand+.01)continue;const p=bb.getCenter(new T.Vector3()),spanN=max-min;if(spanN>Math.max(halfBand*1.5,.05))p.addScaledVector(f.n,s.at-p.dot(f.n));callouts.push({id,p,text:'Ø '+b.diameters.join(' / '),role:b.role||''});"
if old_band in app:
    app=app.replace(old_band,new_band,1)
elif 'const halfBand=Math.max(0,Number($(\'sectionThickness\').value)||0)/2' not in app:
    raise SystemExit('section callout band condition not found')
app_path.write_text(app,encoding='utf-8')
