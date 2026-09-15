# Acesso do visualizador IFC

O endereço raiz abre diretamente o visualizador em modo somente leitura. A área `/admin` é reservada ao proprietário e exige a sessão administrativa configurada nas variáveis do Netlify. Links com `?share=...` carregam somente o modelo indicado e não exibem controles para abrir outro IFC, enviar PDFs, criar links ou exportar o programa.

A regra principal é aplicada no servidor: qualquer `POST /api/share` precisa da sessão administrativa assinada pelo endpoint `/api/auth`. A leitura de um compartilhamento exige e-mail confirmado e previamente autorizado para aquele projeto; PDFs vinculados usam a mesma autorização do projeto principal.

## Configuração única no Netlify

1. Em **Project configuration → Environment variables**, crie `IFC_ADMIN_USERNAME`.
2. Crie `IFC_ADMIN_PASSWORD` com uma senha forte e exclusiva.
3. Crie `IFC_SESSION_SECRET` com uma sequência aleatória longa, diferente da senha.
4. Deixe as três variáveis disponíveis para **Functions** e faça um novo deploy.
5. Acesse `https://eng-gustavogil-ifc.netlify.app/admin` para carregar IFCs, PDFs e criar compartilhamentos.

O número de WhatsApp é usado apenas para enviar o convite. A autorização técnica continua vinculada ao e-mail confirmado, evitando que um link encaminhado para terceiros dê acesso ao projeto.

Essa configuração não apaga nenhum modelo já compartilhado. Cópias HTML antigas, baixadas antes desta atualização, continuam sendo arquivos locais independentes; gere uma nova cópia somente leitura se ela precisar ser encaminhada.
