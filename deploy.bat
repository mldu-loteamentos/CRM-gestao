@echo off
setlocal enabledelayedexpansion

echo.
echo ========================================================
echo   DEPLOY AUTOMATICO - CRM MOURA LEITE
echo ========================================================
echo.

REM --- 1) INCREMENTA VERSAO NO INDEX.HTML ---
echo [1/5] Incrementando versao no index.html...
for /f "tokens=*" %%v in ('powershell -NoProfile -ExecutionPolicy Bypass -File "_version_bump.ps1"') do set NEW_VER=%%v

if "!NEW_VER!"=="" (
    echo.
    echo [ERRO] Nao foi possivel ler a versao do index.html.
    echo        Verifique se _version_bump.ps1 esta na mesma pasta.
    pause
    exit /b 1
)

for /f "tokens=*" %%d in ('powershell -NoProfile -Command "Get-Date -Format 'dd/MM/yyyy'"') do set TODAY=%%d

echo       OK - Nova versao: v!NEW_VER! (!TODAY!)
echo.

REM --- 2) GIT ADD + COMMIT ---
echo [2/5] Registrando alteracoes no Git...
if exist "assets\pets" (
    echo       Incluindo todos os arquivos novos da pasta assets\pets...
    git add "assets/pets"
)
git add .
git commit -m "v!NEW_VER! - !TODAY!"
echo       OK - Commit criado
echo.

REM --- 3) CRIA TAG LOCAL ---
echo [3/5] Criando tag v!NEW_VER! no repositorio local...
git tag -a "v!NEW_VER!" -m "Versao !NEW_VER! - !TODAY!"
echo       OK - Tag v!NEW_VER! criada
echo.

REM --- 4) ENVIA COMMITS PARA O GITHUB ---
echo [4/5] Enviando commits para o GitHub...
git push
echo       OK - Commits enviados
echo.

REM --- 5) ENVIA TAGS PARA O GITHUB ---
echo [5/5] Enviando tags para o GitHub...
git push --tags
echo       OK - Tags enviadas
echo.

echo ========================================================
echo   SUCESSO! v!NEW_VER! publicada no GitHub e Vercel
echo.
echo   Ver versoes: seu repositorio GitHub - Tags
echo   Aguarde ~30s e atualize a pagina do CRM.
echo ========================================================
echo.
pause
