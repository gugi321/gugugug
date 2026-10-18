from pathlib import Path

APP=Path('dist/app.js')
HUD=Path('dist/technical-hud-r34.js')
app=APP.read_text(encoding='utf-8')
hud=HUD.read_text(encoding='utf-8')

def patch(text, old, new, label):
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f'R35 patch point not found: {label}')
    return text.replace(old,new,1)

app=patch(app,
"""}else if(/IFCSLAB|IFCPLATE/.test(type)){
  const thick=idx.reduce((a,b)=>data.values[b]<data.values[a]?b:a,0),rest=idx.filter(i=>i!==thick).sort((a,b)=>data.values[b]-data.values[a]);labels[thick]='Esp.';labels[rest[0]]='L';labels[rest[1]]='B';""",
"""}else if(/IFCSLAB|IFCPLATE/.test(type)){
  const minValue=Math.min(...data.values),near=idx.filter(i=>data.values[i]<=minValue*1.05+.002),thick=near.reduce((a,b)=>Math.abs(data.basis[b].z)>Math.abs(data.basis[a].z)?b:a,near[0]),rest=idx.filter(i=>i!==thick).sort((a,b)=>data.values[b]-data.values[a]);labels[thick]='Esp.';labels[rest[0]]='L';labels[rest[1]]='B';""",
'slab vertical thickness')

app=patch(app,
"const width=f.hi[1]-f.lo[1],height=f.hi[2]-f.lo[2],length=f.hi[0]-f.lo[0],cross=Math.max(width,height,.05),piece=Math.max(length,cross,.1),gap=Math.max(cross*.18,Math.min(piece*.01,cross*.22),.025),labelSize=Math.max(cross*.075,Math.min(piece*.008,cross*.14),.026);",
"const width=f.hi[1]-f.lo[1],height=f.hi[2]-f.lo[2],length=f.hi[0]-f.lo[0],cross=Math.max(width,height,.05),piece=Math.max(length,cross,.1),gap=Math.max(cross*.18,Math.min(piece*.01,cross*.22),.025),labelSize=Math.max(cross*.075,Math.min(piece*.008,cross*.14),.026);\n const hostType=String(meshes.find(m=>m.userData.id===s.hostID)?.userData.type||''),uVertical=Math.abs(f.u.z),vVertical=Math.abs(f.v.z);let uLabel='B',vLabel='H';\n if(/IFCBEAM|IFCMEMBER/.test(hostType)){if(uVertical>=vVertical){uLabel='H';vLabel='B';}}\n else if(/IFCCOLUMN|IFCPILE/.test(hostType)){if(width>height){uLabel='H';vLabel='B';}}\n else if(/IFCSLAB|IFCPLATE/.test(hostType)){if(uVertical>=vVertical){uLabel='Esp.';vLabel='Larg.';}else{uLabel='Larg.';vLabel='Esp.';}}",
'section semantic axes')

app=patch(app,
"sectionDimension(u1,u2,f.v.clone().negate(),'B · '+cm(width),labelSize);sectionDimension(v1,v2,f.u,'H · '+cm(height),labelSize);",
"sectionDimension(u1,u2,f.v.clone().negate(),uLabel+' · '+cm(width),labelSize);sectionDimension(v1,v2,f.u,vLabel+' · '+cm(height),labelSize);",
'section annotation labels')

app=patch(app,
"window.GG_SECTION_INFO={width:cm(width),height:cm(height),position:Number($('sectionPosition').value),positionText:(Number($('sectionPosition').value)).toLocaleString('pt-BR')+'% · '+m(along),bars:[...new Set(uniqueCallouts.map(c=>c.text))],pieceLength:cm(length)};",
"window.GG_SECTION_INFO={width:cm(width),height:cm(height),widthLabel:uLabel,heightLabel:vLabel,position:Number($('sectionPosition').value),positionText:(Number($('sectionPosition').value)).toLocaleString('pt-BR')+'% · '+m(along),bars:[...new Set(uniqueCallouts.map(c=>c.text))],pieceLength:cm(length)};",
'section HUD labels')

hud=patch(hud,
"const chips=[`B: ${info.width||'—'}`,`H: ${info.height||'—'}`,`Peça: ${info.pieceLength||'—'}`];",
"const chips=[`${info.widthLabel||'B'}: ${info.width||'—'}`,`${info.heightLabel||'H'}: ${info.height||'—'}`,`Peça: ${info.pieceLength||'—'}`];",
'HUD semantic labels')

APP.write_text(app,encoding='utf-8')
HUD.write_text(hud,encoding='utf-8')
print('R35 semantic labels applied')
