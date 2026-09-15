# Acesso do visualizador IFC

O endereço raiz abre diretamente o visualizador em modo somente leitura. A área `/admin` é reservada ao proprietário e exige a sessão administrativa configurada nas variáveis do Netlify. Links com `?share=...` carregam somente o modelo indicado, sem pedir login e sem exibir controles para abrir outro IFC, enviar PDFs, criar links ou exportar o programa.

A regra principal é aplicada no servidor: qualquer `POST /api/share` precisa da sessão administrativa assinada pelo endpoint `/api/auth`. Leituras `GET` do link são permitidas sem login; isso é um link-bearer, portanto o endereço deve ser enviado somente às pessoas escolhidas. PDFs vinculados são somente leitura e usam o mesmo link do projeto principal.

## Configuração única no Netlify

1. Em **Project configuration → Environment variables**, crie `IFC_ADMIN_USERNAME`.
2. Crie `IFC_ADMIN_PASSWORD` com uma senha forte e exclusiva.
3. Crie `IFC_SESSION_SECRET` com uma sequência aleatória longa, diferente da senha.
4. Deixe as três variáveis disponíveis para **Functions** e faça um novo deploy.
5. Acesse `https://eng-gustavogil-ifc.netlify.app/admin` para carregar IFCs, PDFs e criar compartilhamentos.

O e-mail e o número de WhatsApp são usados apenas para preparar o encaminhamento do convite. Não há login do visualizador; qualquer pessoa que obtenha o link poderá ver o projeto, mas não poderá gravar nada. Para restringir o acesso a uma identidade, seria necessário um mecanismo de autenticação separado.

Essa configuração não apaga nenhum modelo já compartilhado. Cópias HTML antigas, baixadas antes desta atualização, continuam sendo arquivos locais independentes; gere uma nova cópia somente leitura se ela precisar ser encaminhada.
