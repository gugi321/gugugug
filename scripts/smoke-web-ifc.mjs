import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit, devices } from 'playwright';

const root=path.resolve(process.env.SMOKE_ROOT||'site');
const fixturePath=path.resolve('tests/fixtures/sample.ifc');
const fixtureBytes=fs.readFileSync(fixturePath);
const fixtureInput={name:'sample.ifc',mimeType:'application/octet-stream',buffer:fixtureBytes};
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1');
  let rel=decodeURIComponent(u.pathname).replace(/^\/+/, '')||'index.html';
  const file=path.resolve(root,rel);
  if(!file.startsWith(root)){res.statusCode=403;return res.end('forbidden')}
  fs.stat(file,(err,st)=>{
    if(err){res.statusCode=404;return res.end('not found')}
    const target=st.isDirectory()?path.join(file,'index.html'):file;
    fs.readFile(target,(e,data)=>{
      if(e){res.statusCode=404;return res.end('not found')}
      res.setHeader('content-type',mime[path.extname(target).toLowerCase()]||'application/octet-stream');
      res.setHeader('cache-control','no-store');
      res.end(data);
    });
  });
});
await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',e=>e?reject(e):resolve()));
const port=server.address().port,url=`http://127.0.0.1:${port}/`;
const diagnostics=[];
async function run(name,browserType,options={}){
  const browser=await browserType.launch({headless:true});let context,page;
  const snapshot=async()=>{
    try{return await page.evaluate(()=>({
      href:location.href,crossOriginIsolated,
      filename:document.getElementById('filename')?.textContent,
      layers:document.querySelectorAll('#layers .layer').length,
      canvases:document.querySelectorAll('#canvas canvas').length,
      count:document.getElementById('count')?.textContent,
      status:document.getElementById('status')?.textContent,
      statusHidden:document.getElementById('status')?.hidden,
      welcomeHidden:document.getElementById('welcome')?.hidden,
      fileDisabled:document.getElementById('file')?.disabled,
      fileHidden:document.getElementById('file')?.hidden,
      bodyClass:document.body.className
    }));
    }catch(error){return {snapshotError:error.message};}
  };
  try{
    context=await browser.newContext(options);
    page=await context.newPage();
    page.on('pageerror',e=>diagnostics.push(`pageerror: ${e.message}`));
    page.on('console',msg=>{if(msg.type()==='error'||msg.type()==='warning')diagnostics.push(`${msg.type()}: ${msg.text()}`);});
    page.on('requestfailed',req=>diagnostics.push(`requestfailed: ${req.url()} :: ${req.failure()?.errorText||''}`));
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:30_000});
    // The native input is intentionally hidden; the visible '+ Abrir IFC' button triggers it.
    // Smoke tests only need the input attached and enabled so setInputFiles can exercise the File API.
    await page.waitForSelector('#file',{state:'attached',timeout:20_000});
    const inputState=await page.locator('#file').evaluate(el=>({hidden:el.hidden,disabled:el.disabled,type:el.type}));
    if(inputState.disabled||inputState.type!=='file')throw new Error(`${name}: input IFC indisponível: ${JSON.stringify(inputState)}`);
    console.log(`${name} antes do IFC:`,JSON.stringify(await snapshot()));
    await page.locator('#file').setInputFiles(fixtureInput);
    await page.waitForFunction(()=>{
      const welcome=document.getElementById('welcome');
      const layers=document.querySelectorAll('#layers .layer').length;
      const canvases=document.querySelectorAll('#canvas canvas').length;
      const status=document.getElementById('status')?.textContent||'';
      return welcome?.hidden===true&&layers>=1&&canvases>=1&&!/erro|falha|não foi possível/i.test(status);
    },null,{timeout:60_000});
    const result=await snapshot();
    if(!/sample\.ifc/i.test(result.filename||'')||result.layers<1||result.canvases<1)throw new Error(`${name}: IFC não carregou corretamente: ${JSON.stringify(result)}`);
    console.log(`${name} IFC OK:`,JSON.stringify(result));
  }catch(error){
    console.error(`${name} IFC FALHOU:`,error.message);if(page)console.error(`${name} estado final:`,JSON.stringify(await snapshot()));throw error;
  }finally{await context?.close();await browser.close();}
}
try{
  await run('Android/Chromium',chromium,{...devices['Pixel 7']});
  await run('iPhone/WebKit',webkit,{...devices['iPhone 15']});
  if(diagnostics.length)console.log('Diagnósticos:',diagnostics.join('\n'));
}finally{await new Promise(resolve=>server.close(resolve));}
