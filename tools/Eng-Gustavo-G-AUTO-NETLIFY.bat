@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
color 0A
title Eng Gustavo G - Build, Teste e Deploy Automatico

rem ============================================================
rem Eng Gustavo G - deploy automatico para Netlify
rem Versao fixada no commit aprovado R11.1
rem Em qualquer falha, o processo termina ANTES do deploy.
rem ============================================================

set "APP_NAME=Eng Gustavo G"
set "REPO=gugi321/gugugug"
set "REF=6590720b4b45db2282be2c1fea5a4e12dc7f38f8"
set "NETLIFY_SITE_ID=aab275a5-d207-4472-810a-c8c6cf293f78"
set "NETLIFY_URL=https://eng-gustavogil.netlify.app"
set "WORK=%TEMP%\Eng-Gustavo-G-AutoDeploy"
set "ZIP=%WORK%\source.zip"
set "SRC=%WORK%\src"
set "LOG=%~dp0Eng-Gustavo-G-Netlify-Deploy.log"
set "DWG_URL=https://raw.githubusercontent.com/LibreDWG/libredwg/f860b0fb76d5f8effb5a70769a3389cb1e0308c8/test/test-data/sample_2000.dwg"
set "ERRMSG="

>"%LOG%" echo [%date% %time%] Inicio do deploy automatico %APP_NAME%

call :banner "1/10 - Preparando ambiente"
if exist "%WORK%" rmdir /s /q "%WORK%"
mkdir "%WORK%" >nul 2>&1
if errorlevel 1 (set "ERRMSG=Nao foi possivel criar a pasta temporaria de trabalho." & goto :fatal)
mkdir "%SRC%" >nul 2>&1
if errorlevel 1 (set "ERRMSG=Nao foi possivel criar a pasta temporaria do codigo." & goto :fatal)

call :banner "2/10 - Verificando Node.js e npm"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js nao encontrado. Tentando instalar automaticamente pelo winget...
  where winget >nul 2>&1
  if errorlevel 1 (set "ERRMSG=Node.js nao esta instalado e o winget nao esta disponivel." & goto :fatal)
  winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
  if errorlevel 1 (set "ERRMSG=Falha ao instalar o Node.js pelo winget." & goto :fatal)
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
)

where npm >nul 2>&1
if errorlevel 1 set "PATH=%ProgramFiles%\nodejs;%PATH%"
where npm >nul 2>&1
if errorlevel 1 (set "ERRMSG=npm nao foi localizado mesmo apos a instalacao do Node.js." & goto :fatal)
for /f "delims=" %%V in ('node -v') do set "NODEVER=%%V"
echo Node.js !NODEVER! OK
>>"%LOG%" echo Node.js !NODEVER! OK

call :banner "3/10 - Baixando a versao aprovada R11.1"
set "SRC_URL=https://github.com/%REPO%/archive/%REF%.zip"
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing '%SRC_URL%' -OutFile '%ZIP%'"
if errorlevel 1 (set "ERRMSG=Falha ao baixar o codigo aprovado do GitHub." & goto :fatal)
if not exist "%ZIP%" (set "ERRMSG=O pacote do GitHub nao foi baixado." & goto :fatal)
for %%A in ("%ZIP%") do if %%~zA LSS 10000 (set "ERRMSG=O pacote baixado do GitHub esta vazio ou invalido." & goto :fatal)

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%SRC%' -Force"
if errorlevel 1 (set "ERRMSG=Falha ao extrair o codigo." & goto :fatal)

set "APPDIR="
for /d %%D in ("%SRC%\gugugug-*") do set "APPDIR=%%~fD"
if not defined APPDIR (set "ERRMSG=Pasta do projeto nao encontrada apos a extracao." & goto :fatal)
if not exist "!APPDIR!\package.json" (set "ERRMSG=package.json nao encontrado no codigo baixado." & goto :fatal)
cd /d "!APPDIR!"
if errorlevel 1 (set "ERRMSG=Nao foi possivel entrar na pasta do projeto." & goto :fatal)

