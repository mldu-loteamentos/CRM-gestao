@echo off
title GERADOR DE CACHE - CRM MOURA LEITE
echo =======================================================
echo          GERANDO CACHE DIARIO NA NUVEM
echo =======================================================
echo.
echo Iniciando o servidor local para gerar o cache...
start "Servidor" cmd /c "node server.js"
echo.
echo Abrindo o navegador...
timeout /t 3 >nul
start http://localhost:3000
echo.
echo =======================================================
echo PASSO A PASSO:
echo 1. O navegador abriu no http://localhost:3000
echo 2. Acesse a tela de inadimplentes e espere carregar TUDO (pode levar 1 a 2 minutos)
echo 3. Quando a tabela aparecer pronta, o cache foi enviado para a Vercel!
echo 4. Pode fechar esta tela preta e o navegador local.
echo 5. Teste a Vercel (F5)! Ela vai estar instantanea.
echo =======================================================
pause
