@echo off
cd /d "%~dp0"
title Moura Leite - CRM Servidor Proxy Sienge
echo Iniciando o servidor de proxy local usando Node.js...
echo.
node server.js
if %errorlevel% neq 0 (
    echo.
    echo Erro ao iniciar o servidor. Certifique-se de que a porta 3000 nao esta ocupada.
)
pause