call :banner "4/10 - Instalando dependencias"
call npm install --no-audit --no-fund
if errorlevel 1 (set "ERRMSG=Falha no npm install." & goto :fatal)

call :banner "5/10 - Compilando CAD / LibreDWG / WASM"
call npm run build:cad
if errorlevel 1 (set "ERRMSG=Build CAD falhou. Nada sera publicado." & goto :fatal)

node scripts\prepare-pages.mjs
if errorlevel 1 (set "ERRMSG=Preparacao do aplicativo web falhou. Nada sera publicado." & goto :fatal)

if not exist "site\index.html" (set "ERRMSG=index.html final nao foi gerado." & goto :fatal)
if not exist "site\vendor\web-ifc\web-ifc.wasm" (set "ERRMSG=web-ifc.wasm nao foi gerado." & goto :fatal)
if not exist "site\cad\assets\libredwg-web.wasm" (set "ERRMSG=libredwg-web.wasm nao foi gerado." & goto :fatal)
if not exist "site\cad\assets\libredwg-parser-worker.js" (set "ERRMSG=Worker LibreDWG nao foi gerado." & goto :fatal)

rem Cabecalhos Netlify: WASM correto e SEM COOP/COEP para manter web-ifc single-thread estavel.
> site\_headers echo /*
>>site\_headers echo   X-Content-Type-Options: nosniff
>>site\_headers echo   Referrer-Policy: no-referrer
>>site\_headers echo   Permissions-Policy: camera=(), microphone=(), geolocation=()
>>site\_headers echo   Cache-Control: public, max-age=300
>>site\_headers echo /vendor/web-ifc/*.wasm
>>site\_headers echo   Content-Type: application/wasm
>>site\_headers echo   Cache-Control: public, max-age=31536000, immutable
>>site\_headers echo /cad/assets/*.wasm
>>site\_headers echo   Content-Type: application/wasm
>>site\_headers echo   Cache-Control: public, max-age=31536000, immutable

call :banner "6/10 - Verificando Netlify CLI"
call npx --yes netlify-cli@latest --version
if errorlevel 1 (set "ERRMSG=Netlify CLI nao iniciou corretamente." & goto :fatal)
call npx --yes netlify-cli@latest deploy --help >nul
if errorlevel 1 (set "ERRMSG=Comando de deploy do Netlify CLI nao esta disponivel." & goto :fatal)

call :banner "7/10 - Instalando navegadores de teste"
call npx --yes playwright install chromium webkit
if errorlevel 1 (set "ERRMSG=Falha ao preparar Chromium/WebKit para os testes." & goto :fatal)

call :banner "8/10 - Testando IFC em Android/Chromium e iPhone/WebKit"
set "SMOKE_ROOT=site"
call npm run test:web-ifc
if errorlevel 1 (set "ERRMSG=Teste IFC falhou. Deploy cancelado." & goto :fatal)

call :banner "9/10 - Testando DWG real"
if not exist tests mkdir tests
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing '%DWG_URL%' -OutFile 'tests\runtime-sample.dwg'"
if errorlevel 1 (set "ERRMSG=Falha ao baixar o DWG de teste." & goto :fatal)
if not exist tests\runtime-sample.dwg (set "ERRMSG=DWG de teste nao encontrado." & goto :fatal)
for %%A in (tests\runtime-sample.dwg) do if %%~zA LSS 1000 (set "ERRMSG=DWG de teste invalido." & goto :fatal)
set "DWG_FIXTURE=tests\runtime-sample.dwg"
node scripts\smoke-web-cad.mjs
if errorlevel 1 (set "ERRMSG=Teste DWG falhou. Deploy cancelado." & goto :fatal)

echo.
echo TODOS OS TESTES LOCAIS PASSARAM.
>>"%LOG%" echo [%date% %time%] Todos os testes funcionais locais passaram.

if /I "%ENG_GUSTAVO_TEST_ONLY%"=="1" (
  echo Modo de teste CI: deploy real do Netlify foi propositalmente ignorado.
  >>"%LOG%" echo [%date% %time%] Modo de teste CI concluido com sucesso.
  exit /b 0
)

call :banner "10/10 - Autenticando e publicando no Netlify"
echo Site Netlify: %NETLIFY_SITE_ID%
echo.

rem Com NETLIFY_AUTH_TOKEN definido, tudo e silencioso. Sem token, login abre o navegador somente se necessario.
if not defined NETLIFY_AUTH_TOKEN (
  call npx --yes netlify-cli@latest status >nul 2>&1
  if errorlevel 1 (
    echo Primeira autenticacao do Netlify necessaria.
    echo O navegador sera aberto para autorizar esta maquina.
    call npx --yes netlify-cli@latest login
    if errorlevel 1 (set "ERRMSG=Login do Netlify nao concluido." & goto :fatal)
  )
)

call npx --yes netlify-cli@latest deploy --prod --dir=site --site "%NETLIFY_SITE_ID%" --message "Eng Gustavo G R11.1 - deploy automatico aprovado"
if errorlevel 1 (set "ERRMSG=O Netlify recusou o deploy. Confira conta, limite/creditos e permissao do site." & goto :fatal)

call :banner "VALIDACAO POS-DEPLOY"
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $r=Invoke-WebRequest -UseBasicParsing -Uri '%NETLIFY_URL%/?health=%RANDOM%' -Headers @{'Cache-Control'='no-cache'}; if($r.StatusCode -ne 200){throw 'HTTP '+$r.StatusCode}; if($r.Content -notmatch 'Eng Gustavo G'){throw 'Marca esperada nao encontrada na pagina publicada'}"
if errorlevel 1 (set "ERRMSG=Deploy terminou, mas a validacao HTTP do site publicado falhou." & goto :fatal)

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $urls=@('%NETLIFY_URL%/vendor/web-ifc/web-ifc.wasm','%NETLIFY_URL%/cad/assets/libredwg-web.wasm','%NETLIFY_URL%/cad/assets/libredwg-parser-worker.js'); foreach($u in $urls){$r=Invoke-WebRequest -UseBasicParsing -Method Head -Uri $u -Headers @{'Cache-Control'='no-cache'}; if($r.StatusCode -ne 200){throw $u+' -> HTTP '+$r.StatusCode}}"
if errorlevel 1 (set "ERRMSG=Deploy terminou, mas um asset essencial nao responde no Netlify." & goto :fatal)

>>"%LOG%" echo [%date% %time%] DEPLOY E VALIDACAO POS-DEPLOY CONCLUIDOS COM SUCESSO.

echo.
echo ============================================================
echo   SUCESSO - TESTADO, PUBLICADO E VALIDADO NO NETLIFY
echo ============================================================
echo.
echo IFC: aprovado em Chromium/Android e WebKit/iPhone
echo DWG: aprovado com arquivo real via LibreDWG/WASM
echo Netlify CLI: comando de deploy validado
echo Pos-deploy: pagina, IFC WASM, DWG WASM e worker respondendo HTTP 200
echo Build fixo: %REF%
echo.
echo Log: %LOG%
echo.
start "" "%NETLIFY_URL%"
pause
exit /b 0

:banner
echo.
echo ============================================================
echo   %~1
echo ============================================================
>>"%LOG%" echo [%date% %time%] %~1
exit /b 0

:fatal
color 0C
echo.
echo ============================================================
echo   ERRO - PROCESSO INTERROMPIDO
echo   !ERRMSG!
echo ============================================================
>>"%LOG%" echo [%date% %time%] ERRO: !ERRMSG!
echo.
echo Nada novo sera publicado depois desta falha.
echo Log: %LOG%
if /I not "%ENG_GUSTAVO_TEST_ONLY%"=="1" pause
exit /b 1
