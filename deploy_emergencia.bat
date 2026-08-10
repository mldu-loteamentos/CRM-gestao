@echo off
setlocal enabledelayedexpansion

echo.
echo ========================================================
echo   DEPLOY DE EMERGENCIA - USA VERCEL CLI DIRETAMENTE
echo   Use apenas se o deploy.bat nao funcionar
echo ========================================================
echo.
echo ATENCAO: Este metodo faz login na Vercel e envia os
echo arquivos diretamente, SEM passar pelo GitHub.
echo Use apenas em emergencias.
echo.
pause

call npx vercel login
echo.
echo ATENCAO: Responda as perguntas da Vercel apertando ENTER
rmdir /s /q .vercel 2>nul
call npx vercel --prod

echo.
echo ========================================================
echo   ATENCAO: Este deploy NAO cria tag no GitHub e
echo   NAO incrementa a versao. Faca um deploy.bat depois
echo   quando o problema estiver resolvido.
echo ========================================================
echo.
pause
