@echo off
echo =======================================================
echo          MOURA LEITE CRM - DEPLOY PARA VERCEL
echo =======================================================
echo.
echo Adicionando alteracoes (sienge-api.js, vercel.json)...
git add .

echo.
echo Criando o Commit...
git commit -m "Fix CORS e Vercel Timeout (Atualizar Fila Vercel)"

echo.
echo Enviando para a Vercel (Push)...
git push

echo.
echo =======================================================
echo PRONTO! AS ALTERACOES FORAM ENVIADAS COM SUCESSO.
echo A Vercel vai compilar agora. Aguarde uns 2 minutinhos 
echo e teste novamente apertando F5 na pagina!
echo =======================================================
pause
