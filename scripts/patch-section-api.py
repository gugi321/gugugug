from pathlib import Path

# Deterministic section diagnostics patch, validated by GitHub Actions.
app = Path('dist/app.js')
text = app.read_text(encoding='utf-8')

# Mark rebar arrows so automated tests can count real callouts.
needle = "const arrow=new T.ArrowHelper(dir,labelPos,dist,0xff8b42,Math.min(labelSize*.7,dist*.32),Math.min(labelSize*.36,dist*.16));"
if needle in text and "arrow.userData.ggRebarCallout=true" not in text:
    text = text.replace(needle, needle + "arrow.userData.ggRebarCallout=true;", 1)

# Add deterministic internal diagnostics to the already-public viewer API.
old = "modeForID:id=>{const m=meshes.find(x=>x.userData.id===id);return m?ggModeFor(m):null},\n setCut:ggSetCut"
new = """modeForID:id=>{const m=meshes.find(x=>x.userData.id===id);return m?ggModeFor(m):null},
 selectID:async id=>{const n=Number(id),m=meshes.find(x=>x.userData.id===n);if(!m)return null;await select(m);return {selectedID:selected?.userData?.id??null,elementID:elementInfo?.id??null,type:elementInfo?.type??null,name:elementInfo?.name??null,sectionCandidates:[...(elementInfo?.sectionCandidates||[])],reinforcementBars:(elementInfo?.reinforcementBars||[]).map(b=>({id:b.id,role:b.role,diameters:[...(b.diameters||[])]})),linked:(elementInfo?.linked||[]).map(x=>x.id)};},
 openSelectedSection:()=>{openElementSection();return Boolean(elementSection);},
 getSelectionDebug:()=>({selectedID:selected?.userData?.id??null,elementID:elementInfo?.id??null,type:elementInfo?.type??null,name:elementInfo?.name??null,sectionCandidates:[...(elementInfo?.sectionCandidates||[])],reinforcementBars:(elementInfo?.reinforcementBars||[]).map(b=>({id:b.id,role:b.role,diameters:[...(b.diameters||[])]})),linked:(elementInfo?.linked||[]).map(x=>x.id)}),
 getSectionDebug:()=>({active:Boolean(elementSection),hostID:elementSection?.hostID??null,ids:[...(elementSection?.ids||[])],info:window.GG_SECTION_INFO||null,contextChildren:sectionContextGroup?.children?.length||0,annotationChildren:sectionAnnotationGroup?.children?.length||0,rebarCallouts:sectionAnnotationGroup?.children?.filter(x=>x.userData?.ggRebarCallout).length||0}),
 setCut:ggSetCut"""
if old in text:
    text = text.replace(old, new, 1)
elif 'selectID:async id=>' not in text:
    raise SystemExit('GG_VIEWER_API insertion point not found')
app.write_text(text, encoding='utf-8')

index = Path('dist/index.html')
html = index.read_text(encoding='utf-8')
old_scripts = '<script type="module" src="app.js"></script><script type="module" src="dwg.js"></script>'
new_scripts = '<script type="module" src="app.js"></script><script type="module" src="dimensions-r9.js"></script><script type="module" src="dwg.js"></script>'
if old_scripts in html:
    html = html.replace(old_scripts, new_scripts, 1)
elif 'src="dimensions-r9.js"' not in html:
    raise SystemExit('index script insertion point not found')
index.write_text(html, encoding='utf-8')
