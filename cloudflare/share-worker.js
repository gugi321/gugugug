const ALLOWED_ORIGINS = [
  'https://gugi321.github.io',
  'https://eng-gustavogil.netlify.app'
];

function cors(request){
  const origin=request.headers.get('Origin')||'';
  const allow=ALLOWED_ORIGINS.includes(origin)?origin:ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin':allow,
    'Vary':'Origin',
    'Access-Control-Allow-Methods':'GET,PUT,OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type,X-GG-Share-Key,X-GG-Total',
    'Access-Control-Max-Age':'86400'
  };
}

function json(request,body,status=200){
  return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8',...cors(request)}});
}

function validId(value){return /^[a-f0-9]{32}$/i.test(value||'');}
function validPart(value){const n=Number(value);return Number.isInteger(n)&&n>=0&&n<256;}
function authorized(request,env){
  const expected=String(env.SHARE_KEY||'');
  const provided=request.headers.get('X-GG-Share-Key')||'';
  return expected&&provided&&provided===expected;
}

export default {
  async fetch(request,env){
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors(request)});
    const url=new URL(request.url);
    if(url.pathname==='/health') return json(request,{ok:true,service:'gg-project-share-r9'});

    const metaMatch=url.pathname.match(/^\/share\/([a-f0-9]{32})\/meta$/i);
    if(metaMatch){
      const id=metaMatch[1].toLowerCase();
      const key=`shares/${id}/meta.json`;
      if(request.method==='PUT'){
        if(!authorized(request,env)) return json(request,{error:'Não autorizado para publicar.'},401);
        const raw=await request.text();
        if(raw.length>65536) return json(request,{error:'Metadados muito grandes.'},413);
        let meta;try{meta=JSON.parse(raw);}catch{return json(request,{error:'Metadados inválidos.'},400);}
        if(meta.id!==id||!Number.isInteger(meta.total)||meta.total<1||meta.total>256||!Number.isFinite(meta.size)||meta.size<1||meta.size>1073741824){
          return json(request,{error:'Metadados fora dos limites.'},400);
        }
        await env.PROJECTS.put(key,JSON.stringify(meta),{httpMetadata:{contentType:'application/json'}});
        return json(request,{ok:true,id});
      }
      if(request.method==='GET'){
        const object=await env.PROJECTS.get(key);
        if(!object) return json(request,{error:'Compartilhamento não encontrado.'},404);
        return new Response(object.body,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...cors(request)}});
      }
      return json(request,{error:'Método não permitido.'},405);
    }

    const partMatch=url.pathname.match(/^\/share\/([a-f0-9]{32})\/part\/(\d{1,3})$/i);
    if(partMatch){
      const id=partMatch[1].toLowerCase(),part=partMatch[2];
      if(!validId(id)||!validPart(part)) return json(request,{error:'Parte inválida.'},400);
      const key=`shares/${id}/parts/${String(Number(part)).padStart(3,'0')}.bin`;
      if(request.method==='PUT'){
        if(!authorized(request,env)) return json(request,{error:'Não autorizado para publicar.'},401);
        const total=Number(request.headers.get('X-GG-Total'));
        if(!Number.isInteger(total)||total<1||total>256) return json(request,{error:'Total de partes inválido.'},400);
        const length=Number(request.headers.get('Content-Length')||0);
        if(length>16*1024*1024) return json(request,{error:'Parte acima de 16 MB.'},413);
        await env.PROJECTS.put(key,request.body,{httpMetadata:{contentType:'application/octet-stream'}});
        return json(request,{ok:true,part:Number(part)});
      }
      if(request.method==='GET'){
        const object=await env.PROJECTS.get(key);
        if(!object) return json(request,{error:'Parte não encontrada.'},404);
        return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Cache-Control':'public, max-age=31536000, immutable',...cors(request)}});
      }
      return json(request,{error:'Método não permitido.'},405);
    }

    return json(request,{error:'Rota não encontrada.'},404);
  }
};
