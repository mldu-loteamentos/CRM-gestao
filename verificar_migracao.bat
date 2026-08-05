@echo off
echo Instalando a biblioteca do Firebase (isso pode demorar alguns segundos)...
call npm install firebase
echo.
echo Verificando dados no Firebase...
node check-firebase.js
echo.
pause
