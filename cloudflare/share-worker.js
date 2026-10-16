const ALLOWED_ORIGINS = new Set([
  'https://gugi321.github.io',
  'https://eng-gustavogil.netlify.app',
  'https://eng-gustavogil-ifc.netlify.app'
]);

const BASE_SECURITY_HEADERS = {
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'X-Robots-Tag':'noindex, nofollow, noarchive',
  'Cross-Origin-Resource-Policy':'cross-origin'
};

function originOf(request){
  return request.headers.get('Origin') || '';
}

function originAllowed(request){
  const origin=originOf(request);
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function cors(request){
  const origin=originOf(request);
  const headers={
    ...BASE_SECURITY_HEADERS,
    'Vary':'Origin',
    'Access-Control-Allow-Methods':'GET,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type,X-GG-Share-Key,X-GG-Total',
    'Access-Control-Max-Age':'3600'
  };
  if(origin && ALLOWED_ORIGINS.has(origin)) headers['Access-Control-Allow-Origin']=origin;
  return headers;
}

function json(request,body,status=200){
  return new Response(JSON.stringify(body),{
    status,
    headers:{
      'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'no-store, max-age=0',
      ...cors(request)
    }
  });
}

function validId(value){return /^[a-f0-9]{32}$/i.test(value||'');}
function validPart(value){const n=Number(value);return Number.isInteger(n)&&n>=0&&n<256;}
function cleanName(value){
  return String(value||'projeto.ifc').replace(/[\u0000-\u001f\u007f\\/]/g,'_').trim().slice(0,180)||'projeto.ifc';
}

async function digest(value){
  return new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value||''))));
}

async function secureEqual(a,b){
  const [da,db]=await Promise.all([digest(a),digest(b)]);
  if(da.length!==db.length)return false;
  let diff=0;
  for(let i=0;i<da.length;i++)diff|=da[i]^db[i];
  return diff===0;
}

async function authorized(request,env){
  const expected=String(env.SHARE_KEY||'');
  const provided=request.headers.get('X-GG-Share-Key')||'';
  if(!expected || !provided || provided.length>256) return false;
  return secureEqual(expected,provided);
}

function sanitizeState(value){
  const state=value&&typeof value==='object'?value:{};
  const axis=['x','y','z'].includes(state.cutAxis)?state.cutAxis:'z';
  return {
    opacity:Math.max(0,Math.min(95,Number(state.opacity)||0)),
    edges:Boolean(state.edges),
    showGrid:state.showGrid!==false,
    cut:Boolean(state.cut),
    cutAxis:axis,
    cutPosition:Math.max(0,Math.min(100,Number(state.cutPosition)||50))
  };
}

export default {
  async fetch(request,env){
    if(!originAllowed(request)) return json(request,{error:'Origem não autorizada.'},403);
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors(request)});

    const url=new URL(request.url);
    if(url.pathname==='/health') return json(request,{ok:true,service:'eng-gustavo-g-project-share',version:'r10'});

    const revokeMatch=url.pathname.match(/^\/share\/([a-f0-9]{32})$/i);
    if(revokeMatch && request.method==='DELETE'){
      if(!(await authorized(request,env))) return json(request,{error:'Não autorizado para revogar.'},401);
      const id=revokeMatch[1].toLowerCase();
      const metaKey=`shares/${id}/meta.json`;
      const object=await env.PROJECTS.get(metaKey);
      if(!object) return json(request,{error:'Compartilhamento não encontrado.'},404);
      let meta={};
      try{meta=await object.json();}catch{}
      const total=Number(meta.total)||0;
      await Promise.all(Array.from({length:Math.min(Math.max(total,0),256)},(_,i)=>env.PROJECTS.delete(`shares/${id}/parts/${String(i).padStart(3,'0')}.bin`)));
      await env.PROJECTS.delete(metaKey);
      return json(request,{ok:true,id,revoked:true});
    }

    const metaMatch=url.pathname.match(/^\/share\/([a-f0-9]{32})\/meta$/i);
    if(metaMatch){
      const id=metaMatch[1].toLowerCase();
      const key=`shares/${id}/meta.json`;
      if(request.method==='PUT'){
        if(!(await authorized(request,env))) return json(request,{error:'Não autorizado para publicar.'},401);
        const raw=await request.text();
        if(raw.length>65536) return json(request,{error:'Metadados muito grandes.'},413);
        let meta;try{meta=JSON.parse(raw);}catch{return json(request,{error:'Metadados inválidos.'},400);}
        if(meta.id!==id||!Number.isInteger(meta.total)||meta.total<1||meta.total>256||!Number.isSafeInteger(meta.size)||meta.size<1||meta.size>1073741824){
          return json(request,{error:'Metadados fora dos limites.'},400);
        }
        const clean={
          id,
          name:cleanName(meta.name),
          size:meta.size,
          total:meta.total,
          created:new Date().toISOString(),
          permission:'view',
          state:sanitizeState(meta.state)
        };
        await env.PROJECTS.put(key,JSON.stringify(clean),{httpMetadata:{contentType:'application/json'}});
        return json(request,{ok:true,id});
      }
      if(request.method==='GET'){
        const object=await env.PROJECTS.get(key);
        if(!object) return json(request,{error:'Compartilhamento não encontrado.'},404);
        return new Response(object.body,{headers:{
          'Content-Type':'application/json; charset=utf-8',
          'Cache-Control':'no-store, max-age=0',
          ...cors(request)
        }});
      }
      return json(request,{error:'Método não permitido.'},405);
    }

    const partMatch=url.pathname.match(/^\/share\/([a-f0-9]{32})\/part\/(\d{1,3})$/i);
    if(partMatch){
      const id=partMatch[1].toLowerCase(),part=partMatch[2];
      if(!validId(id)||!validPart(part)) return json(request,{error:'Parte inválida.'},400);
      const partNumber=Number(part);
      const key=`shares/${id}/parts/${String(partNumber).padStart(3,'0')}.bin`;
      if(request.method==='PUT'){
        if(!(await authorized(request,env))) return json(request,{error:'Não autorizado para publicar.'},401);
        const total=Number(request.headers.get('X-GG-Total'));
        if(!Number.isInteger(total)||total<1||total>256||partNumber>=total) return json(request,{error:'Total de partes inválido.'},400);
        const length=Number(request.headers.get('Content-Length')||0);
        if(length>16*1024*1024) return json(request,{error:'Parte acima de 16 MB.'},413);
        await env.PROJECTS.put(key,request.body,{httpMetadata:{contentType:'application/octet-stream'}});
        return json(request,{ok:true,part:partNumber});
      }
      if(request.method==='GET'){
        const object=await env.PROJECTS.get(key);
        if(!object) return json(request,{error:'Parte não encontrada.'},404);
        return new Response(object.body,{headers:{
          'Content-Type':'application/octet-stream',
          'Cache-Control':'private, no-store, max-age=0',
          'Content-Disposition':'inline',
          ...cors(request)
        }});
      }
      return json(request,{error:'Método não permitido.'},405);
    }

    return json(request,{error:'Rota não encontrada.'},404);
  }
};
