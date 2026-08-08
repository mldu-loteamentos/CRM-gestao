@echo off
echo ==============================================================
echo SCRIPT DE DOWNLOAD COMPLETO DA BASE DE CLIENTES (SIENGE)
echo ==============================================================
echo.
echo Este script vai baixar os cerca de 11.000 clientes do Sienge
echo e salvar diretamente no seu Firebase. Isso pode demorar alguns minutos.
echo.
echo Pressione qualquer tecla para iniciar o download...
pause >nul
echo.
node download_full_base.js
echo.
echo Pressione qualquer tecla para fechar esta janela...
pause >nul
