@echo off
echo Instalando a biblioteca do Firebase (isso pode demorar alguns segundos)...
call npm install firebase
echo.
echo Iniciando a migracao da base local para a nuvem...
node migrate-to-firebase.js
echo.
pause
