@echo off
echo ========================================================
echo PREPARANDO O SISTEMA... (Isso pode levar alguns segundos)
echo ========================================================
call npm install firebase --no-save
echo.
echo ========================================================
echo INICIANDO UPLOAD DAS REGRAS PARA A NUVEM...
echo ========================================================
node upload_config.js
echo.
echo ========================================================
echo FIM DO PROCESSO. SE APARECEU SUCESSO ACIMA, TUDO CERTO!
echo ========================================================
pause
