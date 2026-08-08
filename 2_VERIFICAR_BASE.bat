@echo off
echo ==============================================================
echo VERIFICADOR DE SINCRONIZACAO COM O FIREBASE
echo ==============================================================
echo.
echo Este script vai checar se os 15.000 clientes (do ID 1 ao 15496)
echo estao devidamente salvos no Firebase.
echo.
echo Pressione qualquer tecla para verificar...
pause >nul
echo.
node verify_firebase.js
echo.
echo Pressione qualquer tecla para fechar esta janela...
pause >nul
