# Versões do visualizador IFC

## Ponto de retorno solicitado: antes das cotas e da aba de PDFs

- Tag: `antes-das-cotas-2026-09-13`
- Commit: `f07a6e5fdb506810ef70232d70bd9bada81e4582`
- Deploy Netlify: `6aa714ea9a24fc0d74756537`
- Cópia persistente: `IFC-versao-anterior-as-cotas.zip` (`libfile_ec1a3c3a28388191926a84d1203c9342`).
- Site: `aab275a5-d207-4472-810a-c8c6cf293f78`.

Se Gustavo pedir para voltar à versão anterior às cotas, publicar o conteúdo dessa tag no mesmo site. Preservar os modelos e PDFs do armazenamento. A cópia contém o código e as instruções de restauração, sem os IFCs enviados pelos usuários.

## Cotas e projetos em PDF

Cotas: extensões dos vértices reais nos eixos locais de referência A/B/C, apresentadas como medidas do modelo. Não são automaticamente vão livre, seção constante ou detalhamento executivo. Ficha imprimível mantém dados IFC e medidas separados.

PDFs: até 40 arquivos de 100 MB por modelo. Upload em partes de 4 MB pela API já existente. A organização é guardada neste navegador e incluída nos novos links do IFC. Links antigos mantêm seus metadados; PDFs continuam armazenados ao serem removidos de uma lista. Sugestões de vínculo usam apenas o nome do arquivo e requerem confirmação.

## Bloqueio de compartilhamentos

A versão atual separa a área do proprietário dos links compartilhados. O navegador público carrega o modelo associado ao link em modo somente visualização; controles de IFC, PDF, compartilhamento e exportação ficam ocultos e o endpoint `/api/share` rejeita todo POST sem uma sessão Netlify Identity autorizada.

A restauração da tag acima é somente um retorno visual/histórico. Ela antecede este bloqueio e reabre o endpoint de gravação; se for publicada, reaplique as correções de autenticação antes de usar o site publicamente.

Para liberar o proprietário no Netlify: ative o Identity do projeto, mude Registration para Invite only e atribua à única conta autorizada o papel `owner`. Opcionalmente defina `IFC_OWNER_EMAIL` ou `IFC_OWNER_ID` nas variáveis de ambiente do projeto para uma lista de permissão explícita. Sem papel ou allowlist, as gravações permanecem bloqueadas.

## 14/09/2026 — Plantas PDF e detalhes inferiores

Aba Plantas PDF com busca, filtros e envio de vários arquivos; falhas individuais não interrompem o lote. Detalhes em painel inferior fora da vista 3D. Compartilhamentos carregam somente os PDFs registrados no link. Testes locais de interface e autorização com sessões simuladas passaram; autenticação real depende da ativação do Identity e cadastro do proprietário no painel Netlify.

## 14/09/2026 — Login somente por e-mail e senha

Removido o fluxo e o botão de login com Google. A área do proprietário utiliza somente e-mail e senha do Netlify Identity; o campo de senha é obrigatório. A versão anterior permanece preservada no arquivo `IFC-login-netlify-final.zip`.
