@echo off
echo ========================================================
echo ENVIANDO ARQUIVOS DIRETAMENTE PARA A VERCEL...
echo 1. O sistema vai pedir para voce fazer o Login na Vercel (se necessario).
echo 2. Siga as instrucoes na tela para autenticar.
echo ========================================================
call npx vercel login
echo.
echo ATENCAO: Responda as perguntas da Vercel apertando ENTER (ou Y para sim)
rmdir /s /q .vercel 2>nul
call npx vercel --prod
echo SUCESSO! A Vercel deve ter atualizado o seu site.
echo Va no navegador e aperte CTRL+F5.
echo ========================================================
pause
