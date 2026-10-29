#!/usr/bin/env bash
# Motion Studio — inicia no macOS/Linux (no Windows use "Iniciar Motion Studio.bat")
set -e
cd "$(dirname "$0")/motion-studio"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Instale a versão 22.13 ou superior em https://nodejs.org"
  exit 1
fi

[ -d node_modules ] || npm install
echo "Preparando o Motion Studio…"
npm run build
echo "Motion Studio rodando em http://localhost:3000 (Ctrl+C para encerrar)"
( sleep 3; (command -v open >/dev/null && open http://localhost:3000) || (command -v xdg-open >/dev/null && xdg-open http://localhost:3000) || true ) &
npm start
