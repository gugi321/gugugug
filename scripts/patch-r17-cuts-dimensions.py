from pathlib import Path

p=Path('dist/app.js')
s=p.read_text(encoding='utf-8')

def rep(old,new,label):
    global s
    if old not in s:
        raise SystemExit(f'missing: {label}')
    s=s.replace(old,new,1)

old="""const measureText=value=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:2}).format(value*100)+' cm';
function dimensionLabel(text,position,size){
"""
new="""const measureText=value=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:2}).format(value*100)+' cm';
function dimensionLabels(data){
 const type=String(meshes.find(m=>m.userData.id===data.hostID)?.userData.type||''),idx=[0,1,2],labels=['A','B','C'];
 const longest=idx.reduce((a,b)=>data.values[b]>data.values[a]?b:a,0),vertical=idx.reduce((a,b)=>Math.abs(data.basis[b].z)>Math.abs(data.basis[a].z)?b:a,0);
 if(/IFCBEAM|IFCMEMBER/.test(type)){
  labels[longest]='L';const rest=idx.filter(i=>i!==longest),h=rest.reduce((a,b)=>Math.abs(data.basis[b].z)>Math.abs(data.basis[a].z)?b:a,rest[0]);labels[h]='H';labels[rest.find(i=>i!==h)]='B';
 }else if(/IFCCOLUMN|IFCPILE/.test(type)){
  labels[longest]='L';const rest=idx.filter(i=>i!==longest).sort((a,b)=>data.values[a]-data.values[b]);labels[rest[0]]='B';labels[rest[1]]='H';
 }else if(/IFCSLAB|IFCPLATE/.test(type)){
  const thick=idx.reduce((a,b)=>data.values[b]<data.values[a]?b:a,0),rest=idx.filter(i=>i!==thick).sort((a,b)=>data.values[b]-data.values[a]);labels[thick]='Esp.';labels[rest[0]]='L';labels[rest[1]]='B';
 }else if(/IFCWALL/.test(type)){
  const thick=idx.reduce((a,b)=>data.values[b]<data.values[a]?b:a,0),rest=idx.filter(i=>i!==thick),h=rest.reduce((a,b)=>Math.abs(data.basis[b].z)>Math.abs(data.basis[a].z)?b:a,rest[0]);labels[thick]='Esp.';labels[h]='H';labels[rest.find(i=>i!==h)]='L';
 }
 return labels;
}
function dimensionLabel(text,position,size){
"""
rep(old,new,'dimensionLabels insert')

old="""function buildDimensions(hostID){
 clearDimensions();const data=measureElement(hostID);if(!data)return;dimensionData=data;dimensionGroup=new T.Group();scene.add(dimensionGroup);
 const max=Math.max(...data.values,.1),offset=max*.11,labelHeight=max*(mobileLayout()?.042:.034);
 for(let i=0;i<3;i++){
  const start=[...data.lo],end=[...data.lo],j=(i+1)%3;start[j]-=offset;end[j]-=offset;end[i]=data.hi[i];
  const a=dimensionPoint(data,start),b=dimensionPoint(data,end),refA=[...start],refB=[...end];refA[j]=refB[j]=data.lo[j];
  const positions=[...a.toArray(),...b.toArray(),...dimensionPoint(data,refA).toArray(),...a.toArray(),...dimensionPoint(data,refB).toArray(),...b.toArray()];
  const tick=data.basis[j].clone().multiplyScalar(offset*.12);for(const endpoint of [a,b])positions.push(...endpoint.clone().sub(tick).toArray(),...endpoint.clone().add(tick).toArray());
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));const line=new T.LineSegments(g,new T.LineBasicMaterial({color:0x24748d,depthTest:false,depthWrite:false}));line.renderOrder=20;dimensionGroup.add(line);
  dimensionLabel(String.fromCharCode(65+i)+' · '+measureText(data.values[i]),a.clone().add(b).multiplyScalar(.5).addScaledVector(data.basis[j],-offset*.24),labelHeight);
 }
 $('dimensionValues').replaceChildren();for(let i=0;i<3;i++){const value=document.createElement('span');value.textContent=String.fromCharCode(65+i)+': '+measureText(data.values[i]);$('dimensionValues').append(value)}
 $('dimensionPanel').hidden=false;document.body.classList.add('dimensions-active');
}
"""
new="""function buildDimensions(hostID){
 clearDimensions();const data=measureElement(hostID);if(!data)return;data.labels=dimensionLabels(data);dimensionData=data;dimensionGroup=new T.Group();scene.add(dimensionGroup);
 const max=Math.max(...data.values,.1);
 for(let i=0;i<3;i++){
  const others=[0,1,2].filter(k=>k!==i),j=others.slice().sort((a,b)=>data.values[a]-data.values[b])[0],localScale=Math.max(Math.min(...others.map(k=>data.values[k])),.05),offset=Math.max(localScale*.2,max*.012,.025),labelHeight=Math.max(localScale*(mobileLayout()?.14:.11),max*.007,.024);
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
"""
rep(old,new,'buildDimensions')

