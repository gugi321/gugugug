const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const {createHmac,createHash,timingSafeEqual}=require('node:crypto');
const project='a'.repeat(32),pdf='b'.repeat(32),other='c'.repeat(32),secret='local-test-only';
const db=new Map();let user=null;
const store={get:async k=>db.get(k)||null,set:async(k,v)=>db.set(k,v),setJSON:async(k,v)=>db.set(k,v),list:async({prefix})=>({blobs:[...db.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))})};
const context={getStore:()=>store,getUser:async()=>user,createHmac,createHash,timingSafeEqual,Buffer,Response,URL,Netlify:{env:{get:key=>key==='IFC_SESSION_SECRET'?secret:''}},console};vm.createContext(context);
const code=fs.readFileSync('netlify/functions/share.mjs','utf8').replace(/^import .*;\n/gm,'').replace('export default async','globalThis.handler=async').replace('export const config','const config');vm.runInContext(code,context);
for(const id of [project,pdf,other]){db.set(`shares/${id}/manifest`,{version:1,id,name:'test',size:1,total:1,state:id===project?{pdfs:[{id:pdf}]}:{}});db.set(`shares/${id}/parts/0`,new Uint8Array([1]));}
const expiry=Date.now()+60000,signature=createHmac('sha256',secret).update(String(expiry)).digest('hex');const cookie=`ifc_admin_session=${expiry}.${signature}`;
const call=(id,query='',body,cookieValue)=>context.handler(new Request(`https://example.com/api/share/${id}${query}`,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json','Origin':'https://example.com'}:{}),...(cookieValue?{Cookie:cookieValue}:{})},body:body?JSON.stringify(body):undefined}),{params:{id}});
(async()=>{
 assert.equal((await call(project)).status,403);
 assert.equal((await call(project,'?action=access',{action:'grant',email:'viewer@example.com'})).status,403);
 assert.equal((await call(project,'?action=access',{action:'grant',email:'viewer@example.com'},cookie)).status,200);
 user={email:'viewer@example.com',emailVerified:false};assert.equal((await call(project)).status,403);
 user={email:'stranger@example.com',emailVerified:true};assert.equal((await call(project)).status,403);
 user={email:'viewer@example.com',emailVerified:true};assert.equal((await call(project)).status,200);
 assert.equal((await call(pdf)).status,403);
 const result=await call(pdf,`?project=${project}&part=0`);assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'private, no-store');
 assert.equal((await call(other,`?project=${project}`)).status,403);
 assert.equal((await call(project,'',{action:'finalize'})).status,403);
 await call(project,'?action=access',{action:'revoke',email:'viewer@example.com'},cookie);
 assert.equal((await call(project)).status,403);assert.equal((await call(pdf,`?project=${project}&part=0`)).status,403);
 assert.equal((await call(project,'',undefined,cookie)).status,200);
 console.log('PASS: owner session; verified per-project access; viewer writes denied; linked PDFs only; immediate revocation; no public cache.');
})().catch(e=>{console.error(e);process.exitCode=1;});
