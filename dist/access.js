const $ = id => document.getElementById(id);
const make = (tag,text) => {const el=document.createElement(tag);if(text)el.textContent=text;return el;};
export function installAccessManager(){
 if(location.pathname.replace(/\/+$/,'')!=='/admin')return;
 const box=make('section');box.style.cssText='border-top:1px solid #ccd6da;margin-top:20px;padding-top:16px';
 box.append(make('h3','Enviar visualização'));
 box.append(make('p','O link não exige login. Envie-o somente à pessoa escolhida; quem receber poderá visualizar este projeto, mas não poderá adicionar, substituir ou alterar arquivos.'));
 const link=make('input');link.type='url';link.placeholder='Link do projeto';link.setAttribute('aria-label','Link do projeto');
 const email=make('input');email.type='email';email.placeholder='E-mail da pessoa';email.setAttribute('aria-label','E-mail da pessoa');
 const phone=make('input');phone.type='tel';phone.placeholder='WhatsApp com DDI e DDD (opcional)';phone.setAttribute('aria-label','WhatsApp com DDI e DDD');
 for(const input of [link,email,phone])input.style.cssText='display:block;width:100%;margin:8px 0;padding:10px';
 const send=make('button','Preparar convite'),status=make('p');status.setAttribute('role','status');
 const mail=make('a','Enviar por e-mail'),wa=make('a','Enviar pelo WhatsApp');wa.target='_blank';wa.rel='noopener noreferrer';mail.hidden=wa.hidden=true;wa.style.marginLeft='12px';
 box.append(link,email,phone,send,status,mail,wa);$('shareDialog').append(box);
 function selected(){const raw=link.value.trim()||$('shareLink').value;const u=new URL(raw,location.origin);const id=u.searchParams.get('share');if(u.origin!==location.origin||!/^[a-f0-9]{32}$/.test(id||''))throw Error('Crie ou cole um link deste site.');return u.href;}
 send.onclick=()=>{mail.hidden=wa.hidden=true;try{if(!email.checkValidity()||!email.value.trim())throw Error('Informe um e-mail válido.');const url=selected();const message=`Engenheiro Gustavo Gil\nAcesse este projeto para visualização: ${url}\nNão é necessário login. O link não permite adicionar ou alterar arquivos.`;mail.href='mailto:'+encodeURIComponent(email.value.trim())+'?subject='+encodeURIComponent('Acesso ao projeto')+'&body='+encodeURIComponent(message);mail.hidden=false;const number=phone.value.replace(/\D/g,'');if(number){if(!/^\d{10,15}$/.test(number))throw Error('Confira o WhatsApp com DDI e DDD.');wa.href='https://wa.me/'+number+'?text='+encodeURIComponent(message);wa.hidden=false;}status.textContent='Convite preparado. Envie o link somente à pessoa escolhida.';}catch(e){status.textContent=e.message;}};
}
