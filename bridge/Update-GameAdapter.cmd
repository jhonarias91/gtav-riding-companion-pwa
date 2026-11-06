@echo off
setlocal
set "ADAPTER_SOURCE=%~dp0..\outputs\game-adapter\GTBikeVCompanion.dll"
set "GAME_DIR=G:\SteamLibrary\steamapps\common\Grand Theft Auto V Enhanced"
if not "%~1"=="" set "GAME_DIR=%~1"
set "ADAPTER_TARGET=%GAME_DIR%\scripts\GTBikeVCompanion.dll"
if not exist "%ADAPTER_SOURCE%" goto missing
if not exist "%GAME_DIR%\scripts\" goto missing
if exist "%ADAPTER_TARGET%" (
    copy /Y "%ADAPTER_TARGET%" "%ADAPTER_TARGET%.%RANDOM%-%RANDOM%.bak" >nul
    if errorlevel 1 goto failed
)
copy /Y "%ADAPTER_SOURCE%" "%ADAPTER_TARGET%" >nul
if errorlevel 1 goto failed
echo Adaptador actualizado correctamente. Inicia GTA V en modo Historia.
exit /b 0
:missing
echo No se encontro el adaptador compilado o la carpeta scripts del juego.
exit /b 1
:failed
echo No se pudo actualizar. Cierra GTA V y revisa los permisos de la carpeta.
exit /b 1
