import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root=resolve(process.env.SMOKE_ROOT||'site');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.wasm':'application/wasm','.ifc':'application/octet-stream','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{const u=new URL(req.url||'/','http://127.0.0.1'),rel=normalize(decodeURIComponent(u.pathname)).replace(/^[/\\]+/,'')||'index.html',file=join(root,rel);if(!file.startsWith(root))throw Error('forbidden');const info=await stat(file);if(!info.isFile())throw Error('not-file');res.writeHead(200,{'Content-Type':mime[extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end('not found')}});
await new Promise((ok,bad)=>{server.once('error',bad);server.listen(0,'127.0.0.1',ok)});
const {port}=server.address(),base=`http://127.0.0.1:${port}/index.html`;
const browser=await chromium.launch({headless:true});
const diagnostics=[];

async function pageFor(fixture,count){
  const page=await browser.newPage({viewport:{width:390,height:844}});
  page.on('pageerror',e=>diagnostics.push(`pageerror: ${e.message}`));
  page.on('console',m=>{if(m.type()==='error')diagnostics.push(`console: ${m.text()}`)});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('#file').setInputFiles(resolve(fixture));
  await page.waitForFunction(expected=>document.querySelector('#count')?.textContent.includes(expected),count,{timeout:30000});
  return page;
}
function assert(ok,msg){if(!ok)throw Error(msg)}
async function hudInside(page,sel){return page.evaluate(sel=>{const e=document.querySelector(sel),r=e?.getBoundingClientRect();return Boolean(e&&!e.hidden&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight);},sel)}

try{
  // Viga armada: cotas + corte + posições 20/50/80.
  let page=await pageFor('tests/fixtures/rebar-beam.ifc','5 / 5');
  await page.evaluate(()=>window.GG_VIEWER_API.selectID(47));
  await page.getByRole('button',{name:/Isolar e cotar/i}).click();
  await page.waitForFunction(()=>!document.querySelector('#ggDimensionHud')?.hidden);
  const dims=await page.locator('#ggDimensionHudValues').innerText();
  assert(/B: 20,0 cm/.test(dims)&&/H: 40,0 cm/.test(dims)&&/L: 500,0 cm/.test(dims),'Cotas da viga não apareceram no HUD');
  assert(await hudInside(page,'#ggDimensionHud'),'HUD de cotas saiu da tela mobile');
  await page.locator('#hideDimensions').click();
  await page.getByRole('button',{name:/Ver corte transversal/i}).click();
  await page.waitForFunction(()=>!document.querySelector('#ggSectionHud')?.hidden);
  for(const pos of [20,50,80]){
    await page.locator('#ggSectionRange').fill(String(pos));
    await page.locator('#ggSectionRange').dispatchEvent('input');
    await page.waitForTimeout(180);
    const state=await page.evaluate(()=>window.GG_VIEWER_API.getSectionDebug());
    assert(state.info?.position===pos,`Corte não chegou a ${pos}%`);
    assert(state.info?.bars?.includes('Ø 12 mm'),'Ø12 não apareceu no corte');
    assert(state.rebarCallouts===2,'Chamadas de armadura inesperadas');
  }
  assert(await hudInside(page,'#ggSectionHud'),'HUD de corte saiu da tela mobile');
  const beamViewport=await page.locator('#viewport').boundingBox();
  assert(beamViewport?.height>=620,'Área 3D insuficiente no corte mobile');
  await page.close();

  // Pilar sem armadura: corte geométrico deve continuar disponível.
  page=await pageFor('tests/fixtures/pillar.ifc','1 / 1');
  await page.evaluate(()=>window.GG_VIEWER_API.selectID(16));
  const cut=page.getByRole('button',{name:'Ver corte transversal'});
  assert(await cut.isEnabled(),'Corte geométrico do pilar ficou desabilitado');
  await cut.click();
  await page.waitForFunction(()=>window.GG_VIEWER_API.getSectionDebug().active);
  const pillar=await page.evaluate(()=>window.GG_VIEWER_API.getSectionDebug().info);
  assert(pillar?.width==='30,0 cm'&&pillar?.height==='40,0 cm'&&pillar?.pieceLength==='300,0 cm','Corte do pilar com dimensões incorretas');
  assert(await hudInside(page,'#ggSectionHud'),'HUD do pilar saiu da tela mobile');
  await page.close();

  // Laje: cotas semânticas e corte geométrico.
  page=await pageFor('tests/fixtures/sample.ifc','3 / 3');
  await page.evaluate(()=>window.GG_VIEWER_API.selectID(16));
  await page.getByRole('button',{name:/Isolar e cotar/i}).click();
  await page.waitForFunction(()=>!document.querySelector('#ggDimensionHud')?.hidden);
  const slabDims=await page.locator('#ggDimensionHudValues').innerText();
  assert(/L: 600,0 cm/.test(slabDims)&&/B: 600,0 cm/.test(slabDims)&&/Esp.: 20,0 cm/.test(slabDims),'Cotas da laje incorretas');
  assert(await hudInside(page,'#ggDimensionHud'),'HUD da laje saiu da tela mobile');
  await page.locator('#hideDimensions').click();
  await page.getByRole('button',{name:'Ver corte transversal'}).click();
  await page.waitForFunction(()=>window.GG_VIEWER_API.getSectionDebug().active);
  assert(await hudInside(page,'#ggSectionHud'),'HUD de corte da laje saiu da tela mobile');
  await page.close();

  if(diagnostics.length)throw Error(diagnostics.join('\n'));
  console.log('R34 MOBILE CUTS OK: viga, pilar, laje, cotas e 20/50/80%.');
}finally{
  await browser.close();
  await new Promise(r=>server.close(r));
}
