@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
color 0A
title Eng Gustavo G - Netlify Automatico

rem ============================================================
rem Eng Gustavo G - ONE CLICK
rem Este lancador baixa e executa EXATAMENTE o BAT completo
rem aprovado no Windows e fixado pelo commit abaixo.
rem ============================================================

set "CORE_COMMIT=4876bb72c276d510ea3bc7ae31aea167d8f1b537"
set "CORE_URL=https://raw.githubusercontent.com/gugi321/gugugug/%CORE_COMMIT%/tools/Eng-Gustavo-G-AUTO-NETLIFY.bat"
set "CORE=%TEMP%\Eng-Gustavo-G-AUTO-NETLIFY-CORE.bat"

echo.
echo ============================================================
echo   ENG GUSTAVO G - DEPLOY AUTOMATICO NETLIFY
echo ============================================================
echo.
echo Baixando a versao testada e aprovada...

if exist "%CORE%" del /f /q "%CORE%" >nul 2>&1
powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing '%CORE_URL%' -OutFile '%CORE%'"
if errorlevel 1 goto :download_error
if not exist "%CORE%" goto :download_error
for %%A in ("%CORE%") do if %%~zA LSS 5000 goto :download_error

findstr /C:"REF=b78c59b114506c5e1c22876c4dbd98e2f087404f" "%CORE%" >nul
if errorlevel 1 goto :integrity_error
findstr /C:"npm run test:web-ifc" "%CORE%" >nul
if errorlevel 1 goto :integrity_error
findstr /C:"smoke-web-cad.mjs" "%CORE%" >nul
if errorlevel 1 goto :integrity_error
findstr /C:"netlify-cli@latest deploy --prod" "%CORE%" >nul
if errorlevel 1 goto :integrity_error

echo Versao aprovada conferida. Iniciando build, testes e deploy...
echo.
call "%CORE%"
set "RC=%ERRORLEVEL%"

if not "%RC%"=="0" (
  color 0C
  echo.
  echo O processo foi interrompido por uma falha. Nada posterior a falha foi publicado.
  if /I not "%ENG_GUSTAVO_TEST_ONLY%"=="1" pause
  exit /b %RC%
)

echo.
echo Processo concluido com sucesso.
if /I not "%ENG_GUSTAVO_TEST_ONLY%"=="1" pause
exit /b 0

:download_error
color 0C
echo.
echo ERRO: nao foi possivel baixar a versao aprovada do aplicativo.
echo Verifique a conexao com a internet e tente novamente.
if /I not "%ENG_GUSTAVO_TEST_ONLY%"=="1" pause
exit /b 1

:integrity_error
color 0C
echo.
echo ERRO: o arquivo baixado nao corresponde a versao aprovada.
echo O processo foi bloqueado antes de qualquer deploy.
if /I not "%ENG_GUSTAVO_TEST_ONLY%"=="1" pause
exit /b 1