old=""" section('Medido no modelo — extensões totais nos eixos locais',dimensionData.values.map((v,i)=>['Eixo '+String.fromCharCode(65+i),measureText(v)]));section('Dados do IFC — propriedades e valores interpretados',elementInfo.fields);section('Armaduras — dados e identificação no IFC',elementInfo.reinforcement||[]);
"""
new=""" section('Medido no modelo — extensões totais nos eixos locais',dimensionData.values.map((v,i)=>[dimensionData.labels?.[i]||('Eixo '+String.fromCharCode(65+i)),measureText(v)]));section('Dados do IFC — propriedades e valores interpretados',elementInfo.fields);section('Armaduras — dados e identificação no IFC',elementInfo.reinforcement||[]);
"""
rep(old,new,'print semantic labels')

old=""" const width=f.hi[1]-f.lo[1],height=f.hi[2]-f.lo[2],length=f.hi[0]-f.lo[0],cross=Math.max(width,height,.05),piece=Math.max(length,cross,.1),gap=cross*.16+piece*.012,labelSize=Math.max(cross*.09,piece*.023,.035);
 const u1=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,f.lo[1]).addScaledVector(f.v,f.lo[2]-gap),u2=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,f.hi[1]).addScaledVector(f.v,f.lo[2]-gap);
 const v1=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,f.hi[1]+gap).addScaledVector(f.v,f.lo[2]),v2=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,f.hi[1]+gap).addScaledVector(f.v,f.hi[2]);
 const cm=v=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}).format(v*100)+' cm';
 sectionDimension(u1,u2,f.v.clone().negate(),'B · '+cm(width),labelSize);sectionDimension(v1,v2,f.u,'H · '+cm(height),labelSize);
"""
new=""" const width=f.hi[1]-f.lo[1],height=f.hi[2]-f.lo[2],length=f.hi[0]-f.lo[0],cross=Math.max(width,height,.05),piece=Math.max(length,cross,.1),gap=Math.max(cross*.18,Math.min(piece*.01,cross*.22),.025),labelSize=Math.max(cross*.075,Math.min(piece*.008,cross*.14),.026);
 const u1=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,f.lo[1]).addScaledVector(f.v,f.lo[2]-gap),u2=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,f.hi[1]).addScaledVector(f.v,f.lo[2]-gap);
 const v1=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,f.hi[1]+gap).addScaledVector(f.v,f.lo[2]),v2=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,f.hi[1]+gap).addScaledVector(f.v,f.hi[2]);
 const ue1=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,f.lo[1]).addScaledVector(f.v,f.lo[2]),ue2=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,f.hi[1]).addScaledVector(f.v,f.lo[2]),ve1=ue2.clone(),ve2=f.n.clone().multiplyScalar(s.at).addScaledVector(f.u,f.hi[1]).addScaledVector(f.v,f.hi[2]);
 const cm=v=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}).format(v*100)+' cm',along=Math.max(0,s.at-f.lo[0]),m=v=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(v)+' m';
 sectionLine([ue1,u1,ue2,u2,ve1,v1,ve2,v2],0x7bc7d7);sectionDimension(u1,u2,f.v.clone().negate(),'B · '+cm(width),labelSize);sectionDimension(v1,v2,f.u,'H · '+cm(height),labelSize);
"""
rep(old,new,'section scales and extension lines')

