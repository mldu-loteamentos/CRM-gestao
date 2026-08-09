@echo off
echo ========================================================
echo ENVIANDO CORRECOES PARA O GITHUB E VERCEL...
echo ========================================================
git add .
git commit -m "Fix: Atualiza diretorio na Vercel"
git push
echo.
echo ========================================================
echo SUCESSO! A Vercel ja esta atualizando o seu site.
echo Aguarde 30 segundos e atualize a pagina do CRM.
echo ========================================================
pause
