@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
color 0A
title Eng Gustavo G - Build, Teste e Deploy Automatico

rem ============================================================
rem Eng Gustavo G - deploy automatico para Netlify
rem Versao fixada no commit aprovado R11.1
rem ============================================================

set "APP_NAME=Eng Gustavo G"
set "REPO=gugi321/gugugug"
set "REF=6590720b4b45db2282be2c1fea5a4e12dc7f38f8"
set "NETLIFY_SITE_ID=aab275a5-d207-4472-810a-c8c6cf293f78"
set "WORK=%TEMP%\Eng-Gustavo-G-AutoDeploy"
set "ZIP=%WORK%\source.zip"
set "SRC=%WORK%\src"
set "LOG=%USERPROFILE%\Desktop\Eng-Gustavo-G-Netlify-Deploy.log"
set "DWG_URL=https://raw.githubusercontent.com/LibreDWG/libredwg/f860b0fb76d5f8effb5a70769a3389cb1e0308c8/test/test-data/sample_2000.dwg"

>"%LOG%" echo [%date% %time%] Inicio do deploy automatico %APP_NAME%

call :banner "1/9 - Preparando ambiente"
if exist "%WORK%" rmdir /s /q "%WORK%"
mkdir "%WORK%" >nul 2>&1
mkdir "%SRC%" >nul 2>&1

call :banner "2/9 - Verificando Node.js"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js nao encontrado. Tentando instalar automaticamente pelo winget...
  where winget >nul 2>&1
  if errorlevel 1 (
    call :fail "Node.js nao esta instalado e o winget nao esta disponivel."
  )
  winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements
  if errorlevel 1 call :fail "Falha ao instalar o Node.js."
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
)

where npm >nul 2>&1
if errorlevel 1 set "PATH=%ProgramFiles%\nodejs;%PATH%"
where npm >nul 2>&1
if errorlevel 1 call :fail "npm nao foi localizado mesmo apos a instalacao do Node.js."

for /f "delims=" %%V in ('node -v') do set "NODEVER=%%V"
echo Node.js !NODEVER! OK
>>"%LOG%" echo Node.js !NODEVER! OK

call :banner "3/9 - Baixando a versao aprovada R11.1"
set "SRC_URL=https://github.com/%REPO%/archive/%REF%.zip"
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing '%SRC_URL%' -OutFile '%ZIP%'"
if errorlevel 1 call :fail "Falha ao baixar o codigo aprovado do GitHub."
if not exist "%ZIP%" call :fail "O pacote do GitHub nao foi baixado."

powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%SRC%' -Force"
if errorlevel 1 call :fail "Falha ao extrair o codigo."

for /d %%D in ("%SRC%\gugugug-*") do set "APPDIR=%%~fD"
if not defined APPDIR call :fail "Pasta do projeto nao encontrada apos a extracao."
cd /d "%APPDIR%"

call :banner "4/9 - Instalando dependencias"
call npm install --no-audit --no-fund
if errorlevel 1 call :fail "Falha no npm install."

call :banner "5/9 - Compilando CAD / LibreDWG / WASM"
call npm run build:cad
if errorlevel 1 call :fail "Build CAD falhou. Nada sera publicado."

node scripts\prepare-pages.mjs
if errorlevel 1 call :fail "Preparacao do aplicativo web falhou. Nada sera publicado."

rem Cabecalhos para deploy estatico no Netlify, sem habilitar COOP/COEP.
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

call :banner "6/9 - Instalando navegadores de teste"
call npx --yes playwright install chromium webkit
if errorlevel 1 call :fail "Falha ao preparar Chromium/WebKit para os testes."

call :banner "7/9 - Testando IFC em Android/Chromium e iPhone/WebKit"
set "SMOKE_ROOT=site"
call npm run test:web-ifc
if errorlevel 1 call :fail "Teste IFC falhou. Deploy cancelado."

call :banner "8/9 - Testando DWG real"
if not exist tests mkdir tests
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing '%DWG_URL%' -OutFile 'tests\runtime-sample.dwg'"
if errorlevel 1 call :fail "Falha ao baixar o DWG de teste."
if not exist tests\runtime-sample.dwg call :fail "DWG de teste nao encontrado."
for %%A in (tests\runtime-sample.dwg) do if %%~zA LSS 1000 call :fail "DWG de teste invalido."
set "DWG_FIXTURE=tests\runtime-sample.dwg"
node scripts\smoke-web-cad.mjs
if errorlevel 1 call :fail "Teste DWG falhou. Deploy cancelado."

echo.
echo TODOS OS TESTES PASSARAM.
>>"%LOG%" echo [%date% %time%] Todos os testes funcionais passaram.

if /I "%ENG_GUSTAVO_TEST_ONLY%"=="1" (
  echo Modo de teste: deploy Netlify foi propositalmente ignorado.
  >>"%LOG%" echo [%date% %time%] Modo de teste concluido com sucesso.
  exit /b 0
)

call :banner "9/9 - Publicando no Netlify"
echo Site Netlify: %NETLIFY_SITE_ID%
echo.

rem Se NETLIFY_AUTH_TOKEN existir, o processo e 100%% nao-interativo.
rem Caso contrario, o Netlify pode abrir o navegador apenas na primeira autenticacao.
if not defined NETLIFY_AUTH_TOKEN (
  call npx --yes netlify-cli@latest status >nul 2>&1
  if errorlevel 1 (
    echo Primeira autenticacao do Netlify necessaria.
    echo O navegador sera aberto para voce autorizar esta maquina uma unica vez.
    call npx --yes netlify-cli@latest login
    if errorlevel 1 call :fail "Login do Netlify nao concluido."
  )
)

call npx --yes netlify-cli@latest deploy --prod --dir=site --site "%NETLIFY_SITE_ID%" --message "Eng Gustavo G R11.1 - deploy automatico aprovado"
if errorlevel 1 call :fail "O Netlify recusou o deploy. Confira conta, limite/creditos e permissao do site."

>>"%LOG%" echo [%date% %time%] DEPLOY CONCLUIDO COM SUCESSO.

echo.
echo ============================================================
echo   SUCESSO - APLICATIVO TESTADO E PUBLICADO NO NETLIFY
echo ============================================================
echo.
echo IFC: aprovado em Chromium/Android e WebKit/iPhone
echo DWG: aprovado com arquivo real via LibreDWG/WASM
echo Build: commit fixo %REF%
echo.
echo Log: %LOG%
echo.
start "" "https://eng-gustavogil.netlify.app"
pause
exit /b 0

:banner
echo.
echo ============================================================
echo   %~1
echo ============================================================
>>"%LOG%" echo [%date% %time%] %~1
exit /b 0

:fail
echo.
color 0C
echo ============================================================
echo   ERRO - PROCESSO INTERROMPIDO
echo   %~1
echo ============================================================
>>"%LOG%" echo [%date% %time%] ERRO: %~1
echo.
echo Nada novo foi publicado depois desta falha.
echo Log: %LOG%
pause
exit /b 1
