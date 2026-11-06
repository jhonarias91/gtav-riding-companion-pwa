@echo off
cd /d "%~dp0.."
node bridge\start.mjs
if errorlevel 1 pause
