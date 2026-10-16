import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.env.SMOKE_ROOT || 'site');
const fixture = resolve(process.env.DWG_FIXTURE || 'tests/runtime-sample.dwg');
const mime = {
  '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.wasm':'application/wasm',
  '.png':'image/png','.svg':'image/svg+xml'
};
const server = createServer(async (req,res)=>{
  try{
    const u=new URL(req.url||'/','http://127.0.0.1');
    const rel=normalize(decodeURIComponent(u.pathname)).replace(/^[/\\]+/,'')||'index.html';
    const file=join(root,rel);
    if(!file.startsWith(root)) throw new Error('forbidden');
    const info=await stat(file);
    if(!info.isFile()) throw new Error('not-file');
    res.writeHead(200,{'Content-Type':mime[extname(file).toLowerCase()]||'application/octet-stream','Cache-Control':'no-store'});
    createReadStream(file).pipe(res);
  }catch{res.writeHead(404);res.end('not found');}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const {port}=server.address();
const url=`http://127.0.0.1:${port}/cad/index.html`;
const browser=await chromium.launch({headless:true});
let context;
let page;
const diagnostics=[];
const snapshot=async()=>{
  if(!page)return{};
  try{return await page.evaluate(()=>({
    status:document.getElementById('status')?.textContent||'',
    workerStatus:document.getElementById('workerStatus')?.textContent||'',
    emptyHidden:document.getElementById('emptyState')?.hidden,
    fitDisabled:document.getElementById('fitView')?.disabled,
    diagnostics:document.getElementById('diagnostics')?.innerText||'',
    error:document.getElementById('errorDetails')?.textContent||''
  }));}catch(error){return{snapshotError:error.message};}
};
try{
  context=await browser.newContext({viewport:{width:1280,height:800}});
  page=await context.newPage();
  page.on('pageerror',e=>diagnostics.push(`pageerror: ${e.message}`));
  page.on('console',msg=>{if(msg.type()==='error'||msg.type()==='warning')diagnostics.push(`${msg.type()}: ${msg.text()}`);});
  page.on('requestfailed',req=>diagnostics.push(`requestfailed: ${req.url()} :: ${req.failure()?.errorText||''}`));
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:30_000});
  await page.waitForSelector('#fileInput',{timeout:20_000});
  await page.locator('#fileInput').setInputFiles(fixture);
  await page.waitForFunction(()=>{
    const status=document.getElementById('status')?.textContent||'';
    return document.getElementById('emptyState')?.hidden===true && document.getElementById('fitView')?.disabled===false && /aberto/i.test(status);
  },null,{timeout:90_000});
  const result=await snapshot();
  if(!result.emptyHidden||result.fitDisabled||!/aberto/i.test(result.status||'')) throw new Error(`DWG não confirmou abertura: ${JSON.stringify(result)}`);
  console.log('DWG real OK:',JSON.stringify(result));
  if(diagnostics.length)console.warn('Avisos CAD:',diagnostics.join('\n'));
}catch(error){
  console.error('DWG REAL FALHOU:',error?.stack||error);
  console.error('Estado CAD:',JSON.stringify(await snapshot()));
  if(diagnostics.length)console.error('Console/rede CAD:',diagnostics.join('\n'));
  throw error;
}finally{
  if(context)await context.close().catch(()=>{});
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
