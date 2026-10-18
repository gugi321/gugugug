from pathlib import Path

p=Path('dist/dwg.js')
t=p.read_text(encoding='utf-8')
old="try{await import('./quantities.js');b.remove();$('quantitiesOpen')?.click()}"
new="try{const mod=await import('./quantities.js');mod.installQuantities?.();b.remove();$('quantitiesOpen')?.click()}"
if old in t:
    t=t.replace(old,new,1)
elif new not in t:
    raise SystemExit('Quantities lazy launcher pattern not found')
t=t.replace("15/10/2026 · compartilhamento R9 · cotas ampliadas","18/10/2026 · R16 leve · corte otimizado")
p.write_text(t,encoding='utf-8')

# Keep the R16 generator consistent if it is run again later.
g=Path('scripts/patch-performance-r16.py')
s=g.read_text(encoding='utf-8')
s=s.replace("try{await import('./quantities.js');b.remove();$('quantitiesOpen')?.click()}","try{const mod=await import('./quantities.js');mod.installQuantities?.();b.remove();$('quantitiesOpen')?.click()}")
needle="dwg = p.read_text(encoding='utf-8')\n"
addition="dwg = p.read_text(encoding='utf-8')\ndwg = dwg.replace(\"15/10/2026 · compartilhamento R9 · cotas ampliadas\", \"18/10/2026 · R16 leve · corte otimizado\")\n"
if needle in s and addition not in s:
    s=s.replace(needle,addition,1)
g.write_text(s,encoding='utf-8')

print('R16 lazy launchers fixed')
