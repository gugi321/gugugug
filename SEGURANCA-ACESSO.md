# Acesso do visualizador IFC

O endereço raiz abre a identidade `Eng Gustavo Gil` e depois a área reservada. O proprietário entra pelo Netlify Identity. Links com `?share=...` carregam somente o modelo indicado e não exibem controles para abrir outro IFC, enviar PDFs, criar links ou exportar o programa.

A regra principal é aplicada no servidor: qualquer `POST /api/share` precisa de uma sessão Identity válida e do papel central `owner` ou de uma correspondência com `IFC_OWNER_EMAIL`/`IFC_OWNER_ID`. O `GET` dos modelos continua público para que os links funcionem sem conta.

## Configuração única no Netlify

1. Abra **Project configuration → Identity** e clique em **Enable Identity**.
2. Em **Registration**, selecione **Invite only**. Não deixe cadastro aberto.
3. Em **Users**, convide somente a conta do proprietário e atribua `owner`.
4. Se desejar uma trava adicional, crie a variável de ambiente `IFC_OWNER_EMAIL` com o mesmo e-mail da conta (a aplicação já usa `gustavogil.ucsal@gmail.com` como padrão desta instalação) e escopo **Functions**. Também é possível usar `IFC_OWNER_ID`.
5. Faça um novo deploy depois de alterar a configuração.

Essa configuração não apaga nenhum modelo já compartilhado. Cópias HTML antigas, baixadas antes desta atualização, continuam sendo arquivos locais independentes; gere uma nova cópia somente leitura se ela precisar ser encaminhada.
