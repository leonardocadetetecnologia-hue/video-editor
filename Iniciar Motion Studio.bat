@echo off
chcp 65001 >nul
title Motion Studio
cd /d "%~dp0motion-studio"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale em https://nodejs.org ^(versao 22 ou superior^) e tente de novo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalando dependencias ^(apenas na primeira vez^)...
  call npm install || goto :erro
)

echo Preparando o Motion Studio...
call npm run build || goto :erro

echo.
echo Motion Studio rodando em http://localhost:3000  ^(feche esta janela para encerrar^)
start "" http://localhost:3000
call npm start
exit /b 0

:erro
echo.
echo Algo deu errado. Copie a mensagem acima e peca ajuda ao Claude Code.
pause
exit /b 1
