const $ = id => document.getElementById(id);
const make = (tag,text) => {const el=document.createElement(tag);if(text)el.textContent=text;return el;};
async function api(id,body){
 const r=await window.fetch(`/api/share/${id}?action=access`,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
 const data=await r.json();if(!r.ok)throw Error(data.error||'Não foi possível atualizar o acesso.');return data;
}
export function installAccessManager(){
 if(location.pathname.replace(/\/+$/,'')!=='/admin')return;
 const box=make('section');box.style.cssText='border-top:1px solid #ccd6da;margin-top:20px;padding-top:16px';
 box.append(make('h3','Pessoas autorizadas'));
 box.append(make('p','Crie o link acima ou cole um link existente. Autorize cada e-mail e envie o convite. O WhatsApp é apenas o canal para encaminhar o convite; o acesso continua vinculado ao e-mail confirmado.'));
 const link=make('input');link.type='url';link.placeholder='Link do projeto';link.setAttribute('aria-label','Link do projeto');
 const email=make('input');email.type='email';email.placeholder='E-mail da pessoa';email.setAttribute('aria-label','E-mail autorizado');
 const phone=make('input');phone.type='tel';phone.placeholder='WhatsApp com DDI e DDD (opcional)';phone.setAttribute('aria-label','WhatsApp com DDI e DDD');
 for(const input of [link,email,phone])input.style.cssText='display:block;width:100%;margin:8px 0;padding:10px';
 const add=make('button','Autorizar e-mail'),refresh=make('button','Consultar acessos'),list=make('div'),status=make('p');status.setAttribute('role','status');
 const mail=make('a','Enviar por e-mail'),wa=make('a','Enviar pelo WhatsApp');wa.target='_blank';wa.rel='noopener noreferrer';mail.hidden=wa.hidden=true;wa.style.marginLeft='12px';
 box.append(link,email,phone,add,refresh,list,status,mail,wa);$('shareDialog').append(box);
 function selected(){const raw=link.value.trim()||$('shareLink').value;const u=new URL(raw,location.origin);const id=u.searchParams.get('share');if(u.origin!==location.origin||!/^[a-f0-9]{32}$/.test(id||''))throw Error('Crie ou cole um link deste site.');return {id,url:u.origin+'/?share='+id};}
 async function render(){const {id}=selected();const data=await api(id);list.replaceChildren();for(const person of data.people){const row=make('p',person.email+' '),button=make('button','Revogar');button.onclick=async()=>{try{await api(id,{action:'revoke',email:person.email});await render();status.textContent='Acesso revogado. Novas leituras serão bloqueadas.';}catch(e){status.textContent=e.message;}};row.append(button);list.append(row);}if(!data.people.length)list.textContent='Nenhuma pessoa autorizada.';}
 refresh.onclick=async()=>{try{await render();status.textContent='Lista atualizada.';}catch(e){status.textContent=e.message;}};
 add.onclick=async()=>{mail.hidden=wa.hidden=true;try{if(!email.checkValidity()||!email.value.trim())throw Error('Informe um e-mail válido.');const {id,url}=selected();await api(id,{action:'grant',email:email.value.trim()});await render();const message=`Engenheiro Gustavo Gil\nVocê foi autorizado a visualizar este projeto: ${url}\nEntre com o e-mail ${email.value.trim()} e confirme seu endereço. Acesso somente para visualização.`;mail.href='mailto:'+encodeURIComponent(email.value.trim())+'?subject='+encodeURIComponent('Acesso ao projeto')+'&body='+encodeURIComponent(message);mail.hidden=false;const number=phone.value.replace(/\D/g,'');if(number){if(!/^\d{10,15}$/.test(number))throw Error('E-mail autorizado. Confira o WhatsApp com DDI e DDD.');wa.href='https://wa.me/'+number+'?text='+encodeURIComponent(message);wa.hidden=false;}status.textContent='E-mail autorizado. Use uma opção abaixo para enviar o convite.';}catch(e){status.textContent=e.message;}};
}

export async function requireViewer(){
 try{const own=await window.fetch('/api/auth',{credentials:'same-origin',cache:'no-store'});if(own.ok&&(await own.json()).owner)return;}catch{}
 const gate=make('section');gate.className='owner-gate';gate.style.zIndex='40';
 const card=make('div');card.className='owner-gate-card';card.append(make('h1','Acesso ao projeto'),make('p','Entre com o e-mail autorizado pelo Engenheiro Gustavo Gil.'));
 const form=make('form'),email=make('input'),password=make('input'),submit=make('button','Entrar'),register=make('button','Primeiro acesso'),recover=make('button','Esqueci a senha'),message=make('p');
 email.type='email';email.required=true;email.autocomplete='username';email.id='viewerEmail';password.type='password';password.required=true;password.autocomplete='current-password';password.id='viewerPassword';
 const elabel=make('label','E-mail');elabel.htmlFor=email.id;const plabel=make('label','Senha');plabel.htmlFor=password.id;submit.type='submit';submit.className='primary';register.type=recover.type='button';message.setAttribute('role','status');
 form.append(elabel,email,plabel,password,submit,register,recover);card.append(form,message);gate.append(card);document.body.append(gate);
 let identity;
 try{identity=await import('https://cdn.jsdelivr.net/npm/@netlify/identity@2.0.0/+esm');const callback=await identity.handleAuthCallback();const user=await identity.getUser();if(callback?.type==='recovery'){password.autocomplete='new-password';submit.textContent='Salvar nova senha';form.onsubmit=async e=>{e.preventDefault();try{await identity.updateUser({password:password.value});location.reload();}catch(error){message.textContent=error.message;}};email.required=false;email.hidden=elabel.hidden=true;await new Promise(()=>{});}if(user?.emailVerified){gate.remove();return;}}catch{message.textContent='A verificação por e-mail ainda precisa ser ativada pelo proprietário no Netlify.';submit.disabled=register.disabled=recover.disabled=true;await new Promise(()=>{});}
 await new Promise(resolve=>{
 form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{const user=await identity.login(email.value.trim(),password.value);if(!user?.emailVerified)throw Error('Confirme o e-mail recebido antes de entrar.');gate.remove();resolve();}catch(error){message.textContent=error.message||'Confira e-mail e senha.';}finally{submit.disabled=false;}};
 register.onclick=async()=>{if(!form.reportValidity())return;register.disabled=true;try{await identity.signup(email.value.trim(),password.value);message.textContent='Confira seu e-mail e confirme o endereço. Depois abra novamente este link. O cadastro não libera projetos sem autorização.';}catch(error){message.textContent=error.message;}finally{register.disabled=false;}};
 recover.onclick=async()=>{if(!email.reportValidity())return;try{await identity.requestPasswordRecovery(email.value.trim());message.textContent='Confira seu e-mail para redefinir a senha.';}catch(error){message.textContent=error.message;}};
 });
}
