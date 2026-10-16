# Segurança e acesso · Eng Gustavo G

Este aplicativo combina um visualizador estático de IFC/CAD/PDF com um serviço separado para publicar modelos compartilhados. A interface estática, por si só, não deve ser tratada como uma área privada autenticada: quem conhece o endereço do site consegue abrir o visualizador e trabalhar com arquivos locais no próprio navegador.

## Modelo de segurança adotado

- **Arquivos IFC e DWG abertos localmente** são processados no navegador. Selecionar um arquivo local não o publica automaticamente.
- **Publicar um IFC para compartilhamento** exige a chave secreta `SHARE_KEY` validada pelo Cloudflare Worker. Essa chave nunca deve ser gravada no repositório.
- No navegador do proprietário, a chave de publicação fica apenas em `sessionStorage`; ao encerrar a sessão/aba do navegador ela não deve ser tratada como credencial persistente.
- **Links compartilhados são somente leitura**. Eles funcionam como links-bearer: qualquer pessoa que receber o endereço poderá visualizar o modelo, por isso devem ser enviados somente às pessoas autorizadas.
- O visualizador público roda separado, em iframe limitado, sem controles de upload, publicação ou edição do projeto.
- O backend aceita publicação apenas por HTTPS, valida origem, limites de tamanho, quantidade de partes e metadados.
- Partes de modelos compartilhados usam política `no-store`, reduzindo retenção em caches intermediários.
- O backend possui rota autenticada para revogação de um compartilhamento e remoção das partes armazenadas.

## Cloudflare Worker / R2

O segredo `SHARE_KEY` deve existir somente como **secret do Worker**. Nunca coloque essa chave em `share-config.json`, JavaScript, commit, issue ou mensagem pública.

Configuração mínima:

1. Vincular o bucket R2 usado pelo Worker como `PROJECTS`.
2. Criar uma `SHARE_KEY` longa, exclusiva e aleatória como secret do Worker.
3. Publicar `cloudflare/share-worker.js` no Worker.
4. Colocar somente a URL HTTPS pública do Worker em `dist/share-config.json` no campo `backend`.
5. Manter no Worker apenas as origens realmente utilizadas pelo aplicativo.

Se o domínio do aplicativo mudar, atualize a lista de origens permitidas do Worker antes de usar compartilhamento.

## Hospedagem e cabeçalhos

No Netlify, `netlify.toml` define HSTS, CSP, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, limitação de frames e políticas de cache. O GitHub Pages não aplica os cabeçalhos definidos no `netlify.toml`; por isso o aplicativo também usa controles no cliente e isolamento do visualizador público.

Para uma **área administrativa realmente privada**, a etapa seguinte deve ser colocar a aplicação de proprietário atrás de autenticação no provedor de hospedagem/controle de acesso. O segredo de publicação protege as gravações no backend, mas não transforma uma página estática pública em painel administrativo autenticado.

## Rotina operacional recomendada

- Não reutilizar `SHARE_KEY` em outros serviços.
- Trocar a chave imediatamente se houver suspeita de exposição.
- Revogar links que não devam mais funcionar.
- Não colocar dados sigilosos em nome de arquivo ou URL.
- Manter dependências e GitHub Actions atualizados somente após o build e os testes passarem.
- Manter uma branch/versão de backup antes de mudanças estruturais.
- Conferir periodicamente os alertas de dependências do GitHub.

## Limites importantes

Nenhum aplicativo web pode ser considerado absolutamente invulnerável. A segurança depende também das configurações da conta GitHub, Netlify/Cloudflare, proteção do e-mail, autenticação em dois fatores, controle de segredos e atualização das dependências. O objetivo deste projeto é reduzir a superfície de ataque e impedir gravações não autorizadas no serviço de compartilhamento sem prejudicar o uso diário do visualizador.