old="""uniqueCallouts.slice(0,6).forEach((c,i)=>{let radial=c.p.clone().sub(planeCenter);radial.addScaledVector(f.n,-radial.dot(f.n));if(radial.lengthSq()<1e-8)radial=(i%2?f.u:f.v).clone();radial.normalize();const labelPos=c.p.clone().addScaledVector(radial,cross*(.28+(i%3)*.07)+piece*.014).addScaledVector(f.n,piece*.008);const dir=c.p.clone().sub(labelPos),dist=dir.length();if(dist>.001){dir.normalize();const arrow=new T.ArrowHelper(dir,labelPos,dist,0xff8b42,Math.min(labelSize*.7,dist*.32),Math.min(labelSize*.36,dist*.16));arrow.userData.ggRebarCallout=true;arrow.line.material.depthTest=false;arrow.cone.material.depthTest=false;arrow.line.renderOrder=58;arrow.cone.renderOrder=58;sectionAnnotationGroup.add(arrow);}sectionSprite(c.text,labelPos,labelSize*.82);});
 window.GG_SECTION_INFO={width:cm(width),height:cm(height),position:Number($('sectionPosition').value),bars:[...new Set(uniqueCallouts.map(c=>c.text))],pieceLength:cm(length)};window.dispatchEvent(new CustomEvent('gg-section-update'));
"""
new="""uniqueCallouts.slice(0,6).forEach((c,i)=>{let radial=c.p.clone().sub(planeCenter);radial.addScaledVector(f.n,-radial.dot(f.n));if(radial.lengthSq()<1e-8)radial=(i%2?f.u:f.v).clone();radial.normalize();const labelPos=c.p.clone().addScaledVector(radial,cross*(.24+(i%3)*.065)+Math.min(piece*.006,cross*.08)).addScaledVector(f.n,Math.min(piece*.004,cross*.05));const dir=c.p.clone().sub(labelPos),dist=dir.length();if(dist>.001){dir.normalize();const arrow=new T.ArrowHelper(dir,labelPos,dist,0xff8b42,Math.min(labelSize*.62,dist*.3),Math.min(labelSize*.3,dist*.14));arrow.userData.ggRebarCallout=true;arrow.line.material.depthTest=false;arrow.cone.material.depthTest=false;arrow.line.renderOrder=58;arrow.cone.renderOrder=58;sectionAnnotationGroup.add(arrow);}sectionSprite(c.text,labelPos,labelSize*.78);});
 window.GG_SECTION_INFO={width:cm(width),height:cm(height),position:Number($('sectionPosition').value),positionText:(Number($('sectionPosition').value)).toLocaleString('pt-BR')+'% · '+m(along),bars:[...new Set(uniqueCallouts.map(c=>c.text))],pieceLength:cm(length)};window.dispatchEvent(new CustomEvent('gg-section-update'));
"""
rep(old,new,'section callouts and position')

p.write_text(s,encoding='utf-8')

p=Path('dist/dimensions-r9.js')
s=p.read_text(encoding='utf-8')
old="function sectionValues(){const s=window.GG_SECTION_INFO;if(!s)return [];return [`B: ${s.width}`,`H: ${s.height}`,`Peça: ${s.pieceLength}`,...(s.bars||[]).slice(0,6)];}"
new="function sectionValues(){const s=window.GG_SECTION_INFO;if(!s)return [];return [`B: ${s.width}`,`H: ${s.height}`,`L: ${s.pieceLength}`,s.positionText?`Corte: ${s.positionText}`:'',...(s.bars||[]).slice(0,6)].filter(Boolean);}"
if old not in s: raise SystemExit('missing: dimension overlay sectionValues')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('R17 cut/dimension patch applied')
