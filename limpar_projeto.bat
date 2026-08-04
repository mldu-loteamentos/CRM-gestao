@echo off
echo Criando pasta scripts-antigos...
mkdir scripts-antigos 2>nul

echo Movendo arquivos de teste, correcoes e logs...
move check-*.* scripts-antigos\ >nul 2>&1
move check_*.* scripts-antigos\ >nul 2>&1
move test-*.* scripts-antigos\ >nul 2>&1
move test_*.* scripts-antigos\ >nul 2>&1
move fix-*.* scripts-antigos\ >nul 2>&1
move fix_*.* scripts-antigos\ >nul 2>&1
move refactor*.* scripts-antigos\ >nul 2>&1
move search_*.* scripts-antigos\ >nul 2>&1
move find_*.* scripts-antigos\ >nul 2>&1
move debug-*.* scripts-antigos\ >nul 2>&1
move debug_*.* scripts-antigos\ >nul 2>&1
move diagnostico-*.* scripts-antigos\ >nul 2>&1
move update-*.* scripts-antigos\ >nul 2>&1
move update_*.* scripts-antigos\ >nul 2>&1
move replace_*.* scripts-antigos\ >nul 2>&1
move replace.* scripts-antigos\ >nul 2>&1
move restore-*.* scripts-antigos\ >nul 2>&1
move git-restore.js scripts-antigos\ >nul 2>&1
move patch_*.* scripts-antigos\ >nul 2>&1
move super_clean.js scripts-antigos\ >nul 2>&1
move remove-*.* scripts-antigos\ >nul 2>&1
move app.js.bak scripts-antigos\ >nul 2>&1
move app-test4.js scripts-antigos\ >nul 2>&1
move copy_app.py scripts-antigos\ >nul 2>&1
move valida_*.html scripts-antigos\ >nul 2>&1
move relatorio-*.html scripts-antigos\ >nul 2>&1
move score_search.txt scripts-antigos\ >nul 2>&1
move syntax_check.txt scripts-antigos\ >nul 2>&1
move VERIFICAR_PERMISSOES.txt scripts-antigos\ >nul 2>&1
move subjudice_search.txt scripts-antigos\ >nul 2>&1
move read-render-files.js scripts-antigos\ >nul 2>&1
move fetch_api.js scripts-antigos\ >nul 2>&1
move sim-match.js scripts-antigos\ >nul 2>&1
move swap-buttons.js scripts-antigos\ >nul 2>&1
move write-empresas*.js scripts-antigos\ >nul 2>&1
move unbreak-index.js scripts-antigos\ >nul 2>&1
move move-banner.js scripts-antigos\ >nul 2>&1
move move-data-global.js scripts-antigos\ >nul 2>&1
move inject-empresas-routes.js scripts-antigos\ >nul 2>&1
move final-fixes.js scripts-antigos\ >nul 2>&1
move compare.js scripts-antigos\ >nul 2>&1
move copy.js scripts-antigos\ >nul 2>&1
move create_fixed_app.ps1 scripts-antigos\ >nul 2>&1
move extract_func.ps1 scripts-antigos\ >nul 2>&1
move fast_replace.ps1 scripts-antigos\ >nul 2>&1
move final_replace.ps1 scripts-antigos\ >nul 2>&1
move recover_app.ps1 scripts-antigos\ >nul 2>&1

echo.
echo Limpeza concluída! 
echo A pasta do projeto agora contem apenas os arquivos essenciais.
echo O .gitignore ja foi criado para impedir envio do node_modules.
echo Pode fechar esta janela e publicar no GitHub!
echo.
pause
